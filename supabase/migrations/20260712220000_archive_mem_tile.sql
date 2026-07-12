-- Geoscience G0 follow-up (owner decision 2026-07-12, per
-- docs/scope/MEM-AUDIT.md): the 1D Mechanical Earth Model rebuilds under
-- the DRILLING module on the salvaged engine core; until that rebuild
-- ships, its tile is archived — the live route computes nothing (the
-- working engine is unrouted), so the Active tile misadvertised a shell.
--
-- ARCHIVE, not DELETE (house pattern): status='Archived' hides the tile
-- from the hub (useMasterApps shows status IN ('Active','Coming Soon')
-- AND is_functional AND is_built) while preserving the row and any
-- entitlement/history references. The rebuilt Drilling app gets its own
-- tile when it ships. Idempotent.

do $$
declare
  n int;
begin
  update public.master_apps
     set status = 'Archived', updated_at = now()
   where slug = '1d-mechanical-earth-model'
     and status <> 'Archived';
  get diagnostics n = row_count;
  raise notice 'master_apps: archived % MEM tile(s)', n;
end $$;
