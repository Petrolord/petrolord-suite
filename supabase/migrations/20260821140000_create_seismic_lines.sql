-- Seismolord Wave 5 / W5.1: 2D seismic lines. A line's data lives in
-- the seismic bucket at {user_id}/{line_id}/ (strips/{i}-{k}.f32 +
-- nav.bin + manifest.json, manifest_version 3 kind '2d_line'); the row
-- carries identity + navigation summary. Line picks are per-trace
-- float32 arrays ({user_id}/{line_id}/picks/{id}.f32) grouped by
-- horizon NAME so misties and joint mapping match picks across lines.
--
-- Sharing and projects ride the Wave 4 machinery from day one: the
-- same own-or-org SELECT shape, the same project container, and the
-- seismic bucket storage policy extended to resolve SHARED LINES from
-- path segment 2 exactly like shared volumes. bulk_shift_ms is the
-- mistie apply target (display-side static; stored samples untouched).

create table if not exists public.seismic_lines (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    organization_id  uuid references public.organizations (id) on delete set null,
    project_id       uuid references public.seismic_projects (id) on delete set null,
    name             text not null,
    storage_path     text not null,
    status           text not null default 'registered',
    crs              text,
    bulk_shift_ms    double precision not null default 0,
    survey_meta      jsonb,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

comment on table public.seismic_lines is
    'Seismolord 2D line registry (W5.1): strip store + nav.bin + v3 manifest at storage_path; bulk_shift_ms = applied mistie static (display-side).';

create index if not exists seismic_lines_user_id_idx
    on public.seismic_lines (user_id, created_at desc);
create index if not exists seismic_lines_organization_id_idx
    on public.seismic_lines (organization_id) where organization_id is not null;
create index if not exists seismic_lines_id_text_idx
    on public.seismic_lines ((id::text));

alter table public.seismic_lines enable row level security;

drop policy if exists "seismic_lines_select_own_or_org" on public.seismic_lines;
create policy "seismic_lines_select_own_or_org"
    on public.seismic_lines for select
    using (
      auth.uid() = user_id
      or (organization_id is not null and public.is_org_member(organization_id))
    );

drop policy if exists "seismic_lines_insert_own" on public.seismic_lines;
create policy "seismic_lines_insert_own"
    on public.seismic_lines for insert
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "seismic_lines_update_own" on public.seismic_lines;
create policy "seismic_lines_update_own"
    on public.seismic_lines for update
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "seismic_lines_delete_own" on public.seismic_lines;
create policy "seismic_lines_delete_own"
    on public.seismic_lines for delete
    using (auth.uid() = user_id);

-- ---- line picks (per-trace horizon interpretations) -----------------
create table if not exists public.seismic_line_picks (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    line_id       uuid not null references public.seismic_lines (id) on delete cascade,
    name          text not null,
    storage_path  text not null,
    interpreter   text,
    stats         jsonb,
    params        jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.seismic_line_picks is
    'Per-line horizon picks (W5.3): float32 per-trace sample arrays in the seismic bucket; grouped across lines by NAME for misties and joint mapping.';

create index if not exists seismic_line_picks_line_id_idx
    on public.seismic_line_picks (line_id);
create index if not exists seismic_line_picks_user_id_idx
    on public.seismic_line_picks (user_id, created_at desc);

alter table public.seismic_line_picks enable row level security;

drop policy if exists "seismic_line_picks_select_own_or_org" on public.seismic_line_picks;
create policy "seismic_line_picks_select_own_or_org"
    on public.seismic_line_picks for select
    using (
      auth.uid() = user_id
      or exists (
        select 1 from public.seismic_lines l
        where l.id = seismic_line_picks.line_id
          and l.organization_id is not null
          and public.is_org_member(l.organization_id)
      )
    );

drop policy if exists "seismic_line_picks_insert_own" on public.seismic_line_picks;
create policy "seismic_line_picks_insert_own"
    on public.seismic_line_picks for insert
    with check (auth.uid() = user_id);

drop policy if exists "seismic_line_picks_update_own" on public.seismic_line_picks;
create policy "seismic_line_picks_update_own"
    on public.seismic_line_picks for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "seismic_line_picks_delete_own" on public.seismic_line_picks;
create policy "seismic_line_picks_delete_own"
    on public.seismic_line_picks for delete
    using (auth.uid() = user_id);

-- ---- storage: shared LINES readable like shared volumes -------------
drop policy if exists "seismic_objects_select_own_or_org" on storage.objects;
create policy "seismic_objects_select_own_or_org"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'seismic'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or exists (
            select 1 from public.seismic_volumes v
            where v.id::text = (storage.foldername(objects.name))[2]
              and v.organization_id is not null
              and public.is_org_member(v.organization_id)
          )
          or exists (
            select 1 from public.seismic_lines l
            where l.id::text = (storage.foldername(objects.name))[2]
              and l.organization_id is not null
              and public.is_org_member(l.organization_id)
          )
        )
    );
