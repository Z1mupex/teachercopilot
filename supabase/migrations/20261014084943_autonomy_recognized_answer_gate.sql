-- Fail closed when an auto-accepted payload omits actual recognition or AI flags.
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
