alter table public.submissions add column upload_index integer check (upload_index >= 0);
alter table public.submissions add constraint submissions_upload_order unique (batch_id, upload_index) deferrable initially deferred;
alter table public.submission_pages add column upload_status text not null default 'stored' check (upload_status in ('pending', 'stored'));

-- The batch lock serializes layout changes and completion. All calls retain RLS.
create function public.manage_grading_upload(p_batch uuid, p_revision timestamptz, p_command text, p_payload jsonb default '{}')
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

  update public.grading_batches set total_submissions = (select count(*) from public.submissions where batch_id = b.id),
    status = case when p_command = 'finish' then 'ready' else 'uploading' end
    where id = b.id returning updated_at into new_revision;
  return new_revision;
end;
$$;
revoke all on function public.manage_grading_upload(uuid,timestamptz,text,jsonb) from public, anon;
grant execute on function public.manage_grading_upload(uuid,timestamptz,text,jsonb) to authenticated;
