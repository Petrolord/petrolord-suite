-- Suite pricing, 2026-09 (owner-approved pricing review, 2026-09-27).
--
-- 1. Every live app gets its own licence price (master_apps.price, USD per
--    month for the organisation), benchmarked against the products it
--    competes with. Until now every app in a module carried one flat price.
-- 2. Module prices reset to about 35% of their apps bought one by one
--    (50 to 60% for the small Data & AI and Process Safety modules).
-- 3. New pricing rules read by generate-quote (supabase/functions/_shared/
--    suite-pricing.ts) and mirrored by the quote screens
--    (src/data/quotePricing.js):
--      essentials_seat_tiers / essentials_seat_apps  lighter seat bands for
--                                                    24 light apps
--      bundle_included_with   an app quoted with its host costs nothing
--      all_access_price       every module together, per month
--    The platform fee waiver (module licence or annual term) is code, not
--    config.
-- 4. Founding customer promo code FOUNDING30: 30% off, first ten
--    organisations.
--
-- Data only; no schema change. Idempotent. Guarded: the app update must
-- price exactly the 102 live apps, or the guard raises and nothing is
-- written (applied with supabase db query -f the file runs as one implicit
-- transaction; it deliberately has no begin/commit of its own, so it can be
-- dry-run inside begin ... rollback).

with v(slug, module_slug, price) as (
  values
    ('audit-findings-manager', 'assurance', 299),
    ('document-control', 'assurance', 199),
    ('iso-compliance-tool', 'assurance', 199),
    ('lesson-learned-db', 'assurance', 199),
    ('management-of-change', 'assurance', 249),
    ('peer-review-manager', 'assurance', 199),
    ('quality-assurance-plan', 'assurance', 199),
    ('regulatory-compliance', 'assurance', 249),
    ('risk-heatmap', 'assurance', 199),
    ('risk-register', 'assurance', 249),
    ('ai-evaluation-studio', 'data-ai', 249),
    ('data-quality-studio', 'data-ai', 249),
    ('electrofacies-studio', 'data-ai', 799),
    ('forecasting-ml-workbench', 'data-ai', 699),
    ('ml-workbench', 'data-ai', 499),
    ('casing-tubing-design-pro', 'drilling', 1490),
    ('cementing-studio', 'drilling', 899),
    ('completion-design-studio', 'drilling', 990),
    ('drilling-fluids-hydraulics', 'drilling', 990),
    ('geomechanics-studio', 'drilling', 1490),
    ('perforation-sand-control', 'drilling', 699),
    ('stimulation-designer', 'drilling', 1190),
    ('torque-drag-studio', 'drilling', 899),
    ('well-control-studio', 'drilling', 699),
    ('well-cost-time', 'drilling', 599),
    ('well-integrity-pa', 'drilling', 990),
    ('well-planning', 'drilling', 1490),
    ('afe-cost-control-manager', 'economics', 499),
    ('capital-portfolio-studio', 'economics', 399),
    ('decision-studio', 'economics', 249),
    ('decision-tree-builder', 'economics', 199),
    ('epe-suite', 'economics', 1190),
    ('fdp-accelerator', 'economics', 1190),
    ('fiscal-regime-designer', 'economics', 499),
    ('npv-scenario-builder', 'economics', 249),
    ('probabilistic-breakeven-analyzer', 'economics', 299),
    ('project-management-pro', 'economics', 349),
    ('technical-report-autopilot', 'economics', 199),
    ('value-of-information-analyzer', 'economics', 249),
    ('compressor-station-designer', 'facilities', 499),
    ('control-valve-sizing', 'facilities', 249),
    ('corrosion-rate-predictor', 'facilities', 599),
    ('facility-layout-mapper', 'facilities', 199),
    ('facility-network-hydraulics', 'facilities', 249),
    ('flow-metering-designer', 'facilities', 249),
    ('gas-treating-dehydration', 'facilities', 799),
    ('heat-exchanger-sizer', 'facilities', 299),
    ('produced-water-treatment', 'facilities', 349),
    ('pump-station-designer', 'facilities', 249),
    ('relief-blowdown-sizer', 'facilities', 799),
    ('separator-slug-catcher-designer', 'facilities', 399),
    ('storage-tank-designer', 'facilities', 349),
    ('basinflow-genesis', 'geoscience', 799),
    ('earth-modeling', 'geoscience', 1290),
    ('mapping-surface-studio', 'geoscience', 399),
    ('petrophysics-studio', 'geoscience', 1290),
    ('pore-pressure-studio', 'geoscience', 1190),
    ('reservoircalc-pro', 'geoscience', 990),
    ('rock-physics-studio', 'geoscience', 1190),
    ('seismolord', 'geoscience', 1490),
    ('stratigraphy-studio', 'geoscience', 1190),
    ('well-correlation', 'geoscience', 399),
    ('well-data-manager', 'geoscience', 349),
    ('wellsite-studio', 'geoscience', 799),
    ('carbon-footprint-abatement', 'midstream-downstream', 249),
    ('crude-assay-blending-studio', 'midstream-downstream', 699),
    ('energy-utilities-efficiency', 'midstream-downstream', 249),
    ('flare-gas-to-value', 'midstream-downstream', 449),
    ('fuel-pricing-supply-chain', 'midstream-downstream', 299),
    ('lpg-cng-rollout-studio', 'midstream-downstream', 249),
    ('modular-refinery-feasibility', 'midstream-downstream', 499),
    ('product-blending-optimizer', 'midstream-downstream', 449),
    ('refinery-planning-scheduling', 'midstream-downstream', 699),
    ('terminal-depot-studio', 'midstream-downstream', 349),
    ('consequence-studio', 'process-safety', 1190),
    ('lopa-sil-studio', 'process-safety', 599),
    ('qra-studio', 'process-safety', 1690),
    ('artificial-lift-designer', 'production', 349),
    ('choke-performance-studio', 'production', 299),
    ('esp-design-studio', 'production', 799),
    ('flow-assurance-studio', 'production', 1190),
    ('gas-lift-design-studio', 'production', 990),
    ('gas-well-performance-studio', 'production', 990),
    ('nodal-analysis-engine', 'production', 1190),
    ('production-allocation-studio', 'production', 799),
    ('production-network-studio', 'production', 799),
    ('production-surveillance-studio', 'production', 990),
    ('rod-pump-design-studio', 'production', 549),
    ('well-intervention-planner', 'production', 449),
    ('decline-curve-analysis', 'reservoir', 599),
    ('eor-screening', 'reservoir', 199),
    ('fluid-systems-studio', 'reservoir', 1490),
    ('forecast-scenario-hub', 'reservoir', 699),
    ('fractional-flow-calculator', 'reservoir', 1190),
    ('recovery-factor-estimator', 'reservoir', 199),
    ('reservoir-balance', 'reservoir', 1490),
    ('reservoir-simulation-studio', 'reservoir', 1490),
    ('risked-reserves-valuation', 'reservoir', 349),
    ('scal-studio', 'reservoir', 699),
    ('voidage-replacement-monitor', 'reservoir', 699),
    ('well-spacing-optimizer', 'reservoir', 799),
    ('well-test-analyzer', 'reservoir', 1190)
)
update public.master_apps a
   set price = v.price
  from v
  join public.modules m on m.slug = v.module_slug
 where a.slug = v.slug
   and a.module_id = m.id;

do $$
declare
  live int;
  unpriced int;
begin
  select count(*) into live
    from public.master_apps
   where status = 'Active' and is_built and is_functional;
  select count(*) into unpriced
    from public.master_apps a
   where a.status = 'Active' and a.is_built and a.is_functional
     and a.slug not in (

       'afe-cost-control-manager',
       'ai-evaluation-studio',
       'artificial-lift-designer',
       'audit-findings-manager',
       'basinflow-genesis',
       'capital-portfolio-studio',
       'carbon-footprint-abatement',
       'casing-tubing-design-pro',
       'cementing-studio',
       'choke-performance-studio',
       'completion-design-studio',
       'compressor-station-designer',
       'consequence-studio',
       'control-valve-sizing',
       'corrosion-rate-predictor',
       'crude-assay-blending-studio',
       'data-quality-studio',
       'decision-studio',
       'decision-tree-builder',
       'decline-curve-analysis',
       'document-control',
       'drilling-fluids-hydraulics',
       'earth-modeling',
       'electrofacies-studio',
       'energy-utilities-efficiency',
       'eor-screening',
       'epe-suite',
       'esp-design-studio',
       'facility-layout-mapper',
       'facility-network-hydraulics',
       'fdp-accelerator',
       'fiscal-regime-designer',
       'flare-gas-to-value',
       'flow-assurance-studio',
       'flow-metering-designer',
       'fluid-systems-studio',
       'forecast-scenario-hub',
       'forecasting-ml-workbench',
       'fractional-flow-calculator',
       'fuel-pricing-supply-chain',
       'gas-lift-design-studio',
       'gas-treating-dehydration',
       'gas-well-performance-studio',
       'geomechanics-studio',
       'heat-exchanger-sizer',
       'iso-compliance-tool',
       'lesson-learned-db',
       'lopa-sil-studio',
       'lpg-cng-rollout-studio',
       'management-of-change',
       'mapping-surface-studio',
       'ml-workbench',
       'modular-refinery-feasibility',
       'nodal-analysis-engine',
       'npv-scenario-builder',
       'peer-review-manager',
       'perforation-sand-control',
       'petrophysics-studio',
       'pore-pressure-studio',
       'probabilistic-breakeven-analyzer',
       'produced-water-treatment',
       'product-blending-optimizer',
       'production-allocation-studio',
       'production-network-studio',
       'production-surveillance-studio',
       'project-management-pro',
       'pump-station-designer',
       'qra-studio',
       'quality-assurance-plan',
       'recovery-factor-estimator',
       'refinery-planning-scheduling',
       'regulatory-compliance',
       'relief-blowdown-sizer',
       'reservoir-balance',
       'reservoir-simulation-studio',
       'reservoircalc-pro',
       'risk-heatmap',
       'risk-register',
       'risked-reserves-valuation',
       'rock-physics-studio',
       'rod-pump-design-studio',
       'scal-studio',
       'seismolord',
       'separator-slug-catcher-designer',
       'stimulation-designer',
       'storage-tank-designer',
       'stratigraphy-studio',
       'technical-report-autopilot',
       'terminal-depot-studio',
       'torque-drag-studio',
       'value-of-information-analyzer',
       'voidage-replacement-monitor',
       'well-control-studio',
       'well-correlation',
       'well-cost-time',
       'well-data-manager',
       'well-integrity-pa',
       'well-intervention-planner',
       'well-planning',
       'well-spacing-optimizer',
       'well-test-analyzer',
       'wellsite-studio'
     );
  if live <> 102 or unpriced <> 0 then
    raise exception 'Expected 102 live apps all covered by this price list; found % live, % not covered', live, unpriced;
  end if;
end
$$;

insert into public.pricing_config (key, value)
values ('module_pricing', '{"geoscience":3990,"drilling":4490,"reservoir":3990,"facilities":1990,"production":3490,"economics":1990,"midstream-downstream":1490,"assurance":899,"process-safety":1990,"data-ai":1290}'::jsonb)
on conflict (key) do update set value = excluded.value;

insert into public.pricing_config (key, value) values
  ('essentials_seat_tiers', '[{"upTo":5,"price":19},{"upTo":15,"price":15},{"upTo":40,"price":12},{"upTo":null,"price":9}]'::jsonb),
  ('essentials_seat_apps', '["ai-evaluation-studio", "audit-findings-manager", "control-valve-sizing", "data-quality-studio", "decision-studio", "decision-tree-builder", "document-control", "energy-utilities-efficiency", "eor-screening", "facility-layout-mapper", "flow-metering-designer", "iso-compliance-tool", "lesson-learned-db", "management-of-change", "npv-scenario-builder", "peer-review-manager", "project-management-pro", "quality-assurance-plan", "recovery-factor-estimator", "regulatory-compliance", "risk-heatmap", "risk-register", "technical-report-autopilot", "value-of-information-analyzer"]'::jsonb),
  ('bundle_included_with', '{"risk-heatmap":"risk-register","lesson-learned-db":"audit-findings-manager"}'::jsonb),
  ('all_access_price', '12990'::jsonb)
on conflict (key) do update set value = excluded.value;

insert into public.suite_promo_codes (code, percent, scope, max_redemptions, notes)
values ('FOUNDING30', 30, 'all', 10, 'Founding customer offer: 30% off for the first ten organisations. Best on an annual quote, where it covers the first year.')
on conflict (code) do nothing;
