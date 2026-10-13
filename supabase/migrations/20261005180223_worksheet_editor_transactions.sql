-- Worksheet editing uses one RPC transaction, preserving question/key identities.
-- Draft questions may remain incomplete; readiness is validated before any write.
alter table public.questions drop constraint questions_prompt_check;
alter table public.questions add constraint questions_prompt_length check (char_length(prompt) <= 12000);
alter table public.questions drop constraint questions_worksheet_id_variant_id_order_index_key;
alter table public.questions add constraint questions_worksheet_id_variant_id_order_index_key
  unique nulls not distinct (worksheet_id, variant_id, order_index) deferrable initially deferred;

-- A linked batch waits for an ongoing edit and vice versa. The share lock also
-- covers the previously deferred FK, closing the edit/attach concurrency window.
create function private.lock_grading_worksheet()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.worksheet_id is not null then
    perform 1 from public.worksheets w where w.id = new.worksheet_id
      and w.teacher_id = new.teacher_id for share;
    if not found then raise exception 'Worksheet unavailable' using errcode = '23503'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.lock_grading_worksheet() from public, anon, authenticated, service_role;
create trigger grading_batches_lock_worksheet before insert or update of worksheet_id on public.grading_batches
  for each row execute function private.lock_grading_worksheet();

create function public.save_teacher_worksheet(
  p_document jsonb,
  p_id uuid default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
<<worksheet_save>>
declare
  actor uuid := auth.uid();
  worksheet_id uuid := coalesce(p_id, gen_random_uuid());
  previous public.worksheets%rowtype;
  saved_updated_at timestamptz;
  question jsonb;
  option jsonb;
  target_question_id uuid;
  option_id uuid;
  question_ids uuid[] := '{}';
  option_ids uuid[];
  correct_ids uuid[];
  position integer := 0;
  metadata jsonb;
  expected_answer jsonb;
  rubric jsonb;
  status text;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_document is null or jsonb_typeof(p_document) <> 'object'
    or octet_length(p_document::text) > 750000
    or jsonb_typeof(p_document->'title') is distinct from 'string'
    or char_length(btrim(p_document->>'title')) not between 1 and 200
    or coalesce(jsonb_typeof(p_document->'subject'), 'null') not in ('null', 'string')
    or char_length(p_document->>'subject') > 120
    or coalesce(jsonb_typeof(p_document->'grade'), 'null') not in ('null', 'number')
    or (p_document->>'grade')::numeric not between 1 and 12
    or (p_document->>'grade')::numeric <> trunc((p_document->>'grade')::numeric)
    or p_document->>'status' is null or p_document->>'status' not in ('draft', 'ready')
    or jsonb_typeof(p_document->'questions') is distinct from 'array'
    or jsonb_array_length(p_document->'questions') > 100 then
    raise exception 'Invalid worksheet document' using errcode = 'PT422';
  end if;
  status := p_document->>'status';
  if status = 'ready' and jsonb_array_length(p_document->'questions') = 0 then
    raise exception 'Ready worksheet needs questions' using errcode = 'PT422';
  end if;
  if p_id is not null then
    select w.* into previous from public.worksheets w
      where w.id = p_id and w.teacher_id = actor for update;
    if not found then raise exception 'Worksheet unavailable' using errcode = 'PT404'; end if;
    if previous.source <> 'generated' or previous.status not in ('draft', 'ready')
      or exists (select 1 from public.worksheet_variants v where v.worksheet_id = p_id)
      or exists (select 1 from public.grading_batches b where b.worksheet_id = p_id) then
      raise exception 'Worksheet is read only' using errcode = 'PT409';
    end if;
    if p_expected_updated_at is null or previous.updated_at <> p_expected_updated_at then
      raise exception 'Worksheet revision changed' using errcode = 'PT412';
    end if;
  end if;

  -- Validate every question before the worksheet or its children are changed.
  for question in select value from jsonb_array_elements(p_document->'questions') loop
    if jsonb_typeof(question) <> 'object'
      or jsonb_typeof(question->'id') is distinct from 'string'
      or jsonb_typeof(question->'prompt') is distinct from 'string'
      or char_length(question->>'prompt') > 12000
      or jsonb_typeof(question->'max_score') is distinct from 'number'
      or (question->>'max_score')::numeric not between 0 and 1000
      or question->>'type' is null or question->>'type' not in ('multiple_choice', 'short_answer', 'numeric', 'open_response')
      or coalesce(jsonb_typeof(question->'difficulty'), 'null') not in ('null', 'string')
      or (question->>'difficulty' is not null and question->>'difficulty' not in ('easy', 'medium', 'hard'))
      or (status = 'ready' and btrim(question->>'prompt') = '') then
      raise exception 'Invalid worksheet question' using errcode = 'PT422';
    end if;
    target_question_id := (question->>'id')::uuid;
    if target_question_id = any(question_ids) then raise exception 'Duplicate question identity' using errcode = 'PT422'; end if;
    question_ids := array_append(question_ids, target_question_id);
    if exists (select 1 from public.questions q where q.id = target_question_id and q.worksheet_id <> worksheet_save.worksheet_id) then
      raise exception 'Question unavailable' using errcode = 'PT404';
    end if;
    if coalesce(jsonb_typeof(question->'generation_context'), 'null') not in ('null', 'object')
      or (jsonb_typeof(question->'generation_context') = 'object' and (
        jsonb_typeof(question#>'{generation_context,topic}') is distinct from 'string'
        or char_length(btrim(question#>>'{generation_context,topic}')) not between 1 and 500
        or jsonb_typeof(question#>'{generation_context,approximate_duration}') is distinct from 'number'
        or (question#>>'{generation_context,approximate_duration}')::numeric not between 1 and 240
        or (question#>>'{generation_context,approximate_duration}')::numeric <> trunc((question#>>'{generation_context,approximate_duration}')::numeric)
      )) then raise exception 'Invalid generation context' using errcode = 'PT422'; end if;
    case question->>'type'
      when 'multiple_choice' then
        if jsonb_typeof(question->'options') is distinct from 'array'
          or jsonb_array_length(question->'options') > 12
          or jsonb_typeof(question->'correct_option_ids') is distinct from 'array'
          or jsonb_array_length(question->'correct_option_ids') > 12
          or (status = 'ready' and (jsonb_array_length(question->'options') < 2 or jsonb_array_length(question->'correct_option_ids') = 0)) then
          raise exception 'Invalid choice options' using errcode = 'PT422';
        end if;
        option_ids := '{}'; correct_ids := '{}';
        for option in select value from jsonb_array_elements(question->'options') loop
          if jsonb_typeof(option->'id') is distinct from 'string'
            or jsonb_typeof(option->'text') is distinct from 'string'
            or char_length(option->>'text') > 2000
            or (status = 'ready' and btrim(option->>'text') = '') then
            raise exception 'Invalid choice option' using errcode = 'PT422';
          end if;
          option_id := (option->>'id')::uuid;
          if option_id = any(option_ids) then raise exception 'Duplicate option identity' using errcode = 'PT422'; end if;
          option_ids := array_append(option_ids, option_id);
        end loop;
        for option in select value from jsonb_array_elements(question->'correct_option_ids') loop
          if jsonb_typeof(option) <> 'string' then raise exception 'Invalid answer option' using errcode = 'PT422'; end if;
          option_id := (option#>>'{}')::uuid;
          if not(option_id = any(option_ids)) or option_id = any(correct_ids) then raise exception 'Invalid answer option' using errcode = 'PT422'; end if;
          correct_ids := array_append(correct_ids, option_id);
        end loop;
      when 'short_answer' then
        if jsonb_typeof(question->'expected_answer') is distinct from 'string'
          or char_length(question->>'expected_answer') > 4000
          or (status = 'ready' and btrim(question->>'expected_answer') = '') then
          raise exception 'Invalid short answer' using errcode = 'PT422';
        end if;
      when 'numeric' then
        if jsonb_typeof(question->'expected_answer') is distinct from 'number'
          or jsonb_typeof(question->'tolerance') is distinct from 'number'
          or (question->>'tolerance')::numeric not between 0 and 1000000 then
          raise exception 'Invalid numeric answer' using errcode = 'PT422';
        end if;
      when 'open_response' then
        if coalesce(jsonb_typeof(question->'expected_answer'), 'null') not in ('null', 'string')
          or char_length(question->>'expected_answer') > 12000
          or coalesce(jsonb_typeof(question->'rubric'), 'null') not in ('null', 'string')
          or char_length(question->>'rubric') > 12000 then
          raise exception 'Invalid open response key' using errcode = 'PT422';
        end if;
    end case;
  end loop;

  if p_id is null then
    insert into public.worksheets(id, teacher_id, title, subject, grade, source, status)
      values (worksheet_id, actor, btrim(p_document->>'title'), nullif(btrim(p_document->>'subject'), ''), (p_document->>'grade')::smallint, 'generated', status);
  else
    update public.worksheets w set title = btrim(p_document->>'title'), subject = nullif(btrim(p_document->>'subject'), ''), grade = (p_document->>'grade')::smallint, status = worksheet_save.status
      where w.id = worksheet_id and w.teacher_id = actor;
  end if;
  delete from public.questions q where q.worksheet_id = worksheet_save.worksheet_id and not(q.id = any(question_ids));
  for question in select value from jsonb_array_elements(p_document->'questions') loop
    target_question_id := (question->>'id')::uuid;
    metadata := jsonb_build_object('editor_version', 1, 'difficulty', question->'difficulty', 'generation_context', question->'generation_context');
    if question->>'type' = 'multiple_choice' then
      metadata := metadata || jsonb_build_object('options', question->'options');
      expected_answer := question->'correct_option_ids';
    else
      expected_answer := coalesce(question->'expected_answer', 'null'::jsonb);
    end if;
    if question->>'type' = 'numeric' then metadata := metadata || jsonb_build_object('tolerance', question->'tolerance'); end if;
    rubric := case when question->>'type' = 'open_response' then question->'rubric' else null end;
    insert into public.questions(id, worksheet_id, variant_id, order_index, type, prompt, max_score, metadata)
      values (target_question_id, worksheet_id, null, position, question->>'type', question->>'prompt', (question->>'max_score')::numeric, metadata)
      on conflict (id) do update set order_index = excluded.order_index, type = excluded.type, prompt = excluded.prompt, max_score = excluded.max_score, metadata = excluded.metadata;
    insert into public.answer_keys(question_id, expected_answer, rubric)
      values (target_question_id, expected_answer, rubric)
      on conflict (question_id) do update set expected_answer = excluded.expected_answer, rubric = excluded.rubric;
    position := position + 1;
  end loop;
  select w.updated_at into saved_updated_at from public.worksheets w where w.id = worksheet_id;
  return jsonb_build_object('id', worksheet_id, 'updated_at', saved_updated_at);
end;
$$;

create function public.delete_teacher_worksheet(p_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  perform 1 from public.worksheets w where w.id = p_id and w.teacher_id = actor and w.source = 'generated' for update;
  if not found then raise exception 'Worksheet unavailable' using errcode = 'PT404'; end if;
  if exists (select 1 from public.grading_batches b where b.worksheet_id = p_id) then
    raise exception 'Worksheet is read only' using errcode = 'PT409';
  end if;
  delete from public.worksheets w where w.id = p_id and w.teacher_id = actor;
  return found;
end;
$$;

-- The hourly cost quota is independent of editable application audit records.
-- Only a reservation can append; clients cannot backdate, edit or remove it.
create table private.ai_request_reservations (
  id uuid primary key,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);
create index ai_request_reservations_teacher_created_idx on private.ai_request_reservations(teacher_id, created_at desc);
alter table private.ai_request_reservations enable row level security;
revoke all on private.ai_request_reservations from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant select on private.ai_request_reservations to authenticated;
grant insert(id, teacher_id) on private.ai_request_reservations to authenticated;
create policy ai_reservations_read_own on private.ai_request_reservations for select to authenticated
  using (teacher_id = (select auth.uid()));
create policy ai_reservations_insert_own on private.ai_request_reservations for insert to authenticated
  with check (teacher_id = (select auth.uid()));

-- Serialize a teacher's reservations across tabs/instances before calling AI.
create function public.reserve_ai_run(p_model text, p_purpose text, p_input_hash text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare actor uuid := auth.uid(); run_id uuid;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 100
    or p_purpose is null or p_purpose not in ('worksheet_generation', 'question_regeneration')
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

revoke all on function public.save_teacher_worksheet(jsonb, uuid, timestamptz), public.delete_teacher_worksheet(uuid), public.reserve_ai_run(text, text, text) from public, anon, service_role;
grant execute on function public.save_teacher_worksheet(jsonb, uuid, timestamptz), public.delete_teacher_worksheet(uuid), public.reserve_ai_run(text, text, text) to authenticated;
