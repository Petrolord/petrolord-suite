-- Add the unique arbiter indexes that manual_verify_quote() upserts depend on.
--
-- The RPC provisions entitlements with two ON CONFLICT targets on purchased_modules:
--   * app-level row:    ON CONFLICT (organization_id, app_id)
--   * module-level row: ON CONFLICT (organization_id, module_id) WHERE app_id IS NULL
-- Neither matching unique index existed (only the id PK), so every upsert raised
-- "no unique or exclusion constraint matching the ON CONFLICT specification". The RPC
-- swallows it in its EXCEPTION WHEN OTHERS block and returns {status:error}, so paid
-- quotes verified fine but provisioned nothing. These indexes make the upserts resolve.
--
-- Verified before writing: zero duplicate rows on either key, so creation is safe.

-- App-level dedup. Non-partial so it can be inferred by the bare
-- ON CONFLICT (organization_id, app_id) in the RPC. Module-level rows have a NULL
-- app_id and are intentionally excluded (NULLs compare distinct); they are deduped by
-- the partial index below instead.
create unique index if not exists purchased_modules_org_app_uidx
  on public.purchased_modules (organization_id, app_id);

-- Module-level dedup (the org's parent-module row, where app_id IS NULL). Predicate
-- matches the RPC's ON CONFLICT ... WHERE app_id IS NULL so Postgres can infer it.
create unique index if not exists purchased_modules_org_module_noapp_uidx
  on public.purchased_modules (organization_id, module_id)
  where app_id is null;
