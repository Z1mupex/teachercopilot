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
  if (select count(*) from public.submission_pages where submission_id=s.id) <> 1 or not exists(
    select 1 from public.submission_pages p join storage.objects o on o.name=p.storage_path and o.bucket_id='submission-files'
    where p.submission_id=s.id and p.upload_status='stored') then raise exception 'Page not stored' using errcode='PT409'; end if;
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
create function public.claim_grading_submission_v2(p_batch uuid,p_submission uuid,p_variant uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare b public.grading_batches;
begin
  select * into b from public.grading_batches where id=p_batch and teacher_id=auth.uid() for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if b.grading_started_at is null and b.autonomy_config is null then raise exception 'Choose autonomy before starting' using errcode='PT409'; end if;
  return public.claim_grading_submission(p_batch,p_submission,p_variant);
end; $$;
revoke all on function public.claim_grading_submission_v2(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.claim_grading_submission_v2(uuid,uuid,uuid) to authenticated;

