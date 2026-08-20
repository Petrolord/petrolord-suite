-- Seismolord Wave 4 / W4.3: interpretation versioning. Horizons (and,
-- schema-ready, faults) gain an explicit version chain: "New version"
-- snapshots the current state as the new HEAD row (fresh id -> fresh
-- storage blob, so blobs are append-only per version), links it to its
-- parent and soft-archives the old head. Archived versions render as
-- dashed comparison overlays and can be restored (as ANOTHER new
-- version — history never rewrites). `interpreter` carries attribution
-- (set at save time from the signed-in user).
--
-- Additive only; existing rows read as version 1 heads. RLS unchanged
-- (own-row policies + the W4.1 org SELECT cover the new columns).

alter table public.seismic_horizons
    add column if not exists version integer not null default 1,
    add column if not exists parent_version_id uuid references public.seismic_horizons (id) on delete set null,
    add column if not exists interpreter text,
    add column if not exists archived_at timestamptz;

comment on column public.seismic_horizons.version is
    'W4.3 version chain: 1 for original interpretations; a snapshot head is parent.version + 1.';
comment on column public.seismic_horizons.parent_version_id is
    'The version this row was snapshotted from (null = original). SET NULL keeps children usable if history is pruned.';
comment on column public.seismic_horizons.interpreter is
    'Attribution: who saved this version (display string, set client-side at save).';
comment on column public.seismic_horizons.archived_at is
    'Null = the chain HEAD (listed in the explorer). Set = a superseded version (History submenu; dashed comparison overlay).';

create index if not exists seismic_horizons_parent_version_idx
    on public.seismic_horizons (parent_version_id)
    where parent_version_id is not null;

alter table public.seismic_faults
    add column if not exists version integer not null default 1,
    add column if not exists parent_version_id uuid references public.seismic_faults (id) on delete set null,
    add column if not exists interpreter text,
    add column if not exists archived_at timestamptz;

comment on column public.seismic_faults.interpreter is
    'Attribution: who saved this fault (display string, set client-side at save). Version chain columns are schema-ready; the fault History UI is a recorded follow-on.';
