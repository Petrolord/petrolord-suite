# Organization Data Export — STATUS

Offboarding pipeline, phase 1 of 3 (export → grace-period deletion →
certificate). Program rationale: clients are more comfortable staying (and
paying) when they know they can leave at any time with everything they own.

## Shipped (phase 1, branch feat/org-data-export, 2026-08-05)

| Piece | Where |
|---|---|
| Migration | `supabase/migrations/20260805130000_org_export.sql` — `org_export_jobs` (org-admin read-only RLS), private `org-exports` bucket (no storage policies; signed-URL delivery only), service-role-only RPCs `export_table_allowed` / `export_table_catalog` / `export_fk_edges` / `export_dump_rows` / `export_count_rows` |
| Edge function | `supabase/functions/org-export/` — actions `request` / `download` / `sign_blobs`; pure logic in `helpers.js` (jest, 13 tests in `__tests__/`) |
| Shared email | `supabase/functions/_shared/email.ts` (Resend → Brevo, factored from invite-employee; invite-employee still carries its inline copy until its next scheduled redeploy) |
| UI | `/dashboard/data-export` (`src/pages/DataExport.jsx`), MANAGE_ORGANIZATION-gated route, sidebar item under Organization Administration |
| Legal copy | PrivacyPolicy §6 now describes the real capability (export self-service, deletion via support); SECURITY_GUIDE.md GDPR claim corrected (`delete_organization` is NOT full erasure) |

## How the export works

1. **Org pass** — `export_table_catalog()` discovers every public BASE TABLE
   with an org-scoping column (same catalog-driven discovery as
   `admin_purge_test_orgs`; ~162 tables live, a hand list would rot). All rows
   for the org are dumped via paged `export_dump_rows` calls.
2. **User pass** — tables scoped by `user_id` only (seismic_*, private
   geo_wells, …) are dumped for every organization member. Owner decision
   2026-08-05: member-owned technical data is INCLUDED by default (corporate
   account ⇒ corporate data), attributed per user in the manifest.
3. **Descendant sweep** — single-column FK edges (`export_fk_edges`) are
   walked to a fixpoint so scope-less child tables (e.g. `geo_wells_logs`,
   which has neither organization_id nor user_id) are included. The sweep only
   descends into tables with NO org/user scoping of their own; scoped tables
   are already fully covered and following edges into them could leak another
   org's rows through members who belong to two orgs.
4. **Verification** — every org-scoped table is independently recounted
   (`export_count_rows`); any drift fails the job (no silently inconsistent
   archives). Redaction: columns matching `token|secret|password|api_key` are
   stripped in the RPC, so secrets never leave Postgres.
5. **Storage manifest** — blobs are NOT zipped (seismic quota is 20 GiB per
   user; edge functions cannot hold that). Pointer tables (`seismic_volumes`
   prefix walk, `seismic_horizons`, `seismic_exported_surfaces`,
   `geo_wells_logs`, `geo_surfaces`) are inventoried into `manifest.json`;
   the UI mints per-object signed URLs on demand (`sign_blobs`, tenancy check:
   the path's user folder must belong to a member of the org).
6. **Delivery** — zip (README + manifest.json + data/<table>.json) uploaded to
   `org-exports/{org}/{job}.zip`, 7-day expiry, opportunistic cleanup, email
   notification WITHOUT a link (links in inboxes outlive employment).

## Known limitations (accepted for phase 1)

- Zip is built in memory in a single invocation. Fine at current org sizes;
  a very large org will need a chunked/background rework (job row + statuses
  already shaped for it).
- Tables without a single-column uuid PK are appended without dedupe (a row
  can appear twice if reached by both the org and user pass).
- Storage enumeration capped at 25k objects; per-dump cap 500k rows (the
  export FAILS rather than truncating silently; caps are recorded in
  manifest.notes).
- Sweep depth capped at 8 FK levels (recorded in notes if hit).

## Deploy/verify checklist

- [ ] Apply `20260805130000_org_export.sql` (shared project; staging = prod DB) + log in MIGRATIONS.md
- [ ] `supabase functions deploy org-export`
- [ ] Staging E2E: request export on a test org, verify zip contents vs counts, blob link download, RLS probes (non-admin blocked from jobs table + all three actions)
- [ ] PR into main; prod SPA picks the page up at the next Hostinger upload (page is additive; safe to ship whenever)

## Next phases (not started)

- Phase 2: account closure with grace period (deactivate on request, hold N
  days, then a hardened generalized purge incl. storage GC + auth cleanup;
  mind the orphaned-identities gotcha from 2026-08-05).
- Phase 3: certificate of deletion (counts destroyed, timestamp, signed) +
  surviving audit row; published Data Retention & Offboarding policy page and
  a DPA template for enterprise deals.
- Fold invite-employee onto `_shared/email.ts` at its next redeploy.
