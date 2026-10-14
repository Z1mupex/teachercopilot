-- Explicit per-batch autonomy, fixed on first claim. Existing started batches keep
-- their prior comparison policy. No security-definer or service-role client.
create function private.valid_grading_autonomy(p jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare k text; mode text;
begin
  if jsonb_typeof(p) is distinct from 'object' or (select count(*) from jsonb_object_keys(p))<>9 then return false; end if;
  foreach k in array array['auto_confirm','auto_confirm_ai','auto_confirm_open','fraction_equivalence','ignore_case','typo_tolerance'] loop
    if jsonb_typeof(p->k) is distinct from 'boolean' then return false; end if;
  end loop;
  mode:=p->>'mode';
  if mode is null or mode not in ('careful','balanced','fast','custom') or jsonb_typeof(p->'confidence_threshold') is distinct from 'number' or (p->>'confidence_threshold')::numeric not between 0.5 and 1 then return false; end if;
  if not (p ? 'rounding_digits') or (p->'rounding_digits'<>'null'::jsonb and (jsonb_typeof(p->'rounding_digits')<>'number' or (p->>'rounding_digits')::numeric not between 0 and 8 or (p->>'rounding_digits')::numeric<>trunc((p->>'rounding_digits')::numeric))) then return false; end if;
  if (not (p->>'auto_confirm')::boolean and ((p->>'auto_confirm_ai')::boolean or (p->>'auto_confirm_open')::boolean)) or ((p->>'auto_confirm_open')::boolean and not (p->>'auto_confirm_ai')::boolean) then return false; end if;
  if mode<>'custom' and (not (p->>'auto_confirm')::boolean or (p->>'auto_confirm_ai')::boolean<>(mode<>'careful') or (p->>'auto_confirm_open')::boolean<>(mode='fast') or (p->>'confidence_threshold')::numeric<>case when mode='fast' then 0.90 else 0.95 end) then return false; end if;
  return true;
end; $$;
revoke all on function private.valid_grading_autonomy(jsonb) from public,anon,service_role;
grant execute on function private.valid_grading_autonomy(jsonb) to authenticated;
alter table public.grading_batches add column autonomy_config jsonb check(autonomy_config is null or private.valid_grading_autonomy(autonomy_config));
create function private.guard_autonomy_config() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (tg_op='INSERT' and new.autonomy_config is not null) or (tg_op='UPDATE' and new.autonomy_config is distinct from old.autonomy_config and (old.grading_started_at is not null or current_setting('private.autonomy_config',true) is distinct from 'on')) then raise exception 'Use autonomy configuration workflow' using errcode='PT409'; end if;
  return new;
end; $$;
create trigger guard_autonomy_config before insert or update on public.grading_batches for each row execute function private.guard_autonomy_config();
revoke all on function private.guard_autonomy_config() from public,anon,authenticated,service_role;
create function public.configure_grading_autonomy(p_batch uuid,p_revision timestamptz,p_preferences jsonb,p_acknowledged boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare b public.grading_batches;
begin
  select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if b.updated_at is distinct from p_revision then raise exception 'Batch changed' using errcode='PT412'; end if;
  if b.grading_started_at is not null or b.status<>'ready' then raise exception 'Policy already fixed' using errcode='PT409'; end if;
  if p_acknowledged is distinct from true or not private.valid_grading_autonomy(p_preferences) then raise exception 'Confirm autonomy rules' using errcode='PT422'; end if;
  perform set_config('private.autonomy_config','on',true);
  update public.grading_batches set autonomy_config=p_preferences where id=b.id;
  perform set_config('private.autonomy_config','off',true);
end; $$;
revoke all on function public.configure_grading_autonomy(uuid,timestamptz,jsonb,boolean) from public,anon,service_role;
grant execute on function public.configure_grading_autonomy(uuid,timestamptz,jsonb,boolean) to authenticated;

create function private.bulk_confirmable(a public.submission_answers) returns boolean
language sql immutable security invoker set search_path='' as $$
  select coalesce(a.review_status in ('needs_review','auto_accepted') and a.proposed_score is not null
    and a.recognized_answer->'teacher_unreadable' is distinct from 'true'::jsonb
    and (nullif(btrim(a.recognized_answer->>'text'),'') is not null or case when jsonb_typeof(a.recognized_answer->'choice_ids')='array' then jsonb_array_length(a.recognized_answer->'choice_ids')>0 else false end)
    and case when jsonb_typeof(a.recognized_answer->'flags')='array' then not exists(select 1 from jsonb_array_elements_text(a.recognized_answer->'flags') f where f not in ('low_confidence','ai_judgment','open_response','comparison_mismatch')) else false end,false);
$$;
revoke all on function private.bulk_confirmable(public.submission_answers) from public,anon,service_role;
grant execute on function private.bulk_confirmable(public.submission_answers) to authenticated;
create function public.review_grading_answers(p_batch uuid,p_submission uuid,p_answers jsonb,p_whole_paper boolean) returns integer
language plpgsql security invoker set search_path='' as $$
declare b public.grading_batches; s public.submissions; entry jsonb; a public.submission_answers; n integer; ids uuid[];
begin
  select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if b.grading_started_at is null or b.status='completed' then raise exception 'Review closed' using errcode='PT409'; end if;
  select * into s from public.submissions where id=p_submission and batch_id=b.id for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if s.status not in ('proposed','needs_review') then raise exception 'Paper not ready' using errcode='PT409'; end if;
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) not between 1 and 100 or p_whole_paper is null then raise exception 'Invalid selection' using errcode='PT422'; end if;
  n:=jsonb_array_length(p_answers);
  select array_agg((e->>'id')::uuid) into ids from jsonb_array_elements(p_answers) e;
  if (select count(distinct id) from unnest(ids) id)<>n then raise exception 'Duplicate selection' using errcode='PT422'; end if;
  -- Validate and lock the entire selection before changing any answer.
  for entry in select value from jsonb_array_elements(p_answers) order by value->>'id' loop
    if jsonb_typeof(entry) is distinct from 'object' or jsonb_typeof(entry->'revision') is distinct from 'string' then raise exception 'Invalid revision' using errcode='PT422'; end if;
    select * into a from public.submission_answers where id=(entry->>'id')::uuid and submission_id=s.id for update;
    if not found then raise exception 'Answer unavailable' using errcode='PT404'; end if;
    if a.updated_at is distinct from (entry->>'revision')::timestamptz then raise exception 'Answer changed' using errcode='PT412'; end if;
    if not private.bulk_confirmable(a) then raise exception 'Individual decision required' using errcode='PT422'; end if;
  end loop;
  if p_whole_paper and (select count(*) from public.submission_answers x where x.submission_id=s.id and private.bulk_confirmable(x))<>n then raise exception 'Eligible selection changed' using errcode='PT412'; end if;
  for entry in select value from jsonb_array_elements(p_answers) order by value->>'id' loop
    perform public.review_grading_answer(b.id,(entry->>'id')::uuid,(entry->>'revision')::timestamptz,'confirm',null);
  end loop;
  return n;
end; $$;
revoke all on function public.review_grading_answers(uuid,uuid,jsonb,boolean) from public,anon,service_role;
grant execute on function public.review_grading_answers(uuid,uuid,jsonb,boolean) to authenticated;
create or replace function private.valid_teacher_settings(d jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare k text; item jsonb;
begin
  if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>32768 then return false; end if;
  foreach k in array array['auto_confirm','auto_confirm_ai','fraction_equivalence','ignore_case','typo_tolerance','library_worksheets','library_ai','notify_completed','notify_review'] loop
    if jsonb_typeof(d->k) is distinct from 'boolean' then return false; end if;
  end loop;
  foreach k in array array['full_name','school_name','signature','default_folder','ui_language','ai_preset'] loop
    if jsonb_typeof(d->k) is distinct from 'string' then return false; end if;
  end loop;
  if char_length(btrim(d->>'full_name')) not between 1 and 80 or char_length(d->>'school_name')>160 or char_length(d->>'signature')>500 or char_length(btrim(d->>'default_folder')) not between 1 and 80 or d->>'ui_language'<>'ru' or d->>'ai_preset' not in ('careful','balanced','fast','custom') then return false; end if;
  foreach k in array array['subjects','teaching_classes','default_tags'] loop
    if jsonb_typeof(d->k) is distinct from 'array' or jsonb_array_length(d->k)>30 then return false; end if;
    for item in select * from jsonb_array_elements(d->k) loop
      if jsonb_typeof(item) is distinct from 'string' or char_length(btrim(item#>>'{}')) not between 1 and 80 then return false; end if;
    end loop;
  end loop;
  if jsonb_typeof(d->'confidence_threshold') is distinct from 'number' or (d->>'confidence_threshold')::numeric not between 0.5 and 1 then return false; end if;
  if not (d ? 'rounding_digits') or (d->'rounding_digits'<>'null'::jsonb and (jsonb_typeof(d->'rounding_digits')<>'number' or (d->>'rounding_digits')::numeric not between 0 and 8 or (d->>'rounding_digits')::numeric<>trunc((d->>'rounding_digits')::numeric))) then return false; end if;
  if not (d ? 'retention_days') or (d->'retention_days'<>'null'::jsonb and d->'retention_days' not in ('7'::jsonb,'30'::jsonb,'90'::jsonb)) then return false; end if;
  if d ? 'auto_confirm_open' and jsonb_typeof(d->'auto_confirm_open') is distinct from 'boolean' then return false; end if;
  return private.valid_grade_scale(d->'fo_scale',10) and private.valid_grade_scale(d->'control_scale',5);
end; $$;
create or replace function public.claim_grading_submission(p_batch uuid, p_submission uuid, p_variant uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare b public.grading_batches; s public.submissions; token uuid := gen_random_uuid(); prefs jsonb;
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
  if b.grading_preferences is null then
    if b.grading_started_at is null then
      if b.autonomy_config is null then raise exception 'Choose autonomy before starting' using errcode='PT409'; end if;
      prefs:=b.autonomy_config;
    else
      prefs:='{"mode":"custom","auto_confirm":true,"auto_confirm_ai":false,"auto_confirm_open":false,"confidence_threshold":0.95,"fraction_equivalence":true,"ignore_case":false,"typo_tolerance":false,"rounding_digits":null}'::jsonb;
    end if;
    update public.grading_batches set grading_preferences=prefs where id=b.id;
  end if;
  update public.grading_batches set total_submissions=(select count(*) from public.submissions where batch_id=b.id),processed_submissions=(select count(*) from public.submissions where batch_id=b.id and status in ('proposed','needs_review','completed')),grading_started_at=coalesce(grading_started_at,clock_timestamp()),status='processing' where id=b.id;
  update public.submissions set status='processing',variant_id=p_variant,grading_attempt_id=token,grading_lease_until=clock_timestamp()+interval '180 seconds',grading_error=null where id=s.id;
  perform set_config('private.grading_workflow','off',true);
  return token;
end; $$;
create or replace function public.finish_grading_submission(p_batch uuid, p_submission uuid, p_attempt uuid, p_answers jsonb, p_student_name text)
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
    if a->>'review_status'='auto_accepted' and (
      (q.type='open_response' and (not coalesce((b.grading_preferences->>'auto_confirm_open')::boolean,false) or not coalesce((b.grading_preferences->>'auto_confirm_ai')::boolean,false) or not exists(select 1 from public.answer_keys k where k.question_id=q.id and (nullif(btrim(k.rubric#>>'{}'),'') is not null or nullif(btrim(k.expected_answer#>>'{}'),'') is not null)))) or not coalesce((b.grading_preferences->>'auto_confirm')::boolean,true)
      or (a->>'confidence')::numeric < coalesce((b.grading_preferences->>'confidence_threshold')::numeric,0.95)
      or jsonb_typeof(a->'flags') is distinct from 'array'
      or exists(select 1 from jsonb_array_elements_text(a->'flags') flag where flag not in ('ai_judgment','open_response'))
      or (a->'flags' ? 'open_response' and (q.type<>'open_response' or not coalesce((b.grading_preferences->>'auto_confirm_open')::boolean,false)))
      or (a->'flags' ? 'ai_judgment' and not coalesce((b.grading_preferences->>'auto_confirm_ai')::boolean,false))
    ) then raise exception 'Review required' using errcode='PT422'; end if;
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
