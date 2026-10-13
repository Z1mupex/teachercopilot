-- Private buckets are supported in migrations by Supabase Storage.
-- Object keys are <teacher UUID>/<resource UUID>/<filename>.
-- Prefix ownership also supports future server-created files without owner_id.
do $$
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity) then
    raise exception 'Supabase Storage objects must have RLS enabled';
  end if;
end;
$$;

insert into storage.buckets (id, name, public)
values ('worksheet-files', 'worksheet-files', false), ('submission-files', 'submission-files', false);

create policy teacher_files_read on storage.objects for select to authenticated
  using (bucket_id in ('worksheet-files', 'submission-files') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy teacher_files_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('worksheet-files', 'submission-files') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy teacher_files_update on storage.objects for update to authenticated
  using (bucket_id in ('worksheet-files', 'submission-files') and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('worksheet-files', 'submission-files') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy teacher_files_delete on storage.objects for delete to authenticated
  using (bucket_id in ('worksheet-files', 'submission-files') and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Restrictive guard prevents a broader policy for another bucket from overriding
-- tenant isolation through PostgreSQL's OR-combination of permissive policies.
create policy teacher_files_isolation on storage.objects as restrictive for all to authenticated
  using (bucket_id not in ('worksheet-files', 'submission-files') or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()))
  ))
  with check (bucket_id not in ('worksheet-files', 'submission-files') or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()))
  ));
create policy teacher_files_anonymous_denial on storage.objects as restrictive for all to anon
  using (bucket_id not in ('worksheet-files', 'submission-files'))
  with check (bucket_id not in ('worksheet-files', 'submission-files'));
