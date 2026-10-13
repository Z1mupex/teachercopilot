create or replace function private.valid_grade_scale(value jsonb, maximum integer) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare row jsonb; previous_percent numeric := -1; previous_grade numeric := -1; p numeric; g numeric;
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) not between 2 and 11 then return false; end if;
  for row in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(row->'percent') is distinct from 'number' or jsonb_typeof(row->'grade') is distinct from 'number' then return false; end if;
    p := (row->>'percent')::numeric; g := (row->>'grade')::numeric;
    if p not between 0 and 100 or g not between (case when maximum=5 then 1 else 0 end) and maximum or g <> trunc(g) or p <= previous_percent or g <= previous_grade then return false; end if;
    if previous_percent=-1 and p<>0 then return false; end if;
    previous_percent:=p; previous_grade:=g;
  end loop;
  return previous_grade=maximum;
end; $$;
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
    if b.grading_started_at is null then select document into prefs from public.teacher_settings where teacher_id=auth.uid(); end if;
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
