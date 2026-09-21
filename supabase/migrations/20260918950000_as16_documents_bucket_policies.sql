-- AS16: the `documents` storage bucket and its policies.
--
-- AS4 left the bucket to the dashboard and wrote NO storage.objects
-- policies for it. A private bucket with no policies refuses every
-- upload from a signed-in user, and the app's existence probe
-- (storage.list) still answers without error on a private bucket, so
-- Document Control would have offered an upload box that always failed.
-- Found 2026-09-18, the day the owner was asked to create the bucket.
--
-- Same shape as the wellsite bucket (20260907090000): the bucket is
-- created here idempotently, private, and the policies scope on the first
-- path segment. Paths are `<org_id>/<document_id>/<revision_id>-<file>`
-- (storagePathFor in document-control/utils/documentPayload.js), so the
-- check is the one `documents_org_rw` makes on the table (AS14):
-- my_org_id() or is_super_admin().
--
-- SELECT (signed URLs, the existence probe), INSERT (upload, never
-- upsert) and DELETE (the draft delete in AS14 clears its files). No
-- UPDATE: the app never overwrites a stored revision, and a revision
-- file that could be replaced in place would defeat document control.
--
-- Idempotent: re-running is a no-op.

begin;

insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

-- If the bucket was created in the dashboard as public, make it private:
-- a public bucket serves every object by URL and ignores these policies.
update storage.buckets set public = false where id = 'documents' and public;

create or replace function public.doc_org_of_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select (storage.foldername(p_name))[1] = public.my_org_id()::text
      or public.is_super_admin();
$$;
revoke all on function public.doc_org_of_path(text) from public, anon;
grant execute on function public.doc_org_of_path(text) to authenticated;

drop policy if exists "documents_objects_select_org" on storage.objects;
create policy "documents_objects_select_org" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.doc_org_of_path(objects.name));

drop policy if exists "documents_objects_insert_org" on storage.objects;
create policy "documents_objects_insert_org" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.doc_org_of_path(objects.name));

drop policy if exists "documents_objects_delete_org" on storage.objects;
create policy "documents_objects_delete_org" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.doc_org_of_path(objects.name));

commit;
