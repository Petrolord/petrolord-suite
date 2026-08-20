-- Seismolord Wave 3 / W3.1: fault objects. The lofted fault surface
-- (arc-length resampled stick rails, the faultRibbonMesh algorithm in
-- lattice space) becomes a persisted, exportable object beside the
-- sticks it derives from. Derived in faultsService.saveFault — the
-- single write choke point — so every writer keeps it consistent;
-- single-stick faults store null. A few KB of jsonb per fault (the
-- sticks-as-jsonb rationale applies to the surface too).
--
-- Additive only; no RLS change (own-row policies cover the column).
-- Apply BEFORE deploying the W3.1 client: saveFault inserts the column.

alter table public.seismic_faults
    add column if not exists surface jsonb;

comment on column public.seismic_faults.surface is
    'Lofted fault surface (W3.1): {version, samples, rails: [[ [il, xl, s], ... ], ...]} in lattice space, derived from sticks at save time. Null for single-stick faults and rows predating the feature (clients loft on the fly).';
