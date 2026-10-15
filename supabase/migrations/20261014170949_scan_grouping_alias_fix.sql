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
 if ct not between 1 and 100 or cardinality(ids)<>ct or (select count(distinct x) from unnest(ids)x)<>ct or (select count(distinct x) from unnest(group_ids)x)<>cardinality(group_ids) or exists(select 1 from unnest(ids)x where not exists(select 1 from public.submission_pages p join public.submissions s on s.id=p.submission_id where p.id=x and s.batch_id=b.id and p.upload_status='stored')) or jsonb_array_length(p_reviews)<>ct or (select count(distinct x->>'id') from jsonb_array_elements(p_reviews)x)<>ct then raise exception 'Every owned stored page exactly once' using errcode='PT422'; end if;
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
