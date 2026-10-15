-- Multi-page ownership, explicit scan review and per-batch calibration.
alter table public.grading_batches add column scan_review_required boolean not null default false;
alter table public.grading_batches add column calibration_enabled boolean not null default false;
alter table public.grading_batches add column calibration_samples uuid[] not null default '{}';
alter table public.grading_batches add column calibration_profile jsonb;
alter table public.submission_pages add column preview_storage_path text;
alter table public.submission_pages add column content_hash text check(content_hash is null or content_hash ~ '^[0-9a-f]{64}$');
alter table public.submission_pages add column scan_quality jsonb;
alter table public.submission_pages add column perceptual_hash text check(perceptual_hash is null or perceptual_hash ~ '^[0-9a-f]{64}$');
create index submission_pages_content_hash_idx on public.submission_pages(content_hash) where content_hash is not null;
alter table public.submission_pages add column scan_reviewed_at timestamptz;
alter table public.submission_pages drop constraint submission_pages_submission_id_page_index_key;
alter table public.submission_pages add constraint submission_pages_submission_id_page_index_key unique(submission_id,page_index) deferrable initially deferred;
create function private.valid_calibration_profile(p jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb;
begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>20000 or jsonb_typeof(p->'summary') is distinct from 'string' or char_length(btrim(p->>'summary')) not between 1 and 800 or jsonb_typeof(p->'rules') is distinct from 'array' or jsonb_array_length(p->'rules') not between 1 and 20 then return false; end if;
 for r in select value from jsonb_array_elements(p->'rules') loop
  if jsonb_typeof(r) is distinct from 'object' or not (r ? 'question_id') or (r->'question_id'<>'null'::jsonb and (jsonb_typeof(r->'question_id') is distinct from 'string' or (r->>'question_id') !~ '^[0-9a-f-]{36}$')) or jsonb_typeof(r->'instruction') is distinct from 'string' or char_length(btrim(r->>'instruction')) not between 1 and 600 then return false; end if;
 end loop;
 return true;
end; $$;
revoke all on function private.valid_calibration_profile(jsonb) from public,anon,service_role;
grant execute on function private.valid_calibration_profile(jsonb) to authenticated;
alter table public.grading_batches add constraint calibration_profile_valid check(calibration_profile is null or private.valid_calibration_profile(calibration_profile));
alter table public.grading_batches add constraint calibration_sample_count check(cardinality(calibration_samples)<=5);
create function private.guard_capture_fields() returns trigger language plpgsql security invoker set search_path='' as $$
declare old_batch uuid; new_batch uuid; started timestamptz;
begin
 if tg_table_name='grading_batches' then
  if tg_op='INSERT' then
   if new.scan_review_required or new.calibration_enabled or cardinality(new.calibration_samples)>0 or new.calibration_profile is not null then raise exception 'Use capture workflows' using errcode='PT409'; end if;
  else
   if new.scan_review_required is distinct from old.scan_review_required and current_setting('private.grading_workflow',true) is distinct from 'on' then raise exception 'Use scan workflow' using errcode='PT409'; end if;
   if (new.calibration_enabled,new.calibration_samples,new.calibration_profile) is distinct from (old.calibration_enabled,old.calibration_samples,old.calibration_profile) and current_setting('private.calibration_workflow',true) is distinct from 'on' then raise exception 'Use calibration workflow' using errcode='PT409'; end if;
  end if;
 else
  if tg_op='INSERT' then
   if new.preview_storage_path is not null or new.content_hash is not null or new.scan_quality is not null or new.perceptual_hash is not null or new.scan_reviewed_at is not null then raise exception 'Use page workflow' using errcode='PT409'; end if;
  else
   if new.id is distinct from old.id then raise exception 'Page identity immutable' using errcode='PT409'; end if;
   if new.submission_id is distinct from old.submission_id then
    select batch_id into old_batch from public.submissions where id=old.submission_id;
    select batch_id into new_batch from public.submissions where id=new.submission_id;
    select grading_started_at into started from public.grading_batches where id=old_batch and teacher_id=auth.uid();
    if old_batch is null or new_batch is distinct from old_batch or started is not null or current_setting('private.upload_grouping',true) is distinct from 'on' then raise exception 'Page parent immutable outside owned grouping' using errcode='PT409'; end if;
   end if;
   if (new.preview_storage_path,new.content_hash,new.scan_quality,new.perceptual_hash,new.scan_reviewed_at) is distinct from (old.preview_storage_path,old.content_hash,old.scan_quality,old.perceptual_hash,old.scan_reviewed_at) and current_setting('private.grading_workflow',true) is distinct from 'on' then raise exception 'Use page workflow' using errcode='PT409'; end if;
  end if;
 end if;
 return new;
end; $$;
drop trigger immutable_identity on public.submission_pages;
create trigger guard_capture_fields before insert or update on public.submission_pages for each row execute function private.guard_capture_fields();
create trigger guard_capture_fields before insert or update on public.grading_batches for each row execute function private.guard_capture_fields();
revoke all on function private.guard_capture_fields() from public,anon,authenticated,service_role;
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
create function public.confirm_scan_review(p_batch uuid,p_revision timestamptz,p_groups jsonb,p_reviews jsonb,p_confirmed boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare b public.grading_batches; g jsonb; r jsonb; pid uuid; sid uuid; ids uuid[]; group_ids uuid[]; n integer:=0; position integer; ct integer;
begin
 select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
 if not found then raise exception 'Not found' using errcode='PT404'; end if;
 if b.updated_at is distinct from p_revision then raise exception 'Batch changed' using errcode='PT412'; end if;
 if b.grading_started_at is not null or b.status not in ('draft','uploading','ready') or exists(select 1 from public.submissions where batch_id=b.id and status not in ('uploaded','uploading')) then raise exception 'Grouping locked' using errcode='PT409'; end if;
 if p_confirmed is distinct from true or jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups) not between 1 and 100 or jsonb_typeof(p_reviews) is distinct from 'array' or jsonb_array_length(p_reviews) not between 1 and 100 or octet_length(p_groups::text)+octet_length(p_reviews::text)>24000 then raise exception 'Invalid review' using errcode='PT422'; end if;
 select array_agg((x->>'id')::uuid) into group_ids from jsonb_array_elements(p_groups)x;
 select array_agg(v::uuid) into ids from jsonb_array_elements(p_groups)g cross join lateral jsonb_array_elements_text(g->'pages')v;
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
create table public.grading_calibration_feedback(
 answer_id uuid primary key references public.submission_answers(id) on delete cascade,
 comment text not null default '' check(char_length(comment)<=1000)
);
alter table public.grading_calibration_feedback enable row level security;
revoke all on public.grading_calibration_feedback from public,anon,service_role;
grant select,insert,update on public.grading_calibration_feedback to authenticated;
create policy calibration_feedback_owned on public.grading_calibration_feedback for all to authenticated
using(exists(select 1 from public.submission_answers a join public.submissions s on s.id=a.submission_id join public.grading_batches b on b.id=s.batch_id where a.id=answer_id and b.teacher_id=(select auth.uid())))
with check(exists(select 1 from public.submission_answers a join public.submissions s on s.id=a.submission_id join public.grading_batches b on b.id=s.batch_id where a.id=answer_id and b.teacher_id=(select auth.uid()) and b.calibration_enabled and s.id=any(b.calibration_samples) and b.calibration_profile is null));
create trigger immutable_identity before update on public.grading_calibration_feedback for each row execute function private.prevent_reparenting('answer_id');
create function public.configure_grading_calibration(p_batch uuid,p_revision timestamptz,p_samples uuid[]) returns void
language plpgsql security invoker set search_path='' as $$
declare b public.grading_batches; n integer;
begin
 select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
 if not found then raise exception 'Not found' using errcode='PT404'; end if;
 if b.updated_at is distinct from p_revision then raise exception 'Batch changed' using errcode='PT412'; end if;
 if b.grading_started_at is not null or b.status<>'ready' then raise exception 'Calibration locked' using errcode='PT409'; end if;
 select count(*) into n from public.submissions where batch_id=b.id;
 if p_samples is null or cardinality(p_samples)>5 or (cardinality(p_samples)>0 and cardinality(p_samples)<least(3,n)) or (select count(distinct x) from unnest(p_samples)x)<>cardinality(p_samples) or exists(select 1 from unnest(p_samples)x where not exists(select 1 from public.submissions where id=x and batch_id=b.id and status='uploaded')) then raise exception 'Select three to five owned works' using errcode='PT422'; end if;
 perform set_config('private.calibration_workflow','on',true);
 update public.grading_batches set calibration_enabled=cardinality(p_samples)>0,calibration_samples=p_samples,calibration_profile=null where id=b.id;
 perform set_config('private.calibration_workflow','off',true);
end; $$;
create function public.save_calibration_feedback(p_batch uuid,p_answer uuid,p_revision timestamptz,p_command text,p_score numeric,p_comment text) returns void
language plpgsql security invoker set search_path='' as $$
declare b public.grading_batches; a public.submission_answers;
begin
 select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
 if not found then raise exception 'Not found' using errcode='PT404'; end if;
 select * into a from public.submission_answers where id=p_answer and submission_id=any(b.calibration_samples) for update;
 if not found then raise exception 'Not found' using errcode='PT404'; end if;
 if not b.calibration_enabled or b.calibration_profile is not null then raise exception 'Calibration examples locked' using errcode='PT409'; end if;
 if p_comment is null or char_length(p_comment)>1000 or (p_command='score' and p_score is distinct from a.proposed_score and nullif(btrim(p_comment),'') is null) then raise exception 'Explain the changed score' using errcode='PT422'; end if;
 perform public.review_grading_answer(b.id,a.id,p_revision,p_command,p_score);
 perform set_config('private.calibration_feedback','on',true);
 insert into public.grading_calibration_feedback(answer_id,comment) values(a.id,btrim(p_comment)) on conflict(answer_id) do update set comment=excluded.comment;
 perform set_config('private.calibration_feedback','off',true);
 -- Profile generation/approval revision includes feedback-only teacher changes.
 update public.grading_batches set updated_at=clock_timestamp() where id=b.id;
end; $$;
create function public.approve_grading_calibration(p_batch uuid,p_revision timestamptz,p_profile jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare b public.grading_batches; r jsonb;
begin
 select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
 if not found then raise exception 'Not found' using errcode='PT404'; end if;
 if b.updated_at is distinct from p_revision then raise exception 'Batch changed' using errcode='PT412'; end if;
 if not b.calibration_enabled or b.calibration_profile is not null or cardinality(b.calibration_samples)=0 or exists(select 1 from public.submissions where batch_id=b.id and (case when id=any(b.calibration_samples) then status not in ('proposed','needs_review') else grading_attempt_id is not null end)) or exists(select 1 from public.submission_answers where submission_id=any(b.calibration_samples) and (review_status not in ('teacher_confirmed','teacher_changed') or final_score is null)) or not exists(select 1 from public.submission_answers where submission_id=any(b.calibration_samples)) then raise exception 'Review every sample answer first' using errcode='PT409'; end if;
 if not private.valid_calibration_profile(p_profile) then raise exception 'Invalid teacher profile' using errcode='PT422'; end if;
 for r in select value from jsonb_array_elements(p_profile->'rules') loop
  if r->'question_id'<>'null'::jsonb and not exists(select 1 from public.questions where id=(r->>'question_id')::uuid and worksheet_id=b.answer_key_worksheet_id and type<>'multiple_choice') then raise exception 'Rule question unavailable' using errcode='PT422'; end if;
 end loop;
 perform set_config('private.calibration_workflow','on',true);
 update public.grading_batches set calibration_profile=p_profile where id=b.id;
 perform set_config('private.calibration_workflow','off',true);
end; $$;
revoke all on function public.confirm_scan_review(uuid,timestamptz,jsonb,jsonb,boolean),public.configure_grading_calibration(uuid,timestamptz,uuid[]),public.save_calibration_feedback(uuid,uuid,timestamptz,text,numeric,text),public.approve_grading_calibration(uuid,timestamptz,jsonb) from public,anon,service_role;
grant execute on function public.confirm_scan_review(uuid,timestamptz,jsonb,jsonb,boolean),public.configure_grading_calibration(uuid,timestamptz,uuid[]),public.save_calibration_feedback(uuid,uuid,timestamptz,text,numeric,text),public.approve_grading_calibration(uuid,timestamptz,jsonb) to authenticated;

-- Keep deployed v1 clients conservative; v2 requires explicit configuration.
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
  if b.calibration_enabled and b.calibration_profile is null and not (s.id=any(b.calibration_samples)) then raise exception 'Approve calibration first' using errcode='PT409'; end if;
  if (select count(*) from public.submission_pages where submission_id=s.id) not between 1 and 10 or exists(select 1 from public.submission_pages p where p.submission_id=s.id and (p.upload_status<>'stored' or (b.scan_review_required and p.scan_reviewed_at is null) or not exists(select 1 from storage.objects where bucket_id='submission-files' and name=p.storage_path))) then raise exception 'Review every stored page first' using errcode='PT409'; end if;
  perform set_config('private.grading_workflow','on',true);
  if b.grading_preferences is null then
    if b.grading_started_at is null then
      if b.autonomy_config is not null then prefs:=b.autonomy_config;
      else
        select document into prefs from public.teacher_settings where teacher_id=auth.uid();
        prefs:=jsonb_build_object('mode','custom','auto_confirm',coalesce((prefs->>'auto_confirm')::boolean,true),'auto_confirm_ai',coalesce((prefs->>'auto_confirm_ai')::boolean,false),'auto_confirm_open',false,'confidence_threshold',coalesce((prefs->>'confidence_threshold')::numeric,0.95),'fraction_equivalence',coalesce((prefs->>'fraction_equivalence')::boolean,true),'ignore_case',coalesce((prefs->>'ignore_case')::boolean,false),'typo_tolerance',coalesce((prefs->>'typo_tolerance')::boolean,false),'rounding_digits',coalesce(prefs->'rounding_digits','null'::jsonb));
      end if;
    else
      prefs:='{"mode":"custom","auto_confirm":true,"auto_confirm_ai":false,"auto_confirm_open":false,"confidence_threshold":0.95,"fraction_equivalence":true,"ignore_case":false,"typo_tolerance":false,"rounding_digits":null}'::jsonb;
    end if;
    update public.grading_batches set grading_preferences=prefs,grade_conversion=coalesce(grade_conversion,jsonb_build_object('kind','fo','scale',coalesce((select document->'fo_scale' from public.teacher_settings where teacher_id=auth.uid()),'[{"percent":0,"grade":0},{"percent":5,"grade":1},{"percent":15,"grade":2},{"percent":25,"grade":3},{"percent":35,"grade":4},{"percent":45,"grade":5},{"percent":55,"grade":6},{"percent":65,"grade":7},{"percent":75,"grade":8},{"percent":85,"grade":9},{"percent":95,"grade":10}]'::jsonb))) where id=b.id;
  end if;
  update public.grading_batches set total_submissions=(select count(*) from public.submissions where batch_id=b.id),processed_submissions=(select count(*) from public.submissions where batch_id=b.id and status in ('proposed','needs_review','completed')),grading_started_at=coalesce(grading_started_at,clock_timestamp()),status='processing' where id=b.id;
  update public.submissions set status='processing',variant_id=p_variant,grading_attempt_id=token,grading_lease_until=clock_timestamp()+interval '180 seconds',grading_error=null where id=s.id;
  perform set_config('private.grading_workflow','off',true);
  return token;
end; $$;

-- Fail closed when an auto-accepted payload omits actual recognition or AI flags.
create or replace function public.finish_grading_submission(p_batch uuid, p_submission uuid, p_attempt uuid, p_answers jsonb, p_student_name text)
returns void language plpgsql security invoker set search_path = '' as $$
declare b public.grading_batches; s public.submissions; a jsonb; q public.questions; needs boolean := false; n integer; source_page uuid; source_id text; page_count integer;
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
    select count(*) into page_count from public.submission_pages where submission_id=s.id;
    source_page:=(a->>'page_id')::uuid;
    if source_page is null then
      if page_count>1 and (a->'crop'<>'null'::jsonb or not (a->'flags' ? 'ambiguous')) then raise exception 'Identify source page' using errcode='PT422'; end if;
      select id into source_page from public.submission_pages where submission_id=s.id order by page_index,id limit 1;
    end if;
    if not exists(select 1 from public.submission_pages where id=source_page and submission_id=s.id) then raise exception 'Source page unavailable' using errcode='PT404'; end if;
    if a ? 'page_ids' then
      if jsonb_typeof(a->'page_ids') is distinct from 'array' or jsonb_array_length(a->'page_ids')>10 then raise exception 'Invalid source pages' using errcode='PT422'; end if;
      for source_id in select value from jsonb_array_elements_text(a->'page_ids') loop
       if not exists(select 1 from public.submission_pages where id=source_id::uuid and submission_id=s.id) then raise exception 'Source page unavailable' using errcode='PT404'; end if;
      end loop;
    end if;
    if b.calibration_enabled and b.calibration_profile is null and s.id=any(b.calibration_samples) and a->>'review_status'='auto_accepted' then raise exception 'Teacher must review trial answers' using errcode='PT422'; end if;
    -- Auto acceptance requires a visibly recognized answer as well as safe flags.
    if a->>'review_status'='auto_accepted' and (
      (nullif(btrim(a->>'text'),'') is null and case when jsonb_typeof(a->'choice_ids')='array' then jsonb_array_length(a->'choice_ids')=0 else true end)
      or (q.type='open_response' and not (a->'flags' ? 'ai_judgment' and a->'flags' ? 'open_response')) or
      (q.type='open_response' and (not coalesce((b.grading_preferences->>'auto_confirm_open')::boolean,false) or not coalesce((b.grading_preferences->>'auto_confirm_ai')::boolean,false) or not exists(select 1 from public.answer_keys k where k.question_id=q.id and (nullif(btrim(k.rubric#>>'{}'),'') is not null or nullif(btrim(k.expected_answer#>>'{}'),'') is not null)))) or not coalesce((b.grading_preferences->>'auto_confirm')::boolean,true)
      or (a->>'confidence')::numeric < coalesce((b.grading_preferences->>'confidence_threshold')::numeric,0.95)
      or jsonb_typeof(a->'flags') is distinct from 'array'
      or exists(select 1 from jsonb_array_elements_text(a->'flags') flag where flag not in ('ai_judgment','open_response'))
      or (a->'flags' ? 'open_response' and (q.type<>'open_response' or not coalesce((b.grading_preferences->>'auto_confirm_open')::boolean,false)))
      or (a->'flags' ? 'ai_judgment' and not coalesce((b.grading_preferences->>'auto_confirm_ai')::boolean,false))
    ) then raise exception 'Review required' using errcode='PT422'; end if;
    needs := needs or a->>'review_status'='needs_review';
    insert into public.submission_answers(submission_id,question_id,recognized_answer,proposed_score,final_score,confidence,reasoning_summary,review_status)
    values(s.id,q.id,jsonb_build_object('text',a->'text','choice_ids',a->'choice_ids','flags',a->'flags','crop',a->'crop','page_id',source_page,'page_ids',coalesce(a->'page_ids',jsonb_build_array(source_page))),(a->>'proposed_score')::numeric,
      case when a->>'review_status'='auto_accepted' then (a->>'proposed_score')::numeric else null end,(a->>'confidence')::numeric,a->>'explanation',(a->>'review_status'));
  end loop;
  update public.submissions set status=case when needs then 'needs_review' else 'proposed' end,student_name=nullif(btrim(p_student_name),''),grading_lease_until=null,
    proposed_score=(select sum(proposed_score) from public.submission_answers where submission_id=s.id),
    max_score=(select sum(max_score) from public.questions where worksheet_id=b.answer_key_worksheet_id and variant_id is not distinct from s.variant_id) where id=s.id;
  update public.grading_batches set processed_submissions=(select count(*) from public.submissions where batch_id=b.id and status in ('proposed','needs_review','completed')),
    status=case when exists(select 1 from public.submissions where batch_id=b.id and status in ('uploaded','processing','failed')) then 'processing' else 'review' end where id=b.id;
  perform set_config('private.grading_workflow','off',true);
end; $$;


create or replace function public.reserve_ai_run(p_model text,p_purpose text,p_input_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); run_id uuid; running integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 100 or p_purpose is null
    or p_purpose not in ('worksheet_generation','question_regeneration','answer_key_parsing','submission_grading','grading_summary','debate_topics','grading_calibration')
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
revoke all on function public.reserve_ai_run(text,text,text) from public, anon, service_role;
grant execute on function public.reserve_ai_run(text,text,text) to authenticated;



create function private.guard_calibration_feedback() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_setting('private.calibration_feedback',true) is distinct from 'on' then raise exception 'Use calibration feedback workflow' using errcode='PT409'; end if;
 return new;
end; $$;
create trigger guard_calibration_feedback before insert or update on public.grading_calibration_feedback for each row execute function private.guard_calibration_feedback();
revoke all on function private.guard_calibration_feedback() from public,anon,authenticated,service_role;
