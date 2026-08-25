-- Well Design Studio launch copy (WD6). The WD0 tile migration
-- (20260825200000, itself still deploy-gated) wrote a description that
-- promised "Anti-collision and 3D visualization are being rebuilt wave
-- by wave" — WD4/WD5 shipped both, so the launch description states
-- what the app actually does. Update-only (the WD0 migration handles
-- seed-if-missing); idempotent; apply together with 20260825200000 at
-- the WD6 production upload.

update public.master_apps
set description = 'Compass-class well design: validated minimum-curvature and profile-design engines, WMM2025 magnetics, actual surveys with plan-vs-actual, ISCWSA MWD Rev4 positional uncertainty, SPE-187073 anti-collision with ladder and traveling-cylinder views, 3D multi-well visualization, registry publishing into the geoscience apps, and wall-plot / survey-listing / anti-collision PDF reports.',
    updated_at  = now()
where slug = 'well-planning';
