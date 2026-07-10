-- Remove legacy seismic app rows from master_apps.
--
-- Their apps were deleted in PR #21 (superseded by Seismolord), or were
-- never built ("Coming Soon" placeholders), but the catalog rows survived
-- and still render dead tiles on the Geoscience dashboard — the Active
-- ones navigate into the SPA catch-all and redirect home.
--
-- Verified before writing this migration: zero purchased_modules rows
-- reference any of these apps. The NOT EXISTS guard keeps the delete safe
-- to re-run and skips any row that somehow gains a purchase later, instead
-- of failing on the purchased_modules_app_uuid_fkey constraint.

do $$
declare
  n int;
begin
  delete from public.master_apps ma
   where ma.slug in (
           'well-to-seismic-tie',
           'seismic-velocity-picker',
           'seismic-inversion-toolkit',
           'synthetic-seismogram',
           'seismic-interpretation-pro',
           'velocity-model-builder'
         )
     and not exists (
           select 1 from public.purchased_modules pm where pm.app_uuid = ma.id
         );
  get diagnostics n = row_count;
  raise notice 'master_apps: removed % legacy seismic rows', n;
end $$;
