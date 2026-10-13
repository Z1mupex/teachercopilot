-- Cross-row validation must serialize edits to both sides of the relationship.
-- Otherwise concurrent submission/question variant edits could each validate
-- against the old version of the other row and commit an inconsistent answer.
create or replace function private.validate_submission_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  batch_worksheet uuid;
  variant_worksheet uuid;
begin
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
  -- Lock every answered question, including currently shared (null-variant) ones.
  perform q.id from public.questions q
    where exists (select 1 from public.submission_answers a where a.question_id = q.id and a.submission_id = new.id)
    order by q.id for share;
  if exists (
    select 1 from public.submission_answers a join public.questions q on q.id = a.question_id
    where a.submission_id = new.id and q.variant_id is not null and q.variant_id is distinct from new.variant_id
  ) then
    raise exception 'Variant conflicts with existing answers' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.protect_scored_question()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Lock each answering submission before comparing its variant to the new one.
  perform s.id from public.submissions s
    where exists (select 1 from public.submission_answers a where a.submission_id = s.id and a.question_id = new.id)
    order by s.id for share;
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

-- CREATE OR REPLACE preserves privileges; keep the internal-only grants explicit.
revoke all on function private.validate_submission_context(), private.protect_scored_question()
  from public, anon, authenticated, service_role;
