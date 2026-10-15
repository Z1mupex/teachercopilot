create or replace function public.confirm_scan_review(p_batch uuid,p_revision timestamptz,p_groups jsonb,p_reviews jsonb,p_confirmed boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare b public.grading_batches; g jsonb; r jsonb; pid uuid; sid uuid; ids uuid[]; group_ids uuid[]; n integer:=0; position integer; ct integer;
begin
 select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
 if not found then raise exception 'Not found' using errcode='PT404'; end if;
 if b.updated_at is distinct from p_revision then raise exception 'Batch changed' using errcode='PT412'; end if;
 if b.grading_started_at is not null or b.status not in ('draft','uploading','ready') or exists(select 1 from public.submissions where batch_id=b.id and status not in ('uploaded','uploading')) then raise exception 'Grouping locked' using errcode='PT409'; end if;
 if p_confirmed is distinct from true or jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups) not between 1 and 100 or jsonb_typeof(p_reviews) is distinct from 'array' or jsonb_array_length(p_reviews) not between 1 and 100 or octet_length(p_groups::text)+octet_length(p_reviews::text)>24000 then raise exception 'Invalid review' using errcode='PT422'; end if;
 select array_agg((x->>'id')::uuid) into group_ids from jsonb_array_elements(p_groups)x;
 select array_agg(page_ids.value::uuid) into ids from jsonb_array_elements(p_groups) as elements(value) cross join lateral jsonb_array_elements_text(elements.value->'pages') as page_ids(value);
 select count(*) into ct from public.submission_pages p join public.submissions s on s.id=p.submission_id where s.batch_id=b.id;
 if ct not between 1 and 100 or cardinality(ids)<>ct or (select count(distinct x) from unnest(ids)x)<>ct or (select count(distinct x) from unnest(group_ids)x)<>cardinality(group_ids) or exists(select 1 from unnest(ids)x where not exists(select 1 from public.submission_pages p join public.submissions s on s.id=p.submission_id where p.id=x and s.batch_id=b.id and p.upload_status='stored' and exists(select 1 from storage.objects where bucket_id='submission-files' and name=p.storage_path))) or jsonb_array_length(p_reviews)<>ct or (select count(distinct x->>'id') from jsonb_array_elements(p_reviews)x)<>ct then raise exception 'Every owned stored page exactly once' using errcode='PT422'; end if;
 for r in select value from jsonb_array_elements(p_reviews) loop
  if not ((r->>'id')::uuid=any(ids)) or not exists(select 1 from public.submission_pages where id=(r->>'id')::uuid and regexp_replace(storage_path,'^.*/','')=r->>'version') then raise exception 'Image changed' using errcode='PT412'; end if;
 end loop;
 for g in select value from jsonb_array_elements(p_groups) loop
  if jsonb_typeof(g->'pages') is distinct from 'array' or jsonb_array_length(g->'pages') not between 1 and 10 then raise exception 'At most ten pages per work' using errcode='PT422'; end if;
 end loop;
 perform set_config('private.grading_workflow','on',true);perform set_config('private.upload_grouping','on',true);
 for g in select value from jsonb_array_elements(p_groups) loop
  sid:=(g->>'id')::uuid;
  if not exists(select 1 from public.submissions where id=sid and batch_id=b.id) then insert into public.submissions(id,batch_id,status) values(sid,b.id,'uploaded'); end if;
  position:=0;
  for pid in select value::uuid from jsonb_array_elements_text(g->'pages') loop
   update public.submission_pages set submission_id=sid,page_index=position,scan_reviewed_at=clock_timestamp() where id=pid;
   position:=position+1;
  end loop;
  update public.submissions set upload_index=n,status='uploaded' where id=sid and batch_id=b.id;
  n:=n+1;
 end loop;
 delete from public.submissions s where s.batch_id=b.id and not exists(select 1 from public.submission_pages p where p.submission_id=s.id);
 perform set_config('private.calibration_workflow','on',true);
 update public.grading_batches set total_submissions=n,status='ready',scan_review_required=true,calibration_enabled=false,calibration_samples='{}',calibration_profile=null where id=b.id;
 perform set_config('private.calibration_workflow','off',true);perform set_config('private.upload_grouping','off',true);perform set_config('private.grading_workflow','off',true);
end; $$;

create or replace function public.manage_grading_upload(p_batch uuid,p_revision timestamptz,p_command text,p_payload jsonb default '{}')
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare b public.grading_batches; ids uuid[]; pid uuid; page public.submission_pages; next_index integer; path text; preview text; rev timestamptz; n integer; quality jsonb;
begin
 select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
 if not found then raise exception 'Batch unavailable' using errcode='PT404'; end if;
 if b.grading_started_at is not null or b.status not in ('draft','uploading','ready') or exists(select 1 from public.submission_answers a join public.submissions s on s.id=a.submission_id where s.batch_id=b.id) then raise exception 'Batch locked' using errcode='PT409'; end if;
 if b.updated_at is distinct from p_revision then raise exception 'Batch changed' using errcode='PT412'; end if;
 if p_payload is null or octet_length(p_payload::text)>24000 then raise exception 'Invalid payload' using errcode='22023'; end if;
 perform set_config('private.grading_workflow','on',true);
 if p_command='append' then
  if jsonb_typeof(p_payload->'ids') is distinct from 'array' or jsonb_array_length(p_payload->'ids') not between 1 and 100 then raise exception 'Invalid pages' using errcode='22023'; end if;
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_payload->'ids');
  if (select count(distinct x) from unnest(ids)x)<>cardinality(ids) then raise exception 'Duplicate identity' using errcode='22023'; end if;
  if (select count(*) from public.submission_pages p join public.submissions s on s.id=p.submission_id where s.batch_id=b.id and p.id=any(ids))=cardinality(ids) then perform set_config('private.grading_workflow','off',true); return b.updated_at; end if;
  if exists(select 1 from public.submission_pages where id=any(ids)) or exists(select 1 from public.submissions where id=any(ids)) or (select count(*) from public.submission_pages p join public.submissions s on s.id=p.submission_id where s.batch_id=b.id)+cardinality(ids)>100 then raise exception 'Page limit or collision' using errcode='22023'; end if;
  select coalesce(max(upload_index),-1)+1 into next_index from public.submissions where batch_id=b.id;
  foreach pid in array ids loop
   insert into public.submissions(id,batch_id,status,upload_index) values(pid,b.id,'uploading',next_index);
   insert into public.submission_pages(id,submission_id,page_index,storage_path,upload_status) values(pid,pid,0,auth.uid()::text||'/'||b.id::text||'/'||pid::text||'/original.jpg','pending');
   next_index:=next_index+1;
  end loop;
  if p_payload->>'source'='batch_scan' then update public.grading_batches set scan_review_required=true where id=b.id; end if;
 elsif p_command='reorder' then
  if jsonb_typeof(p_payload->'ids') is distinct from 'array' then raise exception 'Invalid page order' using errcode='22023'; end if;
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_payload->'ids');
  if coalesce(cardinality(ids),0)<>(select count(*) from public.submission_pages p join public.submissions s on s.id=p.submission_id where s.batch_id=b.id) or (select count(distinct x) from unnest(ids)x)<>coalesce(cardinality(ids),0) or exists(select 1 from unnest(ids)x where not exists(select 1 from public.submission_pages p join public.submissions s on s.id=p.submission_id where p.id=x and s.batch_id=b.id)) then raise exception 'Order must include every owned page' using errcode='22023'; end if;
  -- Do not silently move a page into a different student. Group changes are explicit.
  if exists(select 1 from (select p.submission_id,min(o.n) lo,max(o.n) hi,count(*) ct from unnest(ids) with ordinality o(id,n) join public.submission_pages p on p.id=o.id group by p.submission_id)g where g.hi-g.lo+1<>g.ct) then raise exception 'Keep work pages together' using errcode='22023'; end if;
  with ordered as(select p.id,row_number() over(partition by p.submission_id order by o.n)-1 n from unnest(ids) with ordinality o(id,n) join public.submission_pages p on p.id=o.id)
  update public.submission_pages p set page_index=o.n from ordered o where p.id=o.id;
  with groups as(select p.submission_id,min(o.n) n from unnest(ids) with ordinality o(id,n) join public.submission_pages p on p.id=o.id group by p.submission_id),
  ordered as(select submission_id,row_number()over(order by n)-1 n from groups)
  update public.submissions s set upload_index=o.n from ordered o where s.id=o.submission_id;
 elsif p_command in ('remove','store') then
  pid:=(p_payload->>'id')::uuid;
  select p.* into page from public.submission_pages p join public.submissions s on s.id=p.submission_id where p.id=pid and s.batch_id=b.id for update of p;
  if not found then raise exception 'Page unavailable' using errcode='PT404'; end if;
  if p_command='remove' then
   delete from public.submission_pages where id=page.id;
   with ordered as(select id,row_number()over(order by page_index,id)-1 position from public.submission_pages where submission_id=page.submission_id)
   update public.submission_pages p set page_index=o.position from ordered o where p.id=o.id;
   if not exists(select 1 from public.submission_pages where submission_id=page.submission_id) then delete from public.submissions where id=page.submission_id; end if;
  else
   path:=p_payload->>'path'; preview:=p_payload->>'preview_path';quality:=p_payload->'quality';
   if path is null or path !~ ('^'||auth.uid()::text||'/'||b.id::text||'/'||page.id::text||'/(original|[0-9a-f-]{36})[.]jpg$') or not exists(select 1 from storage.objects where bucket_id='submission-files' and name=path) or coalesce((p_payload->>'width')::integer,0) not between 1 and 2400 or coalesce((p_payload->>'height')::integer,0) not between 1 and 2400 then raise exception 'Stored normalized page required' using errcode='22023'; end if;
   if preview is not null and (preview=path or preview !~ ('^'||auth.uid()::text||'/'||b.id::text||'/'||page.id::text||'/[0-9a-f-]{36}[.]jpg$') or not exists(select 1 from storage.objects where bucket_id='submission-files' and name=preview)) then raise exception 'Invalid preview' using errcode='22023'; end if;
   if p_payload ? 'hash' and (p_payload->>'hash') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid hash' using errcode='22023'; end if;
   if p_payload ? 'perceptual_hash' and (p_payload->>'perceptual_hash') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid image fingerprint' using errcode='22023'; end if;
   if quality is not null and (jsonb_typeof(quality) is distinct from 'object' or octet_length(quality::text)>1000 or jsonb_typeof(quality->'flags') is distinct from 'array' or jsonb_array_length(quality->'flags')>6 or jsonb_typeof(quality->'brightness') is distinct from 'number' or (quality->>'brightness')::numeric not between 0 and 255 or jsonb_typeof(quality->'sharpness') is distinct from 'number' or (quality->>'sharpness')::numeric not between 0 and 1040400 or exists(select 1 from jsonb_array_elements_text(quality->'flags')f where f not in ('blur','dark','glare','cut_edges','low_resolution','possible_duplicate'))) then raise exception 'Invalid scan metrics' using errcode='22023'; end if;
   update public.submission_pages set storage_path=path,preview_storage_path=preview,width=(p_payload->>'width')::integer,height=(p_payload->>'height')::integer,upload_status='stored',content_hash=p_payload->>'hash',perceptual_hash=p_payload->>'perceptual_hash',scan_quality=quality,scan_reviewed_at=null where id=page.id;
   update public.submissions set status='uploaded' where id=page.submission_id and not exists(select 1 from public.submission_pages where submission_id=page.submission_id and upload_status<>'stored');
  end if;
 elsif p_command='finish' then
  if not exists(select 1 from public.submissions where batch_id=b.id) or exists(select 1 from public.submissions s where s.batch_id=b.id and ((select count(*) from public.submission_pages where submission_id=s.id) not between 1 and 10 or exists(select 1 from public.submission_pages p where p.submission_id=s.id and (p.upload_status<>'stored' or p.width is null or p.height is null or (b.scan_review_required and p.scan_reviewed_at is null) or not exists(select 1 from storage.objects where bucket_id='submission-files' and name=p.storage_path))))) then raise exception 'Review and store every page first' using errcode='PT409'; end if;
 else raise exception 'Unknown command' using errcode='22023'; end if;
 -- Any layout mutation invalidates a not-yet-started calibration sample.
 if p_command in ('append','reorder','remove') and b.calibration_enabled then
  perform set_config('private.calibration_workflow','on',true);
  update public.grading_batches set calibration_enabled=false,calibration_samples='{}',calibration_profile=null where id=b.id;
  perform set_config('private.calibration_workflow','off',true);
 end if;
 update public.grading_batches set total_submissions=(select count(*) from public.submissions where batch_id=b.id),status=case when p_command='finish' then 'ready' else 'uploading' end where id=b.id returning updated_at into rev;
 perform set_config('private.grading_workflow','off',true);
 return rev;
end; $$;
