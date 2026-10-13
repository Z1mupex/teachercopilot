-- Guard terminal state and final scores before recognition starts; retain invoker/RLS.

create or replace function private.guard_grading_workflow() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare started timestamptz;
begin
  if current_setting('private.grading_workflow', true) = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_table_name = 'grading_batches' then
    if tg_op = 'INSERT' then
      if new.grading_started_at is not null or new.status in ('processing','review','completed') then raise exception 'Use grading workflow' using errcode='PT409'; end if;
      new.total_submissions := 0;
      new.processed_submissions := 0;
      return new;
    end if;
    if tg_op='UPDATE' and new.status is distinct from old.status and new.status in ('processing','review','completed') then raise exception 'Use grading workflow' using errcode='PT409'; end if;
    if tg_op='UPDATE' and (new.total_submissions,new.processed_submissions) is distinct from (old.total_submissions,old.processed_submissions) then raise exception 'Use grading workflow' using errcode='PT409'; end if;
    if tg_op = 'UPDATE' and (new.grading_started_at is distinct from old.grading_started_at
      or (old.grading_started_at is not null and (new.status, new.processed_submissions, new.total_submissions) is distinct from (old.status, old.processed_submissions, old.total_submissions))) then
      raise exception 'Use grading workflow' using errcode='PT409';
    end if;
  elsif tg_table_name = 'submissions' then
    if tg_op<>'DELETE' and (new.final_score is not null or new.proposed_score is not null or new.status in ('processing','proposed','needs_review','completed')) then raise exception 'Use grading workflow' using errcode='PT409'; end if;
    select b.grading_started_at into started from public.grading_batches b where b.id = case when tg_op='DELETE' then old.batch_id else new.batch_id end;
    if started is not null then raise exception 'Use grading workflow' using errcode='PT409'; end if;
  else
    if tg_table_name='submission_answers' and tg_op<>'DELETE' then
      if new.final_score is not null or new.review_status<>'needs_review' then raise exception 'Use grading workflow' using errcode='PT409'; end if;
    end if;
    select b.grading_started_at into started from public.grading_batches b join public.submissions s on s.batch_id=b.id where s.id=case when tg_op='DELETE' then old.submission_id else new.submission_id end;
    if started is not null then raise exception 'Use grading workflow' using errcode='PT409'; end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;

create or replace function public.claim_grading_submission(p_batch uuid, p_submission uuid, p_variant uuid)
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
  update public.grading_batches set total_submissions=(select count(*) from public.submissions where batch_id=b.id),processed_submissions=(select count(*) from public.submissions where batch_id=b.id and status in ('proposed','needs_review','completed')),grading_started_at=coalesce(grading_started_at,clock_timestamp()),status='processing' where id=b.id;
  update public.submissions set status='processing',variant_id=p_variant,grading_attempt_id=token,grading_lease_until=clock_timestamp()+interval '180 seconds',grading_error=null where id=s.id;
  perform set_config('private.grading_workflow','off',true);
  return token;
end; $$;

create or replace function public.finalize_grading_batch(p_batch uuid) returns void
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
  update public.grading_batches set status='completed',total_submissions=(select count(*) from public.submissions where batch_id=b.id),processed_submissions=(select count(*) from public.submissions where batch_id=b.id) where id=b.id;
  perform set_config('private.grading_workflow','off',true);
end; $$;

revoke all on function private.guard_grading_workflow() from public,anon,authenticated,service_role;

revoke all on function public.claim_grading_submission(uuid,uuid,uuid),public.finalize_grading_batch(uuid) from public,anon,service_role;

grant execute on function public.claim_grading_submission(uuid,uuid,uuid),public.finalize_grading_batch(uuid) to authenticated;

update storage.buckets set file_size_limit=6291456,allowed_mime_types=array['image/jpeg'] where id='submission-files';

update storage.buckets set file_size_limit=31457280,allowed_mime_types=array['application/pdf','image/jpeg','image/png'] where id='worksheet-files';

-- Upload counters change only under the validated, batch-locked RPC.
create or replace function public.manage_grading_upload(p_batch uuid, p_revision timestamptz, p_command text, p_payload jsonb default '{}')
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare
  b public.grading_batches;
  item jsonb;
  page public.submission_pages;
  ids uuid[];
  page_id uuid;
  next_index integer;
  object_path text;
  new_revision timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into b from public.grading_batches where id = p_batch and teacher_id = auth.uid() for update;
  if not found then raise exception 'Batch unavailable' using errcode = 'PT404'; end if;
  if b.status not in ('draft', 'uploading', 'ready') or b.processed_submissions <> 0
    or exists (select 1 from public.submission_answers a join public.submissions s on s.id = a.submission_id where s.batch_id = b.id)
    then raise exception 'Batch is locked' using errcode = 'PT409'; end if;
  if b.updated_at is distinct from p_revision then raise exception 'Batch changed in another tab' using errcode = 'PT412'; end if;
  if octet_length(p_payload::text) > 24000 then raise exception 'Payload too large' using errcode = '22023'; end if;

  if p_command = 'append' then
    if jsonb_typeof(p_payload -> 'ids') is distinct from 'array' or jsonb_array_length(p_payload -> 'ids') not between 1 and 100 then
      raise exception 'Invalid page list' using errcode = '22023'; end if;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_payload -> 'ids');
    if (select count(distinct x) from unnest(ids) x) <> cardinality(ids) then raise exception 'Duplicate pages' using errcode = '22023'; end if;
    -- Retrying an acknowledged/lost append is harmless, but mixed lists are rejected.
    if (select count(*) from public.submissions where batch_id = b.id and id = any(ids)) = cardinality(ids) then return b.updated_at; end if;
    if exists (select 1 from public.submissions where id = any(ids)) or exists (select 1 from public.submission_pages where id = any(ids)) then
      raise exception 'Page identity collision' using errcode = '22023'; end if;
    if (select count(*) from public.submissions where batch_id = b.id) + cardinality(ids) > 100 then raise exception 'At most 100 pages' using errcode = '22023'; end if;
    select coalesce(max(upload_index), -1) + 1 into next_index from public.submissions where batch_id = b.id;
    foreach page_id in array ids loop
      insert into public.submissions(id, batch_id, status, upload_index) values(page_id, b.id, 'uploading', next_index);
      insert into public.submission_pages(id, submission_id, page_index, storage_path, upload_status)
        values(page_id, page_id, 0, auth.uid()::text || '/' || b.id::text || '/' || page_id::text || '/original.jpg', 'pending');
      next_index := next_index + 1;
    end loop;
  elsif p_command = 'reorder' then
    if jsonb_typeof(p_payload -> 'ids') is distinct from 'array' then raise exception 'Invalid page order' using errcode = '22023'; end if;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_payload -> 'ids');
    if coalesce(cardinality(ids),0) <> (select count(*) from public.submissions where batch_id = b.id)
      or (select count(distinct x) from unnest(ids) x) <> coalesce(cardinality(ids),0)
      or exists(select 1 from unnest(ids) x where not exists(select 1 from public.submissions s where s.id = x and s.batch_id = b.id))
      then raise exception 'Order must contain every owned page exactly once' using errcode = '22023'; end if;
    update public.submissions s set upload_index = ord.n - 1 from unnest(ids) with ordinality as ord(id,n)
      where s.id = ord.id and s.batch_id = b.id;
  elsif p_command in ('store', 'remove') then
    page_id := (p_payload ->> 'id')::uuid;
    select p.* into page from public.submission_pages p join public.submissions s on s.id = p.submission_id
      where p.id = page_id and s.batch_id = b.id for update of p;
    if not found then raise exception 'Page unavailable' using errcode = 'PT404'; end if;
    if p_command = 'remove' then
      delete from public.submissions where id = page.submission_id and batch_id = b.id;
    else
      object_path := p_payload ->> 'path';
      if object_path is null or object_path !~ ('^' || auth.uid()::text || '/' || b.id::text || '/' || page.id::text || '/(original|[0-9a-f-]{36})[.]jpg$')
        or not exists (select 1 from storage.objects where bucket_id = 'submission-files' and name = object_path)
        or coalesce((p_payload ->> 'width')::integer,0) not between 1 and 2400
        or coalesce((p_payload ->> 'height')::integer,0) not between 1 and 2400 then
        raise exception 'Stored normalized page required' using errcode = '22023'; end if;
      update public.submission_pages set storage_path = object_path, width = (p_payload ->> 'width')::integer,
        height = (p_payload ->> 'height')::integer, upload_status = 'stored' where id = page.id;
      update public.submissions set status = 'uploaded' where id = page.submission_id;
    end if;
  elsif p_command = 'finish' then
    if not exists(select 1 from public.submissions where batch_id = b.id) or exists (
      select 1 from public.submissions s where s.batch_id = b.id and (
        (select count(*) from public.submission_pages p where p.submission_id = s.id) <> 1
        or not exists (select 1 from public.submission_pages p join storage.objects o on o.name = p.storage_path and o.bucket_id = 'submission-files'
          where p.submission_id = s.id and p.upload_status = 'stored' and p.width is not null and p.height is not null)))
      then raise exception 'Every page must be safely stored' using errcode = 'PT409'; end if;
  else raise exception 'Unknown upload command' using errcode = '22023'; end if;

  perform set_config('private.grading_workflow','on',true);
  update public.grading_batches set total_submissions = (select count(*) from public.submissions where batch_id = b.id),
    status = case when p_command = 'finish' then 'ready' else 'uploading' end
    where id = b.id returning updated_at into new_revision;
  perform set_config('private.grading_workflow','off',true);
  return new_revision;
end;
$$;
