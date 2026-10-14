# Security runbook 2026-10 (owner-run)

Approved by the owner and the second engineer on 2026-10-14 ("proceed as soon as you can with the fixes that are best for this platform"). This one page lists every production step in order, with the check after each step and how to undo it. Claude prepared everything. The owner runs every command (each line starting with `!`).

## The order

| Step | What | Needs | Breaks anything if skipped or reordered? |
|---|---|---|---|
| 0 | Stop-gap migration 00 | none | **Done 2026-10-14**, verified |
| 1 | Migration 01 (additive) | none | No. No live flow changes on apply |
| 2 | Edge Function deploys (Suite and HSE) | 1 | Functions fail closed. Deploy them before 02 and 03 |
| 3 | HSE site upload | 1 | The HSE invitation page calls 01's functions |
| 4 | Migration 02 (invitation lockdown) | 1, 2, 3 | Run before 3 and HSE invitee signups fail |
| 5 | Migration 03 (users guard) | 1, 2 | Run before 2 and old admin functions stop seeing platform admins in user flags |
| 6 | Migration 04 (RLS-off tables) | none | No |
| 7 | Migration 05 (policies, storage) | 1 | No |
| 8 | Function deletes | 2 | No |
| 9 | Suite zip | 2 | Held until the end of the current video round. No DB step needs it |
| 10 | NextGen | none | Separate project, see the last section |

All `supabase db query` and `supabase functions` commands run from the Suite primary checkout, which is linked to the project. Migration files are read from a FRESH checkout of the PR branch, so the stale primary tree is never used for code:

```
! git -C /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite fetch origin && git -C /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite worktree add /root/sec26-apply origin/fix/security-2026-10-db
```

Below, `$SUITE` means `/opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite` and `$APPLY` means `/root/sec26-apply`. Each command is written out in full, ready to paste.

Every migration file is idempotent and has no begin or commit line. `supabase db query -f` runs the whole file as one transaction, so a failure changes nothing. Each one was dry-run on production inside a transaction that always rolls back (see "Proof" at the end).

---

## Step 0 (done): stop-gap

`20261014110000_security_00_stopgap_revoke_secdef.sql`, applied and verified 2026-10-14.

## Step 1: migration 01 (platform admins, invitation functions)

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/supabase/migrations/20261014121000_security_01_platform_admins_and_invitation_rpcs.sql
```

Verify:

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/tools/security/2026-10/verify/01_platform_admins.sql
```

Expect `admins = 3` with ayoasaolu@gmail.com, ayodejiasaolu1@gmail.com and info@petrolord.com, plus `is_super_admin_reads_table = true`, `rpcs = 5`, `anon_accept = false` and `anon_lookup = true`.

The platform admin list was confirmed by the owner on 2026-10-14. support@petrolord.com is deliberately not included. To add or remove someone later, run SQL as the service role (`insert into public.platform_admins (user_id, email, granted_by) select id, email, 'owner' from auth.users where email = '...'`).

Rollback:

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/tools/security/2026-10/rollback/01.rollback.sql
```

This restores the previous is_super_admin() and handle_new_user() bodies. The new table and functions stay, unused.

## Step 2: Edge Function deploys

Code is in Suite PR #1109 and HSE PR #39. Both merge on green, and they are safe to deploy before or after any migration.

How every fixed function decides who is calling:
- The caller comes from the verified JWT, never from the body or user metadata.
- Platform admin is `is_super_admin()` run with the caller's own token.
- Org admin is checked against `organization_members`.
- Mail functions take the service role only.
- Every check fails closed (401 or 403).

The per-function table and the reasons for each change are in `docs/security/functions-2026-10.md` (PR #1109).

Deploy from fresh clones of main after both PRs merge:

```
! rm -rf /root/sec26-deploy && git clone -q --depth 1 git@github.com:Petrolord/petrolord-suite.git /root/sec26-deploy && cd /root/sec26-deploy && supabase link --project-ref ssyckywijlrkgcwvkwlr
! cd /root/sec26-deploy && supabase functions deploy activate-bank-transfer reject-bank-transfer verify-bank-transfer process-subscription-renewals
! cd /root/sec26-deploy && supabase functions deploy send-email send-email-via-smtp send-renewal-notification send-quote send-demo-request send-invite
! cd /root/sec26-deploy && supabase functions deploy admin-create-user admin-delete-organization admin-grant-user-app-access admin-suspend-org admin-update-org-entitlements insert-geoscience-apps admin-cleanup-test-data
! cd /root/sec26-deploy && supabase functions deploy invite-user invite-employee accept-employee-invitation get-app-seat-usage remove-member-from-app
! cd /root/sec26-deploy && supabase functions deploy generate-quote org-export org-offboard
! rm -rf /root/sec26-hse && git clone -q --depth 1 git@github.com:Petrolord/petrolord-hse.git /root/sec26-hse && cd /root/sec26-hse && supabase link --project-ref ssyckywijlrkgcwvkwlr && supabase functions deploy hse-invite-user chat-with-petrolord log-audit-event
```

EPE engines are NOT part of this batch. `epe-cash-flow-engine` and `epe-cash-flow-engine-batch` carry the security check (callers must be able to see the run under row level security), and the EPE chain (#1083, #1105, #1095) changes the same functions. They are deployed ONCE, together with `epe-monte-carlo`, after both #1109 and the EPE chain are on main:

```
! cd /root/sec26-deploy && git pull -q && supabase functions deploy epe-cash-flow-engine epe-cash-flow-engine-batch epe-monte-carlo
```

Until then the deployed EPE versions keep running unchanged. None of the migrations 02-05 touches an epe_* table, function or policy; the engines use the service role. The rolled-back dry run showed no count change on any epe_* table for any persona.

Verify: call each with only the public anon key. Expect 401 or 403 on every line. The loop is in `docs/security/functions-2026-10.md`, "Verify after steps 1 and 2". Then click through these:
- the Book a Demo form submits;
- a quote generates from /dashboard/upgrade;
- a platform admin approves a bank transfer in the Super Admin console;
- an Employees page invite works end to end.

What changes for people:
- Uploading a bank-transfer proof needs an admin of the quote's org.
- support@petrolord.com no longer reaches admin functions, by decision.

Rollback, any one function: redeploy its previous source. For repo functions, use `git checkout <previous sha> -- supabase/functions/<slug>` in a scratch clone, then `supabase functions deploy <slug>`. For the deployed-only ones, use the downloaded copy in the session scratchpad. Never redeploy an unauthenticated mail or payment function.

## Step 3: HSE site upload

HSE PR #38 (invitation page) and HSE PR #39 (functions) must be merged first. #38 merges once step 1 is applied. Cut the zip from HSE main with the usual script (full sha):

```
! bash /root/cut_hse_zip.sh <full HSE main sha>
```

Upload it to the HSE site. Then check the other two sites (Suite and NextGen) are unchanged.

Verify: open an HSE invitation link (or `/accept-invite/00000000-0000-0000-0000-000000000000`). The page must say the invitation is invalid; it must not error. In the browser network tab it calls `rpc/get_invitation_by_token`.

Rollback: re-upload the previous HSE zip. Existing-account acceptance then fails again, as it has since the stop-gap.

## Step 4: migration 02 (invitation lockdown)

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/supabase/migrations/20261014121100_security_02_invitation_lockdown.sql
```

Verify:

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/tools/security/2026-10/verify/02_invitation_lockdown.sql
```

Expect `add_user_clients = false`, `open_invite_policies = 0`, `anon_invitations = false`, `trigger_needs_token = true` and `invite_policies = 4`.

Then do one real check. On the Suite Employees page, invite a test address you own, open the email link and create the account. The new account must land in your org with the invited role.

Rollback:

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/tools/security/2026-10/rollback/02.rollback.sql
```

This re-opens the "join any org" hole. Use it only if invitations are broken and cannot wait.

## Step 5: migration 03 (public.users guard, seats, invited rows)

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/supabase/migrations/20261014121200_security_03_users_guard_and_seats.sql
```

Verify:

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/tools/security/2026-10/verify/03_users_guard.sql
```

Expect `guard_trigger = 1`, `auth_update_is_super_admin = false`, `auth_update_app_preferences = true`, `mirror_ok = true` and `seats_use_helper = 2`.

Rollback:

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/tools/security/2026-10/rollback/03.rollback.sql
```

## Step 6: migration 04 (the 86 RLS-off tables)

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/supabase/migrations/20261014121300_security_04_rls_off_tables.sql
```

Verify:

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/tools/security/2026-10/verify/04_rls_off_tables.sql
```

Expect `rls_off = 1` (spatial_ref_sys, the PostGIS catalogue), `anon_on_rls_off = 1` and `anon_any_86 = 0`.

Rollback: prefer restoring the one table that broke by copying its block from `tools/security/2026-10/rollback/04.rollback.sql`. The whole file is the emergency option:

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/tools/security/2026-10/rollback/04.rollback.sql
```

## Step 7: migration 05 (policies, functions, storage)

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/supabase/migrations/20261014121400_security_05_policy_fixes.sql
```

Verify:

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/tools/security/2026-10/verify/05_policy_fixes.sql
```

Expect `user_role_policies = 0`, `true_write_policies = 0`, `recursive_fixed = true`, `get_users_checks = true` and `storage_open = 0`.

Rollback (table or policy blocks can be copied one at a time):

```
! cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite && supabase db query --linked -f /root/sec26-apply/tools/security/2026-10/rollback/05.rollback.sql
```

After step 7, the PR is merged and MIGRATIONS.md is flipped to applied.

## Step 8: function deletes

Safe at any time after step 2. 86 functions have no caller in the Suite, HSE or NextGen code; that was checked twice, independently. The five whose source could not be downloaded are among them. The exact three `for f in ...; do supabase functions delete $f; done` lines are in `docs/security/functions-2026-10.md`, "Step 3: deletes". Run them from `/root/sec26-deploy`.

- `seed-master-apps` is deleted on purpose: anyone could write about 200 placeholder catalogue rows. The legacy "Seed apps" button on /admin/seed-apps will then show an error.
- `invite-user` stays until the Suite zip in step 9 is live, because the live bundle still calls it (now admin-only). Delete it after the zip:

```
! cd /root/sec26-deploy && supabase functions delete invite-user
```

Verify: `supabase functions list` no longer shows them.

Rollback: redeploy from the downloaded sources if a caller ever turns up.

## Step 9: Suite zip (held to the end of the video round)

No database step needs the Suite zip. The zip brings these SPA changes from the function-sweep PR:

- `src/contexts/SupabaseAuthContext.jsx`: the admin UI comes from `rpc('is_super_admin')`, no longer from user metadata or an email list.
- `src/pages/auth/AcceptInvite.jsx`: a sign-in path for invitees who already have an account.
- `src/components/admin/organizations/OrgTeam.jsx`: the admin team dialog uses invite-employee. After the zip is live, delete invite-user (step 8).

Cut it from Suite main (full sha) with the usual `cut_suite_zip.sh` when the video round ends. Then check NextGen and Lordsway are unchanged.

## Step 10: NextGen (separate project txcsbtvcdaqmkjjbhbeg)

NextGen PR #322 is merged (main 2ec111bb4). Run from the prepared checkout `/root/wt-ng-sec26`. Already done on 2026-10-14: the owner deleted `send-email` (an open relay) and the unauthenticated `create-admin`.

1. Deploy the guarded create-admin first. The admin page needs it.

```
! cd /root/wt-ng-sec26 && supabase functions deploy create-admin --project-ref txcsbtvcdaqmkjjbhbeg
```

Verify: a POST with the anon key returns 401, and a learner's token returns 403. Rollback: `supabase functions delete create-admin`. Never redeploy the old version.

2. Apply the migration. It stops signups choosing the lecturer role, closes the true INSERT policies on notifications, audit_logs, email_logs and analytics_events, and takes client EXECUTE off the academy_* lookups.

```
! cd /root/wt-ng-sec26 && supabase db query --linked -f migrations/20261014120000_security_hardening.sql
```

Verify: the INSERT policies on those four tables are exactly 3 rows, all to authenticated, none `true`. The full query is in NextGen MIGRATIONS.md. Rollback:

```
! cd /root/wt-ng-sec26 && supabase db query --linked -f migrations/docs/20261014120000_security_hardening_rollback.sql
```

3. Optional: redeploy create-super-admin and deactivate-user with verify_jwt on.

```
! cd /root/wt-ng-sec26 && supabase functions deploy create-super-admin --project-ref txcsbtvcdaqmkjjbhbeg && supabase functions deploy deactivate-user --project-ref txcsbtvcdaqmkjjbhbeg
```

4. Delete the two dead functions.

```
! supabase functions delete send-report-email --project-ref txcsbtvcdaqmkjjbhbeg
! supabase functions delete reset-password --project-ref txcsbtvcdaqmkjjbhbeg
```

---

## After everything: the walk

Log in as the demo account (Petrolord Demo) and check each of these. Look only; do not change demo data.

- the dashboard and licensed app tiles;
- Ekene wells and surfaces in Well Data Manager;
- a saved project in Material Balance Studio and in QI Studio.

Then:

- On /nape, submit one test lead, then delete it from the admin Event Leads page. Open the quiz page.
- Run one Paystack test checkout, as in the earlier proven flow.
- Invite one test address from the Employees page.
- Open a shared record from a colleague (org sharing).
- Sign in to NextGen.

## Proof (what was run before handing this over)

- `tools/security/2026-10/probes/run_dryrun.sh` applies 00-05 on production inside one transaction that always rolls back. The files are grep-checked for begin and commit first. Result: 50 of 50 targeted probes pass. The personas are anon, an ordinary member, an org admin, a platform admin, an org-B member aiming at org A, and the demo account. Every persona and table count before and after was diffed. Every difference is intended: anon and dead-table lockouts; members no longer see other users' legacy rows or invitation tokens; the petrophysics tables stop raising 42P17.
- `run_rollback_test.sh` applies 00-05 and then the generated rollbacks 05 back to 01. All 3606 persona and table counts were identical to before.
- `compat_01.sql` runs after 01 alone. The legacy metadata signup still joins, the HSE and Suite token signups join with the invited role, a fresh signup creates its own org, and an existing account accepts by RPC.
- After each run, a read-only check confirmed nothing persisted.
