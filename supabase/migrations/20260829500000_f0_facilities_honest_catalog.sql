-- F0 — Facilities Engineering module honest catalog
-- (Facilities-ROADMAP.md §1/§5; owner sign-off 2026-08-29).
-- First in-repo record of the Facilities catalog: no facilities
-- migration existed at all before this (every other module has one).
-- Audit of all 40 Facilities rows (2026-08-29, full code sweep):
--
-- 1. ARCHIVE two Active tiles that misadvertise:
--    * compressor-pump-pack — 50 LOC of static HTML printing literal
--      results ("Power: 1250 hp"); no inputs, no engine. Real
--      compressor/pump studios ship at F9/F10.
--    * pipeline-sizer — gated and sellable, yet calls a
--      'pipeline-sizer-engine' edge function that does not exist and
--      silently falls back to a hardcoded mock (10 in / 145.2 psi for
--      every input), then saves those numbers. Folded into the F1
--      Pipeline & Line Sizing flagship; route redirects to Facility
--      Network Hydraulics meanwhile.
--
-- 2. ARCHIVE all 'Coming Soon' Facilities rows EXCEPT
--    produced-water-treatment (31 zero-code stubs) — the
--    G0/R0/D0/P0 precedent: future apps (F1-F12) seed their own tile
--    when they ship; archived rows are never revived.
--    produced-water-treatment stays Coming Soon: real routed code
--    exists and it rebuilds with real physics at F7 (owner decision).
--
-- Rows preserved (status flips only); idempotent. Post-state:
-- Facilities = exactly 7 Active tiles (separator-slug-catcher-designer,
-- heat-exchanger-sizer, gas-treating-dehydration, relief-blowdown-sizer,
-- facility-network-hydraulics, facility-layout-mapper,
-- corrosion-rate-predictor) + 1 Coming Soon (produced-water-treatment).

begin;

-- 1. Active shells
update master_apps
   set status = 'Archived',
       is_built = false,
       is_functional = false
 where lower(module) = 'facilities'
   and slug in ('compressor-pump-pack', 'pipeline-sizer')
   and status <> 'Archived';

-- 2. Zero-code Coming Soon stubs (everything Coming Soon except the
--    one tile with real routed code behind it)
update master_apps
   set status = 'Archived'
 where lower(module) = 'facilities'
   and status = 'Coming Soon'
   and slug <> 'produced-water-treatment';

commit;
