-- Minimal Supabase stand-ins for the digitizer-images dry run (scratch
-- Postgres only): roles, auth.uid(), storage.buckets, storage.objects with
-- RLS on, storage.foldername, the grants Supabase gives anon and
-- authenticated on the storage tables, and the storage.objects policies
-- that matter here as read from the live database on 2026-10-02: the two
-- that are tied to no bucket, and the sim bucket's four as a neighbour that
-- must keep working.
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

create schema if not exists storage;
grant usage on schema storage to anon, authenticated;
create table storage.buckets (
  id text primary key, name text not null, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
  public boolean default false, avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[], owner_id text);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid,
  created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz default now(),
  metadata jsonb, version text, owner_id text, user_metadata jsonb,
  unique (bucket_id, name));
create or replace function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant execute on function storage.foldername(text) to anon, authenticated;
-- the live guard against direct SQL deletes (read from the live database 2026-10-02)
create or replace function storage.protect_delete() returns trigger language plpgsql as $$
BEGIN
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;
create trigger protect_objects_delete before delete on storage.objects for each statement execute function storage.protect_delete();
alter table storage.objects enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated;

insert into storage.buckets (id, name, public) values ('sim', 'sim', false);
-- the two live policies tied to no bucket
create policy "Allow user to delete own files" on storage.objects for delete using (auth.uid() = (owner_id)::uuid);
create policy "Allow user to update own files" on storage.objects for update using (auth.uid() = (owner_id)::uuid);
-- a neighbouring private bucket with the owner-prefix model
create policy "sim_objects_select_own" on storage.objects for select to authenticated using (bucket_id = 'sim' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sim_objects_insert_own" on storage.objects for insert to authenticated with check (bucket_id = 'sim' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sim_objects_update_own" on storage.objects for update to authenticated using (bucket_id = 'sim' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'sim' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sim_objects_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'sim' and (storage.foldername(name))[1] = auth.uid()::text);
