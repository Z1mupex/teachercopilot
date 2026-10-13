-- The unique context index already covers FK lookups (at most one batch).
drop index public.grading_batches_answer_key_teacher_idx;

create or replace function private.protect_answer_snapshot()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target uuid;
begin
  if tg_table_name = 'worksheets' then target := old.id;
  elsif tg_table_name = 'answer_keys' then
    select q.worksheet_id into target from public.questions q where q.id=coalesce(new.question_id,old.question_id);
  else target:=coalesce(new.worksheet_id,old.worksheet_id); end if;
  -- A deleted profile's cascades must be able to remove its entire history.
  perform 1 from public.grading_batches b join public.profiles p on p.id=b.teacher_id
    where b.answer_key_worksheet_id=target for share of b;
  if found then raise exception 'Attached answer snapshot is immutable' using errcode='PT409'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create function private.delete_batch_answer_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.worksheets w where w.id=old.answer_key_worksheet_id and w.teacher_id=old.teacher_id and w.source='uploaded';
  return old;
end;
$$;
create trigger grading_batches_delete_answer_context after delete on public.grading_batches for each row execute function private.delete_batch_answer_context();
revoke all on function private.delete_batch_answer_context() from public,anon,authenticated,service_role;

create or replace function private.validate_answer_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  batch_worksheet uuid;
  answer_context uuid;
  confirmed_at timestamptz;
  submission_variant uuid;
  question_worksheet uuid;
  question_variant uuid;
  question_max numeric;
begin
  select coalesce(b.answer_key_worksheet_id,b.worksheet_id), s.variant_id, b.answer_key_worksheet_id, b.answer_key_confirmed_at into batch_worksheet, submission_variant, answer_context, confirmed_at
    from public.submissions s join public.grading_batches b on b.id = s.batch_id
    where s.id = new.submission_id for share of s, b;
  if not found then
    raise exception 'Answer parent is unavailable' using errcode = '23514';
  end if;
  if answer_context is not null and confirmed_at is null then
    raise exception 'Answer key requires teacher confirmation' using errcode = 'PT409';
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
