# Organization Data Export & Offboarding — STATUS

Offboarding pipeline (export → grace-period deletion → certificate).
Program rationale: clients are more comfortable staying (and paying) when
they know they can leave at any time with everything they own.

## Phase 3 SHIPPED (deletion certificate, branch feat/org-deletion-certificate, 2026-08-05)

| Piece | Where |
|---|---|
| Migration | `supabase/migrations/20260805170000_deletion_certificate.sql` — certificate_no / verification_code / certificate_path on org_closure_requests. APPLIED live 2026-08-05 |
| Renderer | `supabase/functions/org-offboard/certificate.ts` — pdf-lib (generate-quote pattern), A4, plain-sentence copy |
| Actions | org-offboard `issue_certificate` (super admin/service, idempotent: number + code stable across re-issues) and `verify_certificate` (PUBLIC: cert number + 128-bit code confirm the facts from the deletion record; optional 10-min PDF re-download link). Certificate auto-issued + emailed as attachment on purge completion (failure never fails the purge; re-issue covers it). `_shared/email.ts` gained attachments (Resend + Brevo) |
| SPA | `/legal/verify-deletion` (public verifier with facts + PDF download) and `/legal/data-retention` (Data Retention & Offboarding policy); Privacy Policy §6 links to the policy |
| DPA | `docs/legal/DPA-TEMPLATE.md` — INTERNAL DRAFT for owner/legal review, deliberately not published in the app |

The verification endpoint IS the signature: a successful check reads the
surviving deletion record live, so it confirms the facts independently of the
paper. No cryptographic signing needed for v1.

Phase-3 E2E (deployed fn, disposable org, 2026-08-05): purge → certificate
PLD-DC-2026-AD037641 issued, emailed true (attachment accepted by provider);
public verify (anon, case-insensitive number) valid with correct facts +
working PDF download (%PDF-1.7); wrong code 404; issue_certificate re-issue
returned the SAME number. PDF visually reviewed. Test residue 0 (audit row and
certificate object removed; purge itself had already deleted user/orgs).

## Phase 2 SHIPPED (grace-period deletion, branch feat/org-grace-deletion, 2026-08-05)

| Piece | Where |
|---|---|
| Migration | `supabase/migrations/20260805150000_org_grace_deletion.sql` — `org_closure_requests` (FK-free audit row that survives the purge), `admin_purge_org` RPC, `export_fk_edges` + delete_rule. APPLIED live 2026-08-05 |
| Edge function | `supabase/functions/org-offboard/` — `request` (typed-name confirm, 30-day grace, internal orgs refused) / `cancel` (any org admin) / `execute_due` (platform super admin or service key; retries `failed` requests idempotently). DEPLOYED 2026-08-05 |
| UI | Danger card on `/dashboard/data-export` (schedule + countdown + cancel) and `OrgClosureBanner` in DashboardLayout warning every member |

Design decisions (deliberate):
- **Access is KEPT during the grace window.** Members can still export and any
  admin can cancel; reversibility is the point. Billing/provider-side
  subscription cancellation (Paystack/Stripe) is NOT automated; handle at the
  provider when a closure is scheduled.
- **Execution is human-triggered** (`execute_due` by a platform super admin or
  service key; pg_cron is not installed). Deliberate for now: a human in the
  loop before an irreversible purge. Automate later via a scheduler if wanted.
- **Ownership semantics:** members who also belong to a real shared org (or an
  internal org) survive; their assets shared into the dying org are UNSHARED
  (org column set to null; only nullable org columns, NOT NULL org columns
  mean structurally org-owned and always die). Solo personal orgs (signup
  trigger artifacts) do not keep an account alive and are purged together
  with the main org.
- **No replica mode.** postgres cannot set `session_replication_role` from a
  service-role call on this project (found live in E2E; NOTE:
  `admin_purge_test_orgs` has the same latent problem if invoked via its edge
  function). `admin_purge_org` instead precomputes the doomed row-set (FK
  closure honoring delete rules) and deletes in constraint-tolerant retry
  passes with FK enforcement ON, then verifies zero survivors (raise = full
  rollback).

Phase-2 E2E (against deployed fns, disposable orgs/users, 2026-08-05): wrong
name 400, schedule + email, duplicate 409, outsider cancel 403, member banner
RLS visible / outsider blind, admin cancel, re-request, premature execute 0 +
RPC refusal, user execute_due 403; after fast-forward: purge green — 13 rows /
9 tables, shared well UNSHARED (org null, owner intact), leaving member's
auth+identities+blobs+volume gone, solo personal org rode along, survivor org
untouched, export archives removed, audit row survived with full report.
Cleanup verified 0 residue. E2E also caught 3 real bugs now fixed (replica
mode, retry guard, NOT NULL unshare) and 1 pre-existing platform bug reported
below.

Known issues found during E2E (NOT fixed here, for owner awareness):
- `handle_new_user` fails with a duplicate-key on `organization_apps` when a
  SECOND user signs up with `organization_id` metadata for the same org (the
  app-init insert is not idempotent). Invitation flow works because it creates
  members differently; fix belongs in a trigger-hardening pass.
- `admin_purge_test_orgs` still uses `session_replication_role` and would fail
  if run via the admin-cleanup-test-data edge function today; port it to the
  doomed-set approach when next needed.

## Phase 1 SHIPPED (export, PR #158, 2026-08-05)

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

- [x] Apply `20260805130000_org_export.sql` (shared project; staging = prod DB) + log in MIGRATIONS.md — DONE 2026-08-05 (rollback-wrapped dry run first; RPCs rewritten on pg_catalog after info-schema measured ~30s/call)
- [x] `supabase functions deploy org-export` — DONE 2026-08-05
- [x] E2E vs the DEPLOYED function on a disposable org (2026-08-05): request 16s, zip verified (README/manifest/data, invitation_token redacted, verification 145 org tables passed), download signed URL works, foreign-org request 403, missing JWT 401, sign_blobs refuses non-member paths and non-export buckets; anon RPC 42501, anon jobs read blind. E2E also CAUGHT a real bug (two-org member rows from the other org leaked into the user pass) which is fixed and re-verified. Test org/user fully purged afterward (0 orphans, auth user removed via admin API)
- [x] Full jest suite green after all changes (2191 passed)
- [ ] PR into main; prod SPA picks the page up at the next Hostinger upload (page is additive; safe to ship whenever)

## Remaining follow-ups (program otherwise COMPLETE)

- DPA APPROVED by legal 2026-08-05 and PUBLISHED at /legal/dpa (linked from
  /legal/data-retention; canonical source docs/legal/DPA-TEMPLATE.md). Four
  values filled at publication for legal to confirm: 7-day backup retention
  (measured live), 72h breach notice, 30-day sub-processor notice, Nigerian
  governing law (NDPA 2023 + NDPR) with GDPR SCCs by reference.
- Fold invite-employee onto `_shared/email.ts` at its next redeploy.
- Optional: automate execute_due via a scheduler; provider-side subscription
  cancellation on closure.
- Port admin_purge_test_orgs off session_replication_role (see phase-2 notes).
