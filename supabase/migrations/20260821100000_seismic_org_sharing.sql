-- Seismolord Wave 4 / W4.1: org sharing v1 (read-only). A volume owner
-- can share a volume with their organization; members read the volume
-- row, its manifest and bricks, and every interpreter's horizons and
-- faults on it. All writes stay owner-scoped (auth.uid() = user_id) —
-- interpretation state (velocity/traverses, CAS) remains owner-only,
-- and a member's own horizons/faults on a shared volume live under the
-- MEMBER'S storage path (deliberate v1 semantic: interpretations are
-- org-visible, attribution stays with their author).
--
-- Storage: the geo_surfaces/geo_culture shape — owner disjunct FIRST so
-- today's hot path is untouched; the org reader pays one indexed exists
-- per brick GET, served by the (id::text) expression index. Recorded
-- escalation if staging timing regresses: a materialized readers grant
-- table.
--
-- Sessions and exported surfaces stay personal (sessions are workspace
-- state; exports live outside volume directories at {uid}/exports/).

-- ---- seismic_volumes: the share column ------------------------------
alter table public.seismic_volumes
    add column if not exists organization_id uuid references public.organizations (id) on delete set null;

comment on column public.seismic_volumes.organization_id is
    'W4.1 org sharing: null = private; set = read-only visible to that organization (bricks, manifest, horizons, faults included). Owner-only writes everywhere.';

create index if not exists seismic_volumes_organization_id_idx
    on public.seismic_volumes (organization_id) where organization_id is not null;

-- the storage policy joins on id::text (path segment 2)
create index if not exists seismic_volumes_id_text_idx
    on public.seismic_volumes ((id::text));

drop policy if exists "seismic_volumes_select_own" on public.seismic_volumes;
drop policy if exists "seismic_volumes_select_own_or_org" on public.seismic_volumes;
create policy "seismic_volumes_select_own_or_org"
    on public.seismic_volumes for select
    using (
      auth.uid() = user_id
      or (organization_id is not null and public.is_org_member(organization_id))
    );

-- owner-only updates, and you may only share to an organization you
-- belong to (the geo_wells check)
drop policy if exists "seismic_volumes_update_own" on public.seismic_volumes;
create policy "seismic_volumes_update_own"
    on public.seismic_volumes for update
    using (auth.uid() = user_id)
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

drop policy if exists "seismic_volumes_insert_own" on public.seismic_volumes;
create policy "seismic_volumes_insert_own"
    on public.seismic_volumes for insert
    with check (
      auth.uid() = user_id
      and (organization_id is null or public.is_org_member(organization_id))
    );

-- ---- children: org members read every interpreter's rows ------------
drop policy if exists "seismic_horizons_select_org" on public.seismic_horizons;
create policy "seismic_horizons_select_org"
    on public.seismic_horizons for select
    using (
      exists (
        select 1 from public.seismic_volumes v
        where v.id = seismic_horizons.volume_id
          and v.organization_id is not null
          and public.is_org_member(v.organization_id)
      )
    );

drop policy if exists "seismic_faults_select_org" on public.seismic_faults;
create policy "seismic_faults_select_org"
    on public.seismic_faults for select
    using (
      exists (
        select 1 from public.seismic_volumes v
        where v.id = seismic_faults.volume_id
          and v.organization_id is not null
          and public.is_org_member(v.organization_id)
      )
    );

-- ---- storage: org members read any object under a shared volume -----
-- Path convention: {user_id}/{volume_id}/... — the owner's bricks,
-- manifest and horizons AND members' own horizon blobs (written under
-- the member's uid with the same volume id at segment 2) all match.
drop policy if exists "seismic_objects_select_own" on storage.objects;
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
        )
    );
