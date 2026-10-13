-- Base questions keep variant_id NULL for backwards compatibility (Variant 1).
-- Additional variants use stable UUIDs and contiguous indexes starting at 1.
-- Every variant, question and answer key is validated and saved in one transaction.
alter table public.worksheet_variants drop constraint worksheet_variants_worksheet_id_variant_index_key;
alter table public.worksheet_variants add constraint worksheet_variants_worksheet_id_variant_index_key
  unique (worksheet_id, variant_index) deferrable initially deferred;

create or replace function public.save_teacher_worksheet(
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
  entry jsonb;
  variant jsonb;
  question_entries jsonb := '[]'::jsonb;
  variant_ids uuid[] := '{}';
  variant_labels text[] := array['вариант 1'];
  target_variant_id uuid;
  variant_position integer := 1;
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
    or jsonb_array_length(p_document->'questions') > 100
    or (p_document ? 'variants' and jsonb_typeof(p_document->'variants') is distinct from 'array') then
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
      or exists (select 1 from public.grading_batches b where b.worksheet_id = p_id) then
      raise exception 'Worksheet is read only' using errcode = 'PT409';
    end if;
    if p_expected_updated_at is null or previous.updated_at <> p_expected_updated_at then
      raise exception 'Worksheet revision changed' using errcode = 'PT412';
    end if;
  end if;

  if jsonb_array_length(coalesce(p_document->'variants', '[]'::jsonb)) > 9 then
    raise exception 'Too many variants' using errcode = 'PT422';
  end if;
  for question in select value from jsonb_array_elements(p_document->'questions') loop
    question_entries := question_entries || jsonb_build_array(jsonb_build_object('question', question, 'variant_id', null, 'order_index', position));
    position := position + 1;
  end loop;
  for variant in select value from jsonb_array_elements(coalesce(p_document->'variants', '[]'::jsonb)) loop
    if jsonb_typeof(variant) is distinct from 'object'
      or jsonb_typeof(variant->'id') is distinct from 'string'
      or jsonb_typeof(variant->'label') is distinct from 'string'
      or char_length(btrim(variant->>'label')) not between 1 and 80
      or jsonb_typeof(variant->'questions') is distinct from 'array'
      or jsonb_array_length(variant->'questions') > 100
      or (status = 'ready' and jsonb_array_length(variant->'questions') = 0) then
      raise exception 'Invalid worksheet variant' using errcode = 'PT422';
    end if;
    target_variant_id := (variant->>'id')::uuid;
    if target_variant_id = any(variant_ids) or lower(btrim(variant->>'label')) = any(variant_labels) then
      raise exception 'Duplicate worksheet variant' using errcode = 'PT422';
    end if;
    variant_ids := array_append(variant_ids, target_variant_id);
    variant_labels := array_append(variant_labels, lower(btrim(variant->>'label')));
    if exists (select 1 from public.worksheet_variants v where v.id = target_variant_id and v.worksheet_id <> worksheet_save.worksheet_id) then
      raise exception 'Variant unavailable' using errcode = 'PT404';
    end if;
    position := 0;
    for question in select value from jsonb_array_elements(variant->'questions') loop
      question_entries := question_entries || jsonb_build_array(jsonb_build_object('question', question, 'variant_id', target_variant_id, 'order_index', position));
      position := position + 1;
    end loop;
  end loop;
  if jsonb_array_length(question_entries) > 300 then
    raise exception 'Too many questions' using errcode = 'PT422';
  end if;

  -- Validate every question before the worksheet or its children are changed.
  for entry in select value from jsonb_array_elements(question_entries) loop
    question := entry->'question';
    target_variant_id := (entry->>'variant_id')::uuid;
    position := (entry->>'order_index')::integer;
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
    if exists (select 1 from public.questions q where q.id = target_question_id and q.worksheet_id = worksheet_save.worksheet_id and q.variant_id is distinct from target_variant_id) then
      raise exception 'Question variant is immutable' using errcode = 'PT422';
    end if;
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
  delete from public.worksheet_variants v where v.worksheet_id = worksheet_save.worksheet_id and not(v.id = any(variant_ids));
  for variant in select value from jsonb_array_elements(coalesce(p_document->'variants', '[]'::jsonb)) loop
    insert into public.worksheet_variants(id, worksheet_id, label, variant_index)
      values ((variant->>'id')::uuid, worksheet_id, btrim(variant->>'label'), variant_position)
      on conflict (id) do update set label = excluded.label, variant_index = excluded.variant_index;
    variant_position := variant_position + 1;
  end loop;
  for entry in select value from jsonb_array_elements(question_entries) loop
    question := entry->'question';
    target_variant_id := (entry->>'variant_id')::uuid;
    position := (entry->>'order_index')::integer;
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
      values (target_question_id, worksheet_id, target_variant_id, position, question->>'type', question->>'prompt', (question->>'max_score')::numeric, metadata)
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

revoke all on function public.save_teacher_worksheet(jsonb, uuid, timestamptz) from public, anon;
grant execute on function public.save_teacher_worksheet(jsonb, uuid, timestamptz) to authenticated;
