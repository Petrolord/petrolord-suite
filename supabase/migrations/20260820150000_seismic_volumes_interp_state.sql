-- Seismolord Wave 0 / W0.2: mutable interpretation state moves out of the
-- storage manifest.json into seismic_volumes columns with an integer
-- revision for compare-and-set saves. The manifest becomes
-- immutable-after-ingest (geometry-only patches by CRS reprojection
-- excepted), which removes the last-write-wins read-modify-write hazard
-- on concurrent saves and is the precondition for org sharing (W4.1).
--
-- Additive only; existing rows keep interp_rev 0, which readers treat as
-- "not migrated yet: fall back to manifest fields, then write through
-- once". After any write the row is authoritative (interp_rev > 0).
-- RLS: existing user-scoped policies on seismic_volumes already cover
-- these columns; no policy changes.

alter table public.seismic_volumes
    add column if not exists velocity_model jsonb,
    add column if not exists velocity_calibration jsonb,
    add column if not exists traverses jsonb,
    add column if not exists interp_rev bigint not null default 0;

comment on column public.seismic_volumes.velocity_model is
    'Depth-conversion velocity model (manifest-form, engine velocityModel schema). Authoritative when interp_rev > 0; legacy copies may linger in manifest.json and are ignored.';
comment on column public.seismic_volumes.velocity_calibration is
    'Well-tie calibration provenance for velocity_model (wells_used etc.). Null when the model was hand-typed.';
comment on column public.seismic_volumes.traverses is
    'Named traverse polylines [{id, name, vertices}]. Null = none.';
comment on column public.seismic_volumes.interp_rev is
    'Interpretation-state revision for compare-and-set saves. 0 = row not yet migrated from manifest.json; every save bumps by 1 and must match the revision it read.';
