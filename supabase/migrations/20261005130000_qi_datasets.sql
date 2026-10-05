-- =============================================================================
-- QI Build Programme, phase Q0: large-file datasets in the worker's store
-- docs/scope/QI-PLAN.md, docs/scope/QI-STATUS.md
-- -----------------------------------------------------------------------------
-- Big seismic files (SEG-Y stacks now; gathers and partial stacks later) go
-- straight from the browser to the S3-compatible store on the worker host
-- (storage.petrolord.com) by presigned multipart upload. This table is the
-- registry of those objects. All writes come from the qi-upload-url edge
-- function (service role) after it has checked the caller's JWT, or from the
-- seismic worker; users only read their own rows.
--
--   status: uploading -> uploaded  (complete: every part present at its exact
--           size, object size confirmed by HEAD) | failed | deleted
--
-- Product-prefixed table (qi_*); no shared table is touched.
-- =============================================================================

create table if not exists public.qi_datasets (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    organization_id  uuid references public.organizations (id) on delete set null,
    name             text not null check (char_length(name) between 1 and 200),
    kind             text not null default 'segy_upload'
                       check (kind in ('segy_upload', 'stack', 'partial_stack', 'gathers_offset', 'gathers_angle')),
    status           text not null default 'uploading'
                       check (status in ('uploading', 'uploaded', 'failed', 'deleted')),
    original_filename text not null,
    bucket           text not null,
    object_key       text not null,
    bytes            bigint not null check (bytes > 0),
    part_size        bigint not null,
    part_count       int not null check (part_count between 1 and 10000),
    upload_id        text,
    meta             jsonb not null default '{}'::jsonb,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    uploaded_at      timestamptz,
    unique (bucket, object_key)
);

create index if not exists qi_datasets_user_idx
    on public.qi_datasets (user_id, created_at desc);

alter table public.qi_datasets enable row level security;

drop policy if exists "qi_datasets_select_own" on public.qi_datasets;
create policy "qi_datasets_select_own"
    on public.qi_datasets for select
    using (auth.uid() = user_id);

revoke all on public.qi_datasets from anon;
revoke insert, update, delete, truncate, references, trigger on public.qi_datasets from authenticated;
grant select on public.qi_datasets to authenticated;

create or replace function public.qi_datasets_touch()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists qi_datasets_touch on public.qi_datasets;
create trigger qi_datasets_touch before update on public.qi_datasets
  for each row execute function public.qi_datasets_touch();

-- Bytes a user holds in the worker's store (uploads in progress count: their
-- parts already occupy disk). Used by qi-upload-url before it starts an upload.
create or replace function public.qi_user_storage_bytes(p_user_id uuid)
returns bigint
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(bytes), 0)::bigint from public.qi_datasets
   where user_id = p_user_id and status in ('uploading', 'uploaded');
$$;
revoke all on function public.qi_user_storage_bytes(uuid) from public, anon, authenticated;
grant execute on function public.qi_user_storage_bytes(uuid) to service_role;

comment on table public.qi_datasets is
  'Large seismic files in the seismic worker''s S3 store (QI programme Q0). Written by the qi-upload-url edge function and the worker; users read their own.';
