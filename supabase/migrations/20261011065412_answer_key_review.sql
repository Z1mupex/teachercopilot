-- Answer contexts reuse worksheets/questions/answer_keys. The original optional
-- worksheet link remains immutable; its batch-specific snapshot is independent.
alter table public.grading_batches
  add column answer_key_worksheet_id uuid unique,
  add column answer_key_confirmed_at timestamptz,
  add column answer_key_source text check (answer_key_source in ('manual','worksheet','photo','file','solved_teacher')),
  add column answer_key_review jsonb not null default '[]'::jsonb check (jsonb_typeof(answer_key_review) = 'array'),
  add constraint grading_batches_answer_key_teacher_fk foreign key (answer_key_worksheet_id,teacher_id)
    references public.worksheets(id,teacher_id) deferrable initially deferred,
  add constraint grading_batches_answer_key_confirmation check (answer_key_confirmed_at is null or answer_key_worksheet_id is not null);
create index grading_batches_answer_key_teacher_idx on public.grading_batches(answer_key_worksheet_id,teacher_id);

-- Attached snapshots are immutable, even through direct REST updates. Editing
-- replaces the entire snapshot atomically before recognition has started.
create function private.protect_answer_snapshot()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target uuid;
begin
  if tg_table_name = 'worksheets' then target := old.id;
  elsif tg_table_name = 'answer_keys' then
    select q.worksheet_id into target from public.questions q where q.id = coalesce(new.question_id,old.question_id);
  else target := coalesce(new.worksheet_id,old.worksheet_id); end if;
  perform 1 from public.grading_batches b where b.answer_key_worksheet_id = target for share;
  if found then raise exception 'Attached answer snapshot is immutable' using errcode = 'PT409'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger worksheets_answer_snapshot before update or delete on public.worksheets for each row execute function private.protect_answer_snapshot();
create trigger questions_answer_snapshot before insert or update or delete on public.questions for each row execute function private.protect_answer_snapshot();
create trigger variants_answer_snapshot before insert or update or delete on public.worksheet_variants for each row execute function private.protect_answer_snapshot();
create trigger keys_answer_snapshot before insert or update or delete on public.answer_keys for each row execute function private.protect_answer_snapshot();

create function private.validate_answer_review()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare key_status text;
begin
  if tg_op = 'UPDATE' and (
    new.answer_key_worksheet_id is distinct from old.answer_key_worksheet_id
    or new.answer_key_source is distinct from old.answer_key_source
    or new.answer_key_review is distinct from old.answer_key_review
    or new.answer_key_confirmed_at is distinct from old.answer_key_confirmed_at
  ) then
    if old.status <> 'ready' or old.processed_submissions <> 0
      or exists(select 1 from public.submissions s where s.batch_id = old.id and (s.variant_id is not null or s.status <> 'uploaded'))
      or exists(select 1 from public.submission_answers a join public.submissions s on s.id=a.submission_id where s.batch_id=old.id) then
      raise exception 'Answer review is locked' using errcode = 'PT409';
    end if;
    if old.answer_key_worksheet_id is not null and new.answer_key_worksheet_id is null then
      raise exception 'Answer context cannot be detached' using errcode = 'PT409';
    end if;
  end if;
  if new.answer_key_worksheet_id is not null then
    select w.status into key_status from public.worksheets w where w.id=new.answer_key_worksheet_id and w.teacher_id=new.teacher_id and w.source='uploaded' for share;
    if not found then raise exception 'Answer context unavailable' using errcode = '23503'; end if;
  end if;
  if tg_op = 'UPDATE' and new.status in ('draft','uploading') then new.answer_key_confirmed_at := null; end if;
  if new.answer_key_confirmed_at is not null then
    if key_status <> 'ready' or new.status not in ('ready','processing','review','completed','failed')
      or not exists(select 1 from public.questions q where q.worksheet_id=new.answer_key_worksheet_id)
      or exists(select 1 from jsonb_array_elements(new.answer_key_review) r where r->'reviewed' is distinct from 'true'::jsonb)
      or exists(select 1 from public.questions q left join public.answer_keys k on k.question_id=q.id where q.worksheet_id=new.answer_key_worksheet_id and (
        q.max_score<=0 or k.id is null or (q.type='open_response' and coalesce(btrim(k.expected_answer#>>'{}'),'')='' and coalesce(btrim(k.rubric#>>'{}'),'')='')
      )) then raise exception 'Answer key requires review' using errcode = 'PT422'; end if;
  end if;
  return new;
end;
$$;
create trigger grading_batches_answer_review before insert or update on public.grading_batches for each row execute function private.validate_answer_review();

create function public.save_grading_answer_key(p_batch uuid,p_revision timestamptz,p_document jsonb,p_source text,p_review jsonb,p_confirm boolean)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare actor uuid:=auth.uid(); batch public.grading_batches%rowtype; result jsonb; target uuid; mark jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select b.* into batch from public.grading_batches b where b.id=p_batch and b.teacher_id=actor for update;
  if not found then raise exception 'Batch unavailable' using errcode='PT404'; end if;
  if p_revision is null or batch.updated_at<>p_revision then raise exception 'Batch revision changed' using errcode='PT412'; end if;
  if batch.status<>'ready' or batch.processed_submissions<>0
    or not exists(select 1 from public.submissions s where s.batch_id=p_batch)
    or exists(select 1 from public.submissions s where s.batch_id=p_batch and (s.variant_id is not null or s.status<>'uploaded'))
    or exists(select 1 from public.submission_pages p join public.submissions s on s.id=p.submission_id where s.batch_id=p_batch and p.upload_status<>'stored')
    or exists(select 1 from public.submission_answers a join public.submissions s on s.id=a.submission_id where s.batch_id=p_batch) then
    raise exception 'Answer review is locked' using errcode='PT409';
  end if;
  if p_source is null or p_source not in ('manual','worksheet','photo','file','solved_teacher')
    or p_confirm is null or p_document->>'status' is distinct from (case when p_confirm then 'ready' else 'draft' end)
    or jsonb_typeof(p_review) is distinct from 'array' or jsonb_array_length(p_review)>300 or octet_length(p_review::text)>60000 then
    raise exception 'Invalid answer review' using errcode='PT422';
  end if;
  -- Reuse the existing complete SQL validation and normalized save transaction.
  -- The server re-identifies questions/options/variants before creating a snapshot.
  result:=public.save_teacher_worksheet(p_document);
  target:=(result->>'id')::uuid;
  for mark in select value from jsonb_array_elements(p_review) loop
    if jsonb_typeof(mark)<>'object' or jsonb_typeof(mark->'question_id') is distinct from 'string'
      or jsonb_typeof(mark->'reviewed') is distinct from 'boolean' or jsonb_typeof(mark->'fields') is distinct from 'array'
      or jsonb_array_length(mark->'fields') not between 1 and 8
      or not exists(select 1 from public.questions q where q.id=(mark->>'question_id')::uuid and q.worksheet_id=target)
      or exists(select 1 from jsonb_array_elements_text(mark->'fields') f where f not in ('number','type','answer','score','rubric','options','confidence','missing'))
      or (p_confirm and mark->'reviewed'<>'true'::jsonb) then raise exception 'Unreviewed answer fields' using errcode='PT422'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_review)) <> (select count(distinct r->>'question_id') from jsonb_array_elements(p_review) r) then
    raise exception 'Duplicate review marks' using errcode='PT422';
  end if;
  update public.worksheets w set source='uploaded' where w.id=target and w.teacher_id=actor;
  update public.grading_batches b set answer_key_worksheet_id=target,answer_key_source=p_source,answer_key_review=p_review,
    answer_key_confirmed_at=case when p_confirm then clock_timestamp() else null end where b.id=p_batch and b.teacher_id=actor;
  if batch.answer_key_worksheet_id is not null then
    delete from public.worksheets w where w.id=batch.answer_key_worksheet_id and w.teacher_id=actor and w.source='uploaded';
  end if;
  return target;
end;
$$;
revoke all on function private.protect_answer_snapshot(),private.validate_answer_review() from public,anon,authenticated,service_role;
revoke all on function public.save_grading_answer_key(uuid,timestamptz,jsonb,text,jsonb,boolean) from public,anon,service_role;
grant execute on function public.save_grading_answer_key(uuid,timestamptz,jsonb,text,jsonb,boolean) to authenticated;

-- Grading relationships use the reviewed context, with legacy fallback.
create or replace function private.validate_submission_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  batch_worksheet uuid;
  variant_worksheet uuid;
begin
  select coalesce(b.answer_key_worksheet_id,b.worksheet_id) into batch_worksheet from public.grading_batches b
    where b.id = new.batch_id for share;
  if not found then
    raise exception 'Submission parent is unavailable' using errcode = '23514';
  end if;
  if new.variant_id is not null then
    select v.worksheet_id into variant_worksheet from public.worksheet_variants v
      where v.id = new.variant_id for share;
    if not found or variant_worksheet is distinct from batch_worksheet then
      raise exception 'Submission variant must belong to its grading worksheet' using errcode = '23514';
    end if;
  end if;
  -- Lock every answered question, including currently shared (null-variant) ones.
  perform q.id from public.questions q
    where exists (select 1 from public.submission_answers a where a.question_id = q.id and a.submission_id = new.id)
    order by q.id for share;
  if exists (
    select 1 from public.submission_answers a join public.questions q on q.id = a.question_id
    where a.submission_id = new.id and q.variant_id is not null and q.variant_id is distinct from new.variant_id
  ) then
    raise exception 'Variant conflicts with existing answers' using errcode = '23514';
  end if;
  return new;
end;
$$;
create or replace function private.validate_answer_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  batch_worksheet uuid;
  submission_variant uuid;
  question_worksheet uuid;
  question_variant uuid;
  question_max numeric;
begin
  select coalesce(b.answer_key_worksheet_id,b.worksheet_id), s.variant_id into batch_worksheet, submission_variant
    from public.submissions s join public.grading_batches b on b.id = s.batch_id
    where s.id = new.submission_id for share of s, b;
  if not found then
    raise exception 'Answer parent is unavailable' using errcode = '23514';
  end if;
  select q.worksheet_id, q.variant_id, q.max_score into question_worksheet, question_variant, question_max
    from public.questions q where q.id = new.question_id for share;
  if not found or question_worksheet is distinct from batch_worksheet
    or (question_variant is not null and question_variant is distinct from submission_variant) then
    raise exception 'Answer question must match the submission worksheet and variant' using errcode = '23514';
  end if;
  if new.proposed_score > question_max or new.final_score > question_max then
    raise exception 'Answer score exceeds question maximum' using errcode = '23514';
  end if;
  return new;
end;
$$;
create or replace function public.reserve_ai_run(p_model text, p_purpose text, p_input_hash text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare actor uuid := auth.uid(); run_id uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 100
    or p_purpose is null or p_purpose not in ('worksheet_generation', 'question_regeneration', 'answer_key_parsing')
    or p_input_hash is null or p_input_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid AI reservation' using errcode = 'PT422';
  end if;
  perform 1 from public.profiles p where p.id = actor for update;
  if not found then raise exception 'Authentication required' using errcode = '28000'; end if;
  if exists(select 1 from public.ai_runs r where r.teacher_id = actor and r.status = 'running' and r.created_at > clock_timestamp() - interval '180 seconds') then
    raise exception 'ai_request_in_progress' using errcode = 'PT429';
  end if;
  if (select count(*) from private.ai_request_reservations r where r.teacher_id = actor and r.created_at > clock_timestamp() - interval '1 hour') >= 20 then
    raise exception 'ai_hourly_limit' using errcode = 'PT429';
  end if;
  insert into public.ai_runs(teacher_id, purpose, model, input_hash, status) values(actor, p_purpose, p_model, p_input_hash, 'running') returning id into run_id;
  insert into private.ai_request_reservations(id, teacher_id) values(run_id, actor);
  return run_id;
end;
$$;
