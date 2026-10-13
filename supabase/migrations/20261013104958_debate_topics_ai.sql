create or replace function public.reserve_ai_run(p_model text,p_purpose text,p_input_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); run_id uuid; running integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 100 or p_purpose is null
    or p_purpose not in ('worksheet_generation','question_regeneration','answer_key_parsing','submission_grading','grading_summary','debate_topics')
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

