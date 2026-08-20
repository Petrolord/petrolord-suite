-- Seismolord Wave 3 / W3.3: well tie 2.0. A committed tie warp becomes
-- a DERIVED checkshot set stored beside the imported one — imported
-- data is never overwritten (plan rule). Shape:
--   { rows: [{tvdss_m, twt_ms}, ...],           -- strictly monotonic
--     provenance: {source: 'well_tie_warp', volume_id, anchors,
--                  phi_deg, created_at} }
-- Consumers (Seismolord synthetic + well displays) prefer the derived
-- rows when present; clearing the tie sets the column null again.
--
-- Additive only; geo_wells RLS policies cover the column unchanged.
-- Apply BEFORE deploying the W3.3 client (the commit path writes it).

alter table public.geo_wells
    add column if not exists checkshots_derived jsonb;

comment on column public.geo_wells.checkshots_derived is
    'Well-tie-derived checkshot set (Seismolord W3.3): {rows: [{tvdss_m, twt_ms}], provenance}. Null = no committed tie; imported checkshots live in the checkshots column and are never overwritten.';
