-- Initial domain schema. PostgreSQL 15+ (Supabase project uses PostgreSQL 17).
-- Parent relations define ownership; user-editable JWT metadata is never consulted.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 80),
  school_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  grade smallint check (grade between 1 and 12),
  subject text,
  student_count integer check (student_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id)
);

create table public.worksheets (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  subject text,
  grade smallint check (grade between 1 and 12),
  source text not null check (source in ('generated', 'uploaded')),
  status text not null default 'draft' check (status in ('draft', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id)
);

create table public.worksheet_variants (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references public.worksheets(id) on delete cascade,
  label text not null check (btrim(label) <> ''),
  variant_index integer not null check (variant_index >= 0),
  created_at timestamptz not null default now(),
  unique (worksheet_id, variant_index),
  unique (id, worksheet_id)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references public.worksheets(id) on delete cascade,
  variant_id uuid,
  order_index integer not null check (order_index >= 0),
  type text not null check (type in ('multiple_choice', 'short_answer', 'numeric', 'open_response')),
  prompt text not null check (btrim(prompt) <> ''),
  max_score numeric not null check (max_score >= 0 and max_score < 'Infinity'::numeric),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (variant_id, worksheet_id) references public.worksheet_variants(id, worksheet_id) deferrable initially deferred,
  unique nulls not distinct (worksheet_id, variant_id, order_index)
);

create table public.answer_keys (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.questions(id) on delete cascade,
  expected_answer jsonb not null,
  rubric jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.grading_batches (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  worksheet_id uuid,
  class_id uuid,
  title text not null check (btrim(title) <> ''),
  status text not null default 'draft' check (status in ('draft', 'uploading', 'ready', 'processing', 'review', 'completed', 'failed')),
  total_submissions integer not null default 0 check (total_submissions >= 0),
  processed_submissions integer not null default 0 check (processed_submissions >= 0 and processed_submissions <= total_submissions),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Never delete a worksheet still needed by a grading batch; archive it instead.
  foreign key (worksheet_id, teacher_id) references public.worksheets(id, teacher_id) deferrable initially deferred,
  -- Class deletion retains grading history and clears only the class reference.
  foreign key (class_id, teacher_id) references public.classes(id, teacher_id) on delete set null (class_id)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.grading_batches(id) on delete cascade,
  student_name text,
  variant_id uuid references public.worksheet_variants(id) deferrable initially deferred,
  status text not null default 'draft' check (btrim(status) <> ''),
  proposed_score numeric check (proposed_score >= 0 and proposed_score < 'Infinity'::numeric),
  final_score numeric check (final_score >= 0 and final_score < 'Infinity'::numeric),
  max_score numeric check (max_score >= 0 and max_score < 'Infinity'::numeric),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (proposed_score is null or (max_score is not null and proposed_score <= max_score)),
  check (final_score is null or (max_score is not null and final_score <= max_score))
);

create table public.submission_pages (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  storage_path text not null check (btrim(storage_path) <> ''),
  page_index integer not null check (page_index >= 0),
  width integer check (width > 0),
  height integer check (height > 0),
  created_at timestamptz not null default now(),
  unique (submission_id, page_index)
);

create table public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  question_id uuid not null references public.questions(id) deferrable initially deferred,
  recognized_answer jsonb,
  proposed_score numeric check (proposed_score >= 0 and proposed_score < 'Infinity'::numeric),
  final_score numeric check (final_score >= 0 and final_score < 'Infinity'::numeric),
  confidence numeric check (confidence >= 0 and confidence <= 1),
  reasoning_summary text,
  review_status text not null default 'needs_review' check (review_status in ('auto_accepted', 'needs_review', 'teacher_confirmed', 'teacher_changed')),
  crop_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, question_id)
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check (btrim(purpose) <> ''),
  model text not null check (btrim(model) <> ''),
  input_hash text,
  status text not null default 'queued' check (btrim(status) <> ''),
  output jsonb,
  duration_ms integer check (duration_ms >= 0),
  created_at timestamptz not null default now()
);

-- Leading ownership/parent columns support both RLS and usual list/join paths.
create index classes_teacher_created_idx on public.classes(teacher_id, created_at desc);
create index worksheets_teacher_status_created_idx on public.worksheets(teacher_id, status, created_at desc);
create index questions_variant_idx on public.questions(variant_id, worksheet_id);
create index grading_batches_teacher_status_created_idx on public.grading_batches(teacher_id, status, created_at desc);
create index grading_batches_worksheet_teacher_idx on public.grading_batches(worksheet_id, teacher_id);
create index grading_batches_class_teacher_idx on public.grading_batches(class_id, teacher_id);
create index submissions_batch_status_idx on public.submissions(batch_id, status);
create index submissions_variant_idx on public.submissions(variant_id);
create index submission_answers_question_idx on public.submission_answers(question_id);
create index submission_answers_submission_review_idx on public.submission_answers(submission_id, review_status);
create index ai_runs_teacher_status_created_idx on public.ai_runs(teacher_id, status, created_at desc);

create function private.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

-- IDs and parent ownership links cannot be repointed by a general UPDATE.
-- Moving a domain object requires an explicit future workflow, not an ID edit.
create function private.prevent_reparenting()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  column_name text;
begin
  foreach column_name in array tg_argv loop
    if to_jsonb(new) -> column_name is distinct from to_jsonb(old) -> column_name then
      raise exception 'Object identity and parent ownership are immutable' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

-- Null worksheet_id permits external paper uploads before an answer key exists.
-- Once linked, a grading batch keeps that worksheet for a consistent audit trail.
create function private.keep_batch_worksheet()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.worksheet_id is not null and new.worksheet_id is distinct from old.worksheet_id then
    raise exception 'A linked grading worksheet cannot be replaced' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.validate_submission_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  batch_worksheet uuid;
  variant_worksheet uuid;
begin
  -- Lock the parent against concurrent worksheet reassignment while validating.
  select b.worksheet_id into batch_worksheet from public.grading_batches b
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
  if exists (
    select 1 from public.submission_answers a join public.questions q on q.id = a.question_id
    where a.submission_id = new.id and q.variant_id is not null and q.variant_id is distinct from new.variant_id
  ) then
    raise exception 'Variant conflicts with existing answers' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.validate_answer_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  batch_worksheet uuid;
  submission_variant uuid;
  question_worksheet uuid;
  question_variant uuid;
  question_max numeric;
begin
  select b.worksheet_id, s.variant_id into batch_worksheet, submission_variant
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

create function private.protect_scored_question()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    select 1 from public.submission_answers a join public.submissions s on s.id = a.submission_id
    where a.question_id = new.id and (
      a.proposed_score > new.max_score or a.final_score > new.max_score
      or (new.variant_id is not null and new.variant_id is distinct from s.variant_id)
    )
  ) then
    raise exception 'Question change conflicts with existing grading answers' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- The sole SECURITY DEFINER exception is an internal auth.users trigger.
-- It cannot be called as an API RPC, trusts NEW.id only, and uses metadata for display.
create function private.create_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_schema <> 'auth' or tg_table_name <> 'users' or tg_op <> 'INSERT' then
    raise exception 'Profile creation is restricted to auth signup';
  end if;
  insert into public.profiles (id, full_name)
  values (new.id, case when jsonb_typeof(new.raw_user_meta_data -> 'full_name') = 'string'
    then left(btrim(new.raw_user_meta_data ->> 'full_name'), 80) else '' end);
  return new;
end;
$$;

revoke all on function private.set_updated_at(), private.prevent_reparenting(),
  private.keep_batch_worksheet(), private.validate_submission_context(),
  private.validate_answer_context(), private.protect_scored_question(), private.create_user_profile()
  from public, anon, authenticated, service_role;
create trigger teacher_copilot_create_profile after insert on auth.users
  for each row execute function private.create_user_profile();

insert into public.profiles (id, full_name)
select id, case when jsonb_typeof(raw_user_meta_data -> 'full_name') = 'string'
  then left(btrim(raw_user_meta_data ->> 'full_name'), 80) else '' end
from auth.users on conflict (id) do nothing;

create trigger submissions_context before insert or update of variant_id, batch_id on public.submissions
  for each row execute function private.validate_submission_context();
create trigger submission_answers_context before insert or update of question_id, submission_id, proposed_score, final_score on public.submission_answers
  for each row execute function private.validate_answer_context();
create trigger questions_protect_grading before update of max_score, variant_id on public.questions
  for each row execute function private.protect_scored_question();
create trigger grading_batches_keep_worksheet before update of worksheet_id on public.grading_batches
  for each row execute function private.keep_batch_worksheet();

-- Trigger setup and grants are explicit lists, limited to this migration's tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles', 'classes', 'worksheets', 'questions', 'answer_keys', 'grading_batches', 'submissions', 'submission_answers'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', table_name);
  end loop;
  foreach table_name in array array['classes', 'worksheets', 'grading_batches', 'ai_runs'] loop
    execute format('create trigger immutable_identity before update on public.%I for each row execute function private.prevent_reparenting(''id'', ''teacher_id'')', table_name);
  end loop;
  foreach table_name in array array['worksheet_variants', 'questions'] loop
    execute format('create trigger immutable_identity before update on public.%I for each row execute function private.prevent_reparenting(''id'', ''worksheet_id'')', table_name);
  end loop;
end;
$$;
create trigger immutable_identity before update on public.answer_keys for each row execute function private.prevent_reparenting('id', 'question_id');
create trigger immutable_identity before update on public.submissions for each row execute function private.prevent_reparenting('id', 'batch_id');
create trigger immutable_identity before update on public.submission_pages for each row execute function private.prevent_reparenting('id', 'submission_id');
create trigger immutable_identity before update on public.submission_answers for each row execute function private.prevent_reparenting('id', 'submission_id', 'question_id');

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.worksheets enable row level security;
alter table public.worksheet_variants enable row level security;
alter table public.questions enable row level security;
alter table public.answer_keys enable row level security;
alter table public.grading_batches enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_pages enable row level security;
alter table public.submission_answers enable row level security;
alter table public.ai_runs enable row level security;

create policy profiles_read_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy classes_own on public.classes for all to authenticated using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy worksheets_own on public.worksheets for all to authenticated using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy grading_batches_own on public.grading_batches for all to authenticated using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy ai_runs_own on public.ai_runs for all to authenticated using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));

create policy worksheet_variants_own on public.worksheet_variants for all to authenticated
  using (exists (select 1 from public.worksheets w where w.id = worksheet_id and w.teacher_id = (select auth.uid())))
  with check (exists (select 1 from public.worksheets w where w.id = worksheet_id and w.teacher_id = (select auth.uid())));
create policy questions_own on public.questions for all to authenticated
  using (exists (select 1 from public.worksheets w where w.id = worksheet_id and w.teacher_id = (select auth.uid())))
  with check (exists (select 1 from public.worksheets w where w.id = worksheet_id and w.teacher_id = (select auth.uid())));
create policy answer_keys_own on public.answer_keys for all to authenticated
  using (exists (select 1 from public.questions q join public.worksheets w on w.id = q.worksheet_id where q.id = question_id and w.teacher_id = (select auth.uid())))
  with check (exists (select 1 from public.questions q join public.worksheets w on w.id = q.worksheet_id where q.id = question_id and w.teacher_id = (select auth.uid())));
create policy submissions_own on public.submissions for all to authenticated
  using (exists (select 1 from public.grading_batches b where b.id = batch_id and b.teacher_id = (select auth.uid())))
  with check (exists (select 1 from public.grading_batches b where b.id = batch_id and b.teacher_id = (select auth.uid())));
create policy submission_pages_own on public.submission_pages for all to authenticated
  using (exists (select 1 from public.submissions s join public.grading_batches b on b.id = s.batch_id where s.id = submission_id and b.teacher_id = (select auth.uid())))
  with check (
    split_part(storage_path, '/', 1) = (select auth.uid())::text
    and exists (select 1 from public.submissions s join public.grading_batches b on b.id = s.batch_id where s.id = submission_id and b.teacher_id = (select auth.uid()))
  );
create policy submission_answers_own on public.submission_answers for all to authenticated
  using (exists (select 1 from public.submissions s join public.grading_batches b on b.id = s.batch_id where s.id = submission_id and b.teacher_id = (select auth.uid())))
  with check (
    (crop_storage_path is null or split_part(crop_storage_path, '/', 1) = (select auth.uid())::text)
    and exists (select 1 from public.submissions s join public.grading_batches b on b.id = s.batch_id where s.id = submission_id and b.teacher_id = (select auth.uid()))
    and exists (select 1 from public.questions q join public.worksheets w on w.id = q.worksheet_id where q.id = question_id and w.teacher_id = (select auth.uid()))
  );

-- Do not depend on project-wide default grants. Anonymous clients have no table access.
grant usage on schema public to authenticated, service_role;
do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles', 'classes', 'worksheets', 'worksheet_variants', 'questions', 'answer_keys', 'grading_batches', 'submissions', 'submission_pages', 'submission_answers', 'ai_runs'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    if table_name <> 'profiles' then
      execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    end if;
  end loop;
end;
$$;
grant select on public.profiles to authenticated;
grant update (full_name, school_name) on public.profiles to authenticated;
