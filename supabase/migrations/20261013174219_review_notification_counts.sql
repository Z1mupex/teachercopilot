create function private.sync_review_notification() returns trigger
language plpgsql security invoker set search_path='' as $$
declare batch uuid; remaining integer;
begin
  if new.review_status=old.review_status then return new; end if;
  select batch_id into batch from public.submissions where id=new.submission_id;
  select count(*) into remaining from public.submission_answers a join public.submissions s on s.id=a.submission_id where s.batch_id=batch and a.review_status='needs_review';
  update public.teacher_notifications set item_count=remaining,read_at=case when remaining=0 then coalesce(read_at,clock_timestamp()) else read_at end where batch_id=batch and kind='review' and teacher_id=auth.uid();
  return new;
end; $$;
create trigger sync_review_notification after update of review_status on public.submission_answers for each row execute function private.sync_review_notification();
revoke all on function private.sync_review_notification() from public,anon,authenticated,service_role;
