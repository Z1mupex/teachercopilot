alter table public.grading_batches add column grading_started_at timestamptz;
alter table public.submissions
  add column grading_attempt_id uuid,
  add column grading_lease_until timestamptz,
  add column grading_error text check (char_length(grading_error) <= 500);

-- Authoritative values can change only through the ownership-scoped workflow.
create function private.guard_grading_workflow() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare started timestamptz;
begin
  if current_setting('private.grading_workflow', true) = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_table_name = 'grading_batches' then
    if tg_op = 'INSERT' then
      if new.grading_started_at is not null then raise exception 'Use grading workflow' using errcode='PT409'; end if;
      return new;
    end if;
    if tg_op = 'UPDATE' and (new.grading_started_at is distinct from old.grading_started_at
      or (old.grading_started_at is not null and (new.status, new.processed_submissions, new.total_submissions) is distinct from (old.status, old.processed_submissions, old.total_submissions))) then
      raise exception 'Use grading workflow' using errcode='PT409';
    end if;
  elsif tg_table_name = 'submissions' then
    select b.grading_started_at into started from public.grading_batches b where b.id = case when tg_op='DELETE' then old.batch_id else new.batch_id end;
    if started is not null then raise exception 'Use grading workflow' using errcode='PT409'; end if;
  else
    select b.grading_started_at into started from public.grading_batches b join public.submissions s on s.batch_id=b.id where s.id=case when tg_op='DELETE' then old.submission_id else new.submission_id end;
    if started is not null then raise exception 'Use grading workflow' using errcode='PT409'; end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
create trigger grading_batch_workflow before insert or update on public.grading_batches for each row execute function private.guard_grading_workflow();
create trigger submission_workflow before insert or update or delete on public.submissions for each row execute function private.guard_grading_workflow();
create trigger answer_workflow before insert or update or delete on public.submission_answers for each row execute function private.guard_grading_workflow();
create trigger page_workflow before insert or update or delete on public.submission_pages for each row execute function private.guard_grading_workflow();

create function public.claim_grading_submission(p_batch uuid, p_submission uuid, p_variant uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare b public.grading_batches; s public.submissions; token uuid := gen_random_uuid();
begin
  select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if b.answer_key_confirmed_at is null or b.status not in ('ready','processing','review') then raise exception 'Confirm answer key first' using errcode='PT409'; end if;
  select * into s from public.submissions where id=p_submission and batch_id=b.id for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if s.status not in ('uploaded','failed','processing') or (s.status='processing' and s.grading_lease_until > clock_timestamp()) then raise exception 'Already processed or running' using errcode='PT409'; end if;
  if (select count(*) from public.submissions where batch_id=b.id and status='processing' and grading_lease_until > clock_timestamp()) >= 2 then raise exception 'Two jobs already running' using errcode='PT429'; end if;
  if p_variant is not null and not exists(select 1 from public.worksheet_variants where id=p_variant and worksheet_id=b.answer_key_worksheet_id) then raise exception 'Invalid variant' using errcode='PT422'; end if;
  if not exists(select 1 from public.questions where worksheet_id=b.answer_key_worksheet_id and variant_id is not distinct from p_variant) then raise exception 'Empty key' using errcode='PT422'; end if;
  if (select count(*) from public.submission_pages where submission_id=s.id) <> 1 or not exists(
    select 1 from public.submission_pages p join storage.objects o on o.name=p.storage_path and o.bucket_id='submission-files'
    where p.submission_id=s.id and p.upload_status='stored') then raise exception 'Page not stored' using errcode='PT409'; end if;
  perform set_config('private.grading_workflow','on',true);
  update public.grading_batches set grading_started_at=coalesce(grading_started_at,clock_timestamp()),status='processing' where id=b.id;
  update public.submissions set status='processing',variant_id=p_variant,grading_attempt_id=token,grading_lease_until=clock_timestamp()+interval '180 seconds',grading_error=null where id=s.id;
  perform set_config('private.grading_workflow','off',true);
  return token;
end; $$;

create function public.finish_grading_submission(p_batch uuid, p_submission uuid, p_attempt uuid, p_answers jsonb, p_student_name text)
returns void language plpgsql security invoker set search_path = '' as $$
declare b public.grading_batches; s public.submissions; a jsonb; q public.questions; needs boolean := false; n integer;
begin
  select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  select * into s from public.submissions where id=p_submission and batch_id=b.id for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if s.grading_attempt_id=p_attempt and s.status in ('proposed','needs_review') then return; end if;
  if s.status<>'processing' or s.grading_attempt_id is distinct from p_attempt or s.grading_lease_until <= clock_timestamp() then raise exception 'Expired attempt' using errcode='PT409'; end if;
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) not between 1 and 100 or char_length(coalesce(p_student_name,''))>160 then raise exception 'Invalid results' using errcode='PT422'; end if;
  select count(*) into n from public.questions where worksheet_id=b.answer_key_worksheet_id and variant_id is not distinct from s.variant_id;
  if n<>jsonb_array_length(p_answers) or (select count(distinct x->>'question_id') from jsonb_array_elements(p_answers) x)<>n then raise exception 'Incomplete results' using errcode='PT422'; end if;
  perform set_config('private.grading_workflow','on',true);
  for a in select value from jsonb_array_elements(p_answers) loop
    select * into q from public.questions where id=(a->>'question_id')::uuid and worksheet_id=b.answer_key_worksheet_id and variant_id is not distinct from s.variant_id;
    if not found or (a->>'proposed_score')::numeric not between 0 and q.max_score or (a->>'confidence')::numeric not between 0 and 1
      or a->>'review_status' not in ('auto_accepted','needs_review') or a->>'explanation' is null or char_length(a->>'explanation')>500
      or a->>'proposed_score' is null or a->>'confidence' is null then raise exception 'Invalid answer' using errcode='PT422'; end if;
    -- Open answers and flagged/low-confidence answers cannot bypass review.
    if a->>'review_status'='auto_accepted' and (q.type='open_response' or (a->>'confidence')::numeric<0.95 or jsonb_typeof(a->'flags') is distinct from 'array' or jsonb_array_length(a->'flags')<>0) then raise exception 'Review required' using errcode='PT422'; end if;
    needs := needs or a->>'review_status'='needs_review';
    insert into public.submission_answers(submission_id,question_id,recognized_answer,proposed_score,final_score,confidence,reasoning_summary,review_status)
    values(s.id,q.id,jsonb_build_object('text',a->'text','choice_ids',a->'choice_ids','flags',a->'flags','crop',a->'crop'),(a->>'proposed_score')::numeric,
      case when a->>'review_status'='auto_accepted' then (a->>'proposed_score')::numeric else null end,(a->>'confidence')::numeric,a->>'explanation',(a->>'review_status'));
  end loop;
  update public.submissions set status=case when needs then 'needs_review' else 'proposed' end,student_name=nullif(btrim(p_student_name),''),grading_lease_until=null,
    proposed_score=(select sum(proposed_score) from public.submission_answers where submission_id=s.id),
    max_score=(select sum(max_score) from public.questions where worksheet_id=b.answer_key_worksheet_id and variant_id is not distinct from s.variant_id) where id=s.id;
  update public.grading_batches set processed_submissions=(select count(*) from public.submissions where batch_id=b.id and status in ('proposed','needs_review','completed')),
    status=case when exists(select 1 from public.submissions where batch_id=b.id and status in ('uploaded','processing','failed')) then 'processing' else 'review' end where id=b.id;
  perform set_config('private.grading_workflow','off',true);
end; $$;

create function public.fail_grading_submission(p_batch uuid,p_submission uuid,p_attempt uuid,p_error text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  perform set_config('private.grading_workflow','on',true);
  update public.submissions set status='failed',grading_error=left(p_error,500),grading_lease_until=null where id=p_submission and batch_id=p_batch and status='processing' and grading_attempt_id=p_attempt;
  perform set_config('private.grading_workflow','off',true);
end; $$;

create function public.review_grading_answer(p_batch uuid,p_answer uuid,p_revision timestamptz,p_command text,p_score numeric default null)
returns void language plpgsql security invoker set search_path='' as $$
declare b public.grading_batches; a public.submission_answers; sid uuid; maximum numeric; score numeric;
begin
  select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if b.grading_started_at is null or b.status='completed' then raise exception 'Review closed' using errcode='PT409'; end if;
  select s.id into sid from public.submissions s join public.submission_answers x on x.submission_id=s.id where x.id=p_answer and s.batch_id=b.id;
  if sid is null then raise exception 'Not found' using errcode='PT404'; end if;
  perform 1 from public.submissions where id=sid for update;
  select * into a from public.submission_answers where id=p_answer for update;
  if a.updated_at is distinct from p_revision then raise exception 'Answer changed' using errcode='PT412'; end if;
  select max_score into maximum from public.questions where id=a.question_id;
  score := case p_command when 'confirm' then a.proposed_score when 'unreadable' then 0 when 'score' then p_score else null end;
  if score is null or score::text in ('NaN','Infinity','-Infinity') or score not between 0 and maximum then raise exception 'Invalid score' using errcode='PT422'; end if;
  perform set_config('private.grading_workflow','on',true);
  update public.submission_answers set final_score=score,review_status=case when p_command='confirm' then 'teacher_confirmed' else 'teacher_changed' end,
    recognized_answer=case when p_command='unreadable' then jsonb_set(recognized_answer,'{teacher_unreadable}','true'::jsonb) else recognized_answer - 'teacher_unreadable' end where id=a.id;
  update public.submissions set final_score=(select sum(final_score) from public.submission_answers where submission_id=sid),
    status=case when exists(select 1 from public.submission_answers where submission_id=sid and review_status='needs_review') then 'needs_review' else 'proposed' end where id=sid;
  perform set_config('private.grading_workflow','off',true);
end; $$;

create function public.finalize_grading_batch(p_batch uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare b public.grading_batches; s public.submissions; expected integer;
begin
  select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if b.status='completed' then return; end if;
  if b.grading_started_at is null or not exists(select 1 from public.submissions where batch_id=b.id) then raise exception 'Nothing to finalize' using errcode='PT409'; end if;
  perform set_config('private.grading_workflow','on',true);
  for s in select * from public.submissions where batch_id=b.id order by id for update loop
    select count(*) into expected from public.questions where worksheet_id=b.answer_key_worksheet_id and variant_id is not distinct from s.variant_id;
    if s.status not in ('proposed','needs_review') or expected=0 or (select count(*) from public.submission_answers where submission_id=s.id)<>expected
      or exists(select 1 from public.submission_answers where submission_id=s.id and (review_status='needs_review' or final_score is null)) then raise exception 'Review unfinished' using errcode='PT409'; end if;
    update public.submissions set final_score=(select sum(final_score) from public.submission_answers where submission_id=s.id),
      max_score=(select sum(q.max_score) from public.submission_answers a join public.questions q on q.id=a.question_id where a.submission_id=s.id),status='completed' where id=s.id;
  end loop;
  update public.grading_batches set status='completed',processed_submissions=total_submissions where id=b.id;
  perform set_config('private.grading_workflow','off',true);
end; $$;

revoke all on function public.claim_grading_submission(uuid,uuid,uuid),public.finish_grading_submission(uuid,uuid,uuid,jsonb,text),public.fail_grading_submission(uuid,uuid,uuid,text),public.review_grading_answer(uuid,uuid,timestamptz,text,numeric),public.finalize_grading_batch(uuid) from public,anon;
grant execute on function public.claim_grading_submission(uuid,uuid,uuid),public.finish_grading_submission(uuid,uuid,uuid,jsonb,text),public.fail_grading_submission(uuid,uuid,uuid,text),public.review_grading_answer(uuid,uuid,timestamptz,text,numeric),public.finalize_grading_batch(uuid) to authenticated;

create or replace function public.reserve_ai_run(p_model text,p_purpose text,p_input_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); run_id uuid; running integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 100 or p_purpose is null
    or p_purpose not in ('worksheet_generation','question_regeneration','answer_key_parsing','submission_grading')
    or p_input_hash is null or p_input_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid AI reservation' using errcode='PT422'; end if;
  perform 1 from public.profiles where id=actor for update;
  if not found then raise exception 'Authentication required' using errcode='28000'; end if;
  select count(*) into running from public.ai_runs where teacher_id=actor and status='running' and created_at>clock_timestamp()-interval '180 seconds';
  if running >= (case when p_purpose='submission_grading' then 2 else 1 end) then raise exception 'ai_request_in_progress' using errcode='PT429'; end if;
  if (select count(*) from private.ai_request_reservations where teacher_id=actor and created_at>clock_timestamp()-interval '1 hour') >= (case when p_purpose='submission_grading' then 60 else 20 end) then raise exception 'ai_hourly_limit' using errcode='PT429'; end if;
  insert into public.ai_runs(teacher_id,purpose,model,input_hash,status) values(actor,p_purpose,p_model,p_input_hash,'running') returning id into run_id;
  insert into private.ai_request_reservations(id,teacher_id) values(run_id,actor);
  return run_id;
end; $$;

