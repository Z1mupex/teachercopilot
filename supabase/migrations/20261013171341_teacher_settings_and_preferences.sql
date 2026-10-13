-- Teacher-owned settings. No privileged client or user-metadata authorization.
create function private.valid_grade_scale(value jsonb, maximum integer) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare row jsonb; previous_percent numeric := -1; previous_grade numeric := -1; p numeric; g numeric;
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) not between 2 and 11 then return false; end if;
  for row in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(row->'percent') is distinct from 'number' or jsonb_typeof(row->'grade') is distinct from 'number' then return false; end if;
    p := (row->>'percent')::numeric; g := (row->>'grade')::numeric;
    if p not between 0 and 100 or g not between 0 and maximum or g <> trunc(g) or p <= previous_percent or g <= previous_grade then return false; end if;
    if previous_percent=-1 and p<>0 then return false; end if;
    previous_percent:=p; previous_grade:=g;
  end loop;
  return previous_grade=maximum;
end; $$;
create function private.valid_teacher_settings(d jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare k text; item jsonb;
begin
  if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>16000 then return false; end if;
  foreach k in array array['auto_confirm','auto_confirm_ai','fraction_equivalence','ignore_case','typo_tolerance','library_worksheets','library_ai','notify_completed','notify_review'] loop
    if jsonb_typeof(d->k) is distinct from 'boolean' then return false; end if;
  end loop;
  foreach k in array array['full_name','school_name','signature','default_folder','ui_language','ai_preset'] loop
    if jsonb_typeof(d->k) is distinct from 'string' then return false; end if;
  end loop;
  if char_length(btrim(d->>'full_name')) not between 1 and 80 or char_length(d->>'school_name')>160 or char_length(d->>'signature')>500 or char_length(btrim(d->>'default_folder')) not between 1 and 80 or d->>'ui_language'<>'ru' or d->>'ai_preset' not in ('careful','balanced','fast') then return false; end if;
  foreach k in array array['subjects','teaching_classes','default_tags'] loop
    if jsonb_typeof(d->k) is distinct from 'array' or jsonb_array_length(d->k)>30 then return false; end if;
    for item in select * from jsonb_array_elements(d->k) loop
      if jsonb_typeof(item) is distinct from 'string' or char_length(btrim(item#>>'{}')) not between 1 and 80 then return false; end if;
    end loop;
  end loop;
  if jsonb_typeof(d->'confidence_threshold') is distinct from 'number' or (d->>'confidence_threshold')::numeric not between 0.5 and 1 then return false; end if;
  if not (d ? 'rounding_digits') or (d->'rounding_digits'<>'null'::jsonb and (jsonb_typeof(d->'rounding_digits')<>'number' or (d->>'rounding_digits')::numeric not between 0 and 8 or (d->>'rounding_digits')::numeric<>trunc((d->>'rounding_digits')::numeric))) then return false; end if;
  if not (d ? 'retention_days') or (d->'retention_days'<>'null'::jsonb and d->'retention_days' not in ('7'::jsonb,'30'::jsonb,'90'::jsonb)) then return false; end if;
  return private.valid_grade_scale(d->'fo_scale',10) and private.valid_grade_scale(d->'control_scale',5);
end; $$;
create table public.teacher_settings (
  teacher_id uuid primary key references public.profiles(id) on delete cascade,
  document jsonb not null check(private.valid_teacher_settings(document)),
  revision integer not null default 1 check(revision>0),
  updated_at timestamptz not null default now()
);
alter table public.teacher_settings enable row level security;
create policy teacher_settings_own on public.teacher_settings for all to authenticated using(teacher_id=(select auth.uid())) with check(teacher_id=(select auth.uid()));
revoke all on public.teacher_settings from anon,authenticated;
grant select,insert,update on public.teacher_settings to authenticated;
create function public.save_teacher_settings(p_document jsonb,p_revision integer) returns integer
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); current_revision integer;
begin
  perform 1 from public.profiles where id=actor for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if not private.valid_teacher_settings(p_document) then raise exception 'Invalid settings' using errcode='PT422'; end if;
  select revision into current_revision from public.teacher_settings where teacher_id=actor for update;
  if coalesce(current_revision,0)<>p_revision then raise exception 'Settings changed' using errcode='PT412'; end if;
  update public.profiles set full_name=btrim(p_document->>'full_name'), school_name=nullif(btrim(p_document->>'school_name'),'') where id=actor;
  insert into public.teacher_settings(teacher_id,document) values(actor,p_document)
    on conflict(teacher_id) do update set document=excluded.document,revision=teacher_settings.revision+1,updated_at=clock_timestamp()
    returning revision into current_revision;
  return current_revision;
end; $$;
revoke all on function public.save_teacher_settings(jsonb,integer) from public,anon,service_role;
grant execute on function public.save_teacher_settings(jsonb,integer) to authenticated;
-- Pure validation functions are needed by invoker RPCs/check constraints, never exposed.
grant usage on schema private to authenticated;
revoke all on function private.valid_grade_scale(jsonb,integer), private.valid_teacher_settings(jsonb) from public,anon,service_role;
grant execute on function private.valid_grade_scale(jsonb,integer), private.valid_teacher_settings(jsonb) to authenticated;

alter table public.grading_batches add column grading_preferences jsonb, add column grade_conversion jsonb, add column completed_at timestamptz;
create function private.guard_batch_preferences() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' and (new.grading_preferences is not null or new.grade_conversion is not null) then raise exception 'Use settings workflow' using errcode='PT409'; end if;
  if tg_op='UPDATE' and new.grading_preferences is distinct from old.grading_preferences and current_setting('private.grading_workflow',true) is distinct from 'on' then raise exception 'Immutable grading preferences' using errcode='PT409'; end if;
  if tg_op='UPDATE' and new.grade_conversion is distinct from old.grade_conversion and current_setting('private.grading_workflow',true) is distinct from 'on' and current_setting('private.assessment_settings',true) is distinct from 'on' then raise exception 'Use conversion workflow' using errcode='PT409'; end if;
  if tg_op='UPDATE' and new.status='completed' and old.status<>'completed' then new.completed_at:=clock_timestamp(); end if;
  return new;
end; $$;
create trigger guard_batch_preferences before insert or update on public.grading_batches for each row execute function private.guard_batch_preferences();
revoke all on function private.guard_batch_preferences() from public,anon,authenticated,service_role;
create function public.save_batch_grade_conversion(p_batch uuid,p_revision timestamptz,p_kind text,p_scale jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare b public.grading_batches;
begin
  select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if b.updated_at is distinct from p_revision then raise exception 'Changed' using errcode='PT412'; end if;
  if p_kind not in ('fo','control') or not private.valid_grade_scale(p_scale,case when p_kind='fo' then 10 else 5 end) then raise exception 'Invalid scale' using errcode='PT422'; end if;
  perform set_config('private.assessment_settings','on',true);
  update public.grading_batches set grade_conversion=jsonb_build_object('kind',p_kind,'scale',p_scale) where id=b.id;
  perform set_config('private.assessment_settings','off',true);
end; $$;
revoke all on function public.save_batch_grade_conversion(uuid,timestamptz,text,jsonb) from public,anon,service_role;
grant execute on function public.save_batch_grade_conversion(uuid,timestamptz,text,jsonb) to authenticated;

create table public.teacher_library_entries (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.profiles(id) on delete cascade,
  worksheet_id uuid not null, entry_key text not null, kind text not null check(kind in ('worksheet','question')),
  title text not null, folder text not null, tags text[] not null default '{}', content jsonb,
  created_at timestamptz not null default now(),
  foreign key(worksheet_id,teacher_id) references public.worksheets(id,teacher_id) on delete cascade,
  unique(worksheet_id,entry_key)
);
create index teacher_library_recent on public.teacher_library_entries(teacher_id,created_at desc,id);
alter table public.teacher_library_entries enable row level security;
create policy teacher_library_own on public.teacher_library_entries for all to authenticated using(teacher_id=(select auth.uid())) with check(teacher_id=(select auth.uid()));
revoke all on public.teacher_library_entries from anon,authenticated;
grant select,insert,update,delete on public.teacher_library_entries to authenticated;
create function public.save_worksheet_with_library(p_document jsonb,p_id uuid default null,p_expected_updated_at timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; prefs jsonb; w uuid; q jsonb;
begin
  result:=public.save_teacher_worksheet(p_document,p_id,p_expected_updated_at); w:=(result->>'id')::uuid;
  select document into prefs from public.teacher_settings where teacher_id=auth.uid();
  if coalesce((prefs->>'library_worksheets')::boolean,false) then
    insert into public.teacher_library_entries(teacher_id,worksheet_id,entry_key,kind,title,folder,tags)
      values(auth.uid(),w,'worksheet','worksheet',p_document->>'title',prefs->>'default_folder',array(select jsonb_array_elements_text(prefs->'default_tags')))
      on conflict(worksheet_id,entry_key) do update set title=excluded.title;
  end if;
  if coalesce((prefs->>'library_ai')::boolean,false) then
    for q in select value from jsonb_array_elements(p_document->'questions')
      union all select question.value from jsonb_array_elements(coalesce(p_document->'variants','[]')) variant cross join lateral jsonb_array_elements(variant.value->'questions') question loop
      if q->'generation_context' is not null and q->'generation_context'<>'null'::jsonb then
        insert into public.teacher_library_entries(teacher_id,worksheet_id,entry_key,kind,title,folder,tags,content)
          values(auth.uid(),w,q->>'id','question',left(q->>'prompt',200),prefs->>'default_folder',array(select jsonb_array_elements_text(prefs->'default_tags')),q)
          on conflict(worksheet_id,entry_key) do update set title=excluded.title,content=excluded.content;
      end if;
    end loop;
  end if;
  return result;
end; $$;
revoke all on function public.save_worksheet_with_library(jsonb,uuid,timestamptz) from public,anon,service_role;
grant execute on function public.save_worksheet_with_library(jsonb,uuid,timestamptz) to authenticated;

create table public.removed_submission_images (
  page_id uuid primary key references public.submission_pages(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade, removed_at timestamptz not null default now()
);
create index removed_images_teacher on public.removed_submission_images(teacher_id);
alter table public.removed_submission_images enable row level security;
create policy removed_images_read on public.removed_submission_images for select to authenticated using(teacher_id=(select auth.uid()));
create policy removed_images_insert on public.removed_submission_images for insert to authenticated with check(teacher_id=(select auth.uid()) and exists(select 1 from public.submission_pages p join public.submissions s on s.id=p.submission_id join public.grading_batches b on b.id=s.batch_id where p.id=page_id and b.teacher_id=(select auth.uid()) and b.status='completed'));
revoke all on public.removed_submission_images from anon,authenticated;
grant select,insert on public.removed_submission_images to authenticated;

alter table public.grading_batches add constraint grading_batches_owner_identity unique(id,teacher_id);
create table public.teacher_notifications (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.profiles(id) on delete cascade,
  batch_id uuid not null, kind text not null check(kind in ('completed','review')), item_count integer not null check(item_count>=0),
  created_at timestamptz not null default now(), read_at timestamptz,
  foreign key(batch_id,teacher_id) references public.grading_batches(id,teacher_id) on delete cascade, unique(batch_id,kind)
);
create index teacher_notifications_recent on public.teacher_notifications(teacher_id,created_at desc,id);
alter table public.teacher_notifications enable row level security;
create policy notifications_own on public.teacher_notifications for all to authenticated using(teacher_id=(select auth.uid())) with check(teacher_id=(select auth.uid()));
revoke all on public.teacher_notifications from anon,authenticated;
grant select,insert on public.teacher_notifications to authenticated;
grant update(read_at,item_count) on public.teacher_notifications to authenticated;
create function private.notify_grading_change() returns trigger language plpgsql security invoker set search_path='' as $$
declare prefs jsonb; amount integer;
begin
  if new.status not in ('review','completed') or (new.status=old.status and new.processed_submissions=old.processed_submissions) then return new; end if;
  select document into prefs from public.teacher_settings where teacher_id=new.teacher_id;
  if new.status='completed' and coalesce((prefs->>'notify_completed')::boolean,true) then
    insert into public.teacher_notifications(teacher_id,batch_id,kind,item_count) values(new.teacher_id,new.id,'completed',new.total_submissions) on conflict(batch_id,kind) do nothing;
  elsif new.status='review' and coalesce((prefs->>'notify_review')::boolean,true) then
    select count(*) into amount from public.submission_answers a join public.submissions s on s.id=a.submission_id where s.batch_id=new.id and a.review_status='needs_review';
    if amount>0 then insert into public.teacher_notifications(teacher_id,batch_id,kind,item_count) values(new.teacher_id,new.id,'review',amount) on conflict(batch_id,kind) do update set item_count=excluded.item_count; end if;
  end if;
  return new;
end; $$;
create trigger notify_grading_change after update on public.grading_batches for each row execute function private.notify_grading_change();
revoke all on function private.notify_grading_change() from public,anon,authenticated,service_role;

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
    select document into prefs from public.teacher_settings where teacher_id=auth.uid();
    update public.grading_batches set grading_preferences=jsonb_build_object(
      'auto_confirm',coalesce((prefs->>'auto_confirm')::boolean,true),
      'auto_confirm_ai',coalesce((prefs->>'auto_confirm_ai')::boolean,false),
      'confidence_threshold',coalesce((prefs->>'confidence_threshold')::numeric,0.95),
      'fraction_equivalence',coalesce((prefs->>'fraction_equivalence')::boolean,true),
      'ignore_case',coalesce((prefs->>'ignore_case')::boolean,false),
      'typo_tolerance',coalesce((prefs->>'typo_tolerance')::boolean,false),
      'rounding_digits',coalesce(prefs->'rounding_digits','null'::jsonb)
    ),grade_conversion=coalesce(grade_conversion,jsonb_build_object('kind','fo','scale',coalesce(prefs->'fo_scale','[{"percent":0,"grade":0},{"percent":5,"grade":1},{"percent":15,"grade":2},{"percent":25,"grade":3},{"percent":35,"grade":4},{"percent":45,"grade":5},{"percent":55,"grade":6},{"percent":65,"grade":7},{"percent":75,"grade":8},{"percent":85,"grade":9},{"percent":95,"grade":10}]'::jsonb))) where id=b.id;
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
      q.type='open_response' or not coalesce((b.grading_preferences->>'auto_confirm')::boolean,true)
      or (a->>'confidence')::numeric < coalesce((b.grading_preferences->>'confidence_threshold')::numeric,0.95)
      or jsonb_typeof(a->'flags') is distinct from 'array'
      or exists(select 1 from jsonb_array_elements_text(a->'flags') flag where flag<>'ai_judgment')
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

update public.grading_batches set completed_at=updated_at where status='completed' and completed_at is null;

