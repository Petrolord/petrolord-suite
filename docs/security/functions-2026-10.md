# Edge Function security sweep (2026-10)

Scope: all 146 Edge Functions deployed to the shared Supabase project
(ssyckywijlrkgcwvkwlr) on 2026-10-14, 108 of them with JWT verification off.
Sources of the 109 functions that were not in any repo were downloaded with
`supabase functions download` (5 could not be extracted: batch-process-mems,
calibrate-stresses, generate-report, process-and-embed-incident,
scrape-and-store-raw-incidents; all five have no callers and are on the
delete list). Callers were searched in the Suite, HSE, NextGen and Lordsway
repos, pg_cron jobs and database functions.

## Rules every fixed function follows

- The caller is the user behind a verified JWT (`auth.getUser(jwt)`), never
  an id, email or role from the request body or from user_metadata.
- Platform super admin = `public.is_super_admin()` answering true for the
  caller's own session (`_shared/platform-admin.ts`, called through
  PostgREST with the caller's JWT). Works before and after the 2026-10
  migrations: today the function is a fixed list of three emails, after
  migration 01 it reads `public.platform_admins` (ayoasaolu@gmail.com,
  ayodejiasaolu1@gmail.com, info@petrolord.com).
- Org admin = an active owner/admin/org_admin/super_admin row in
  `organization_members` for that organization.
- Functions that only other functions call (mail, notifications) accept
  only the project's service-role key.
- Everything fails closed: any lookup error answers 401/403.
- JWT verification: all browser callers use supabase-js with the legacy JWT
  anon key, and server callers use the service-role JWT, so every function
  below can be deployed with the CLI default (verify_jwt on). The anon key
  is itself a valid JWT, so verify_jwt alone authenticates nobody; the code
  checks above are what count. paystack-webhook and stripe-webhook stay
  verify_jwt off (config.toml) and check provider signatures.

## Owner commands, in order

All deploys are safe BEFORE the database migrations (no function needs a
new table or RPC). Deploy from a fresh checkout of main after this PR
merges:

```
! rm -rf /root/sec26-deploy && git clone -q --depth 1 git@github.com:Petrolord/petrolord-suite.git /root/sec26-deploy && cd /root/sec26-deploy && supabase link --project-ref ssyckywijlrkgcwvkwlr
```

Step 1: Suite deploys (each line on its own; order inside the step does not
matter):

```
! cd /root/sec26-deploy && supabase functions deploy activate-bank-transfer reject-bank-transfer verify-bank-transfer process-subscription-renewals
! cd /root/sec26-deploy && supabase functions deploy send-email send-email-via-smtp send-renewal-notification send-quote send-demo-request send-invite
! cd /root/sec26-deploy && supabase functions deploy admin-create-user admin-delete-organization admin-grant-user-app-access admin-suspend-org admin-update-org-entitlements insert-geoscience-apps admin-cleanup-test-data
! cd /root/sec26-deploy && supabase functions deploy invite-user invite-employee accept-employee-invitation get-app-seat-usage remove-member-from-app
! cd /root/sec26-deploy && supabase functions deploy generate-quote org-export org-offboard epe-cash-flow-engine epe-cash-flow-engine-batch
```

Step 2: HSE deploys, from a fresh HSE checkout after the HSE PR merges:

```
! rm -rf /root/sec26-hse && git clone -q --depth 1 git@github.com:Petrolord/petrolord-hse.git /root/sec26-hse && cd /root/sec26-hse && supabase link --project-ref ssyckywijlrkgcwvkwlr && supabase functions deploy hse-invite-user chat-with-petrolord log-audit-event
```

Verify after steps 1 and 2 (expect 401 or 403 for every line; the anon key
is public, it ships in every bundle):

```
ANON=<anon key from src/lib/customSupabaseClient.js>
for f in send-email send-email-via-smtp send-quote activate-bank-transfer process-subscription-renewals invite-user hse-invite-user chat-with-petrolord; do
  printf '%s ' $f; curl -s -o /dev/null -w '%{http_code}\n' -X POST https://ssyckywijlrkgcwvkwlr.supabase.co/functions/v1/$f -H "Authorization: Bearer $ANON" -H 'Content-Type: application/json' -d '{"to":"x@example.com","subject":"t","html":"t","subscription_id":"00000000-0000-0000-0000-000000000000","email":"x@example.com","role":"admin","organization_id":"00000000-0000-0000-0000-000000000000","org_id":"00000000-0000-0000-0000-000000000000","messages":[]}'
done
```

Then click through: Book a Demo form (homepage) submits; a quote from
/dashboard/upgrade generates; the Super Admin console bank-transfer queue
approves (as a platform admin); Employees page invite and accept.

Step 3: deletes (unused, or replaced; see the table). Safe at any time:

```
! cd /root/sec26-deploy && for f in ai-fault-detect ai-horizon-trace alert-engine analyze-image analyze-voice anomaly-detector-engine anti-collision-guardian assign-app-to-user batch-process-mems calculate-calibration calculate-mud-window calculate-properties calculate-scenario calculate-stresses calibrate-stresses cancel-subscription casing-analysis-engine casing-analyze casing-report cementing-designer cementing-failure-analyst cementing-simulator check-subscription-status completion-plan-creator create-quote create-team data-exchange dca-engine digitize-map-via-ai ems-job-runner; do supabase functions delete $f; done
! cd /root/sec26-deploy && for f in eor-engine fluid-studio-engine gas-lift-designer generate-fdp generate-paystack-link generate-renewal-reminders generate-report get-quote-config hello-world hydraulics-simulator incident-finder-engine interpolate-surface ipr-calculator job-step jobs-get mvt-server ppfg-analyze ppfg-report probe-asset process-and-embed-incident process-paystack-payment process-quote process-quote-delivery pta_fit_basic pta_fit_interference pta_fit_multilayer pta_report_pdf pvt-engine reactivate-subscription reassign-admin-seat-to-member; do supabase functions delete $f; done
! cd /root/sec26-deploy && for f in recalculate-mems register-org-admin renew-subscription reservoir-simulation-connector-engine run-incident-scraper save-picks scenario-planner-engine scrape-and-store-raw-incidents seed-master-apps seis-tile-job seis_tile_job send-confirmation send-payment-notification send-quote-email send-renewal-reminders sendgrid-send-email sign-upload subscription-lifecycle-manager sync-existing-payments torque-drag-simulator trajectory-engine transcribe-audio type-curve-generator validate-and-store well-correlation-engine well-cost-engine well-log-parser; do supabase functions delete $f; done
```

Step 4: after the Suite zip carrying this PR is live (the admin Org Team
dialog then calls invite-employee):

```
! cd /root/sec26-deploy && supabase functions delete invite-user
```

Rollback for any deploy: redeploy the previous version from the downloaded
source kept in the session scratchpad, or from git history for functions
that were already in the repo (`git checkout <previous sha> -- supabase/functions/<slug>`
in a scratch clone, then `supabase functions deploy <slug>`). Deleted
functions can be restored from the downloaded sources if a caller turns up.

## What rides the Suite zip (SPA changes)

- `src/contexts/SupabaseAuthContext.jsx`: platform admin UI from
  `rpc('is_super_admin')`, no longer from user_metadata or an email list
  (support@petrolord.com stops seeing the admin console, by decision).
- `src/pages/auth/AcceptInvite.jsx`: sign-in path for invitees who already
  have an account.
- `src/components/admin/organizations/OrgTeam.jsx`: invite-employee instead
  of the legacy invite-user.

Until the zip ships, the live bundle keeps working against the fixed
functions (invite-user stays deployed for it, now admin-only).

## Notes

- Kept deployed-only, not changed: request-app-access (verified caller),
  respond-to-access-request and bulk-import-employees (verified caller; both
  read the dropped organization_users table so they refuse every request).
- analyze-quick-report trusts a service_role claim it decodes without
  verifying; that is safe only while its verify_jwt stays on (it is on).
- submit-public-observation is anonymous by design (site QR token, rate
  limited per IP) and unchanged.
- hse-expiry-reminders is called by pg_cron with a bearer token and is
  idempotent (stamped columns); unchanged.
- create-stripe-checkout, verify-promo-code, verify-bridge-code,
  verify-paystack-payment, verify-stripe-payment: public by design or
  verified against the provider; unchanged.
- Dashboard.jsx still shows admin buttons from user_metadata.role; cosmetic
  (every action behind them is checked server side). Left for a later pass.

## Per-function table

| function | verify_jwt (deployed) | callers found | class | action | owner step |
|---|---|---|---|---|---|
| accept-employee-invitation | on | suite:pages/auth/AcceptInvite.jsx,invite-employee/index.ts | used, in repo: fixed | token in metadata, invited row kept, no role in metadata; existing accounts link only from a matching session | Suite deploy |
| activate-bank-transfer | on | suite:pages/admin/AdminOrganizations.jsx,renewal-expiry/finalizers_live.sql,renewal-expiry/finalizers_new.sql,verify-paystack-payment/index.ts,verify-bank-transfer/index.ts | used, in repo: fixed | platform admin (was open: self-approval of proofs) | Suite deploy |
| admin-cleanup-test-data | on | NONE | used, in repo: fixed | platform admin via is_super_admin() | Suite deploy |
| admin-create-user | off | suite:pages/__tests__/W6gAdminPages.theme.test.jsx,pages/AdminCreateUser.jsx,App.jsx,design/coldLoad.jsx | used, privileged: brought into repo + fixed | platform admin (requirePlatformAdmin) | Suite deploy |
| admin-delete-organization | off | suite:pages/SuperAdminConsole.jsx | used, privileged: brought into repo + fixed | platform admin | Suite deploy |
| admin-grant-user-app-access | off | suite:components/EmergencyAccessModal.jsx | used, privileged: brought into repo + fixed | platform admin | Suite deploy |
| admin-suspend-org | off | suite:pages/SuperAdminConsole.jsx | used, privileged: brought into repo + fixed | platform admin | Suite deploy |
| admin-update-org-entitlements | off | suite:pages/SuperAdminConsole.jsx,components/AddAppModal.jsx | used, privileged: brought into repo + fixed | platform admin | Suite deploy |
| ai-eval-assist | on | suite:pages/apps/__tests__/aiEvaluationStudio.smoke.test.jsx,__tests__/dataAiRegistration.test.js,utils/dataAi/__tests__/evalPersistence.test.js,utils/dataAi/evalAssist.js,scratch/llm-user-cap-checks.sql,dataai/negcontrol_eval_studio.sh | in repo, checked: no change | caller check present or public by design | none |
| ai-fault-detect | on | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| ai-horizon-trace | on | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| alert-engine | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| analyze-image | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| analyze-quick-report | on | hse:forecast-safety/index.ts,submit-public-observation/index.ts,migrations/20260720130000_hse_ai_usage.sql,services/aiAnalysisService.js,services/quickReportService.js | in repo, checked: no change | caller check present or public by design | none |
| analyze-voice | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| anomaly-detector-engine | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| anti-collision-guardian | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| assign-app-to-user | off | suite:pages/SubscriptionManagement.jsx | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| batch-process-mems | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| bulk-import-employees | off | suite:pages/admin/BulkImportEmployees.jsx | used, deployed-only | verified caller; admin check reads the dropped organization_users table, so it always refuses (fails closed) | none |
| calculate-calibration | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| calculate-mbal | on | suite:contexts/MaterialBalanceStudioContext.jsx,pages/apps/reservoir-balance/__tests__/mbalEditing.test.jsx,pages/apps/reservoir-balance/ReservoirBalance.jsx,pages/apps/reservoir-balance/lib/__tests__/mbalRunMapping.test.js,pages/apps/reservoir-balance/lib/api.js,pages/apps/reservoir-balance/lib/runStaleness.js(+20) | in repo, checked: no change | caller check present or public by design | none |
| calculate-mud-window | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| calculate-properties | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| calculate-scenario | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| calculate-stresses | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| calibrate-stresses | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| cancel-subscription | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| casing-analysis-engine | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| casing-analyze | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| casing-report | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| cementing-designer | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| cementing-failure-analyst | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| cementing-simulator | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| chat-with-petrolord | off | hse:services/chatbotService.js | HSE, used: fixed | signed-in org member; turns capped; fixed system prompt | HSE deploy |
| check-subscription-status | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| completion-plan-creator | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| create-quote | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| create-stripe-checkout | off | suite:pages/QuoteDashboard.jsx | in repo, checked: no change | caller check present or public by design | none |
| create-team | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| data-exchange | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| dca-engine | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| digitize-map-via-ai | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| ems-job-runner | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| eor-engine | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| epe-cash-flow-engine | on | suite:pages/apps/epe/EpeRunConsole.jsx,pages/apps/epe/EpeResultsViewer.jsx,__tests__/domain.economics.test.js,_shared/epe-engine.ts,_shared/epe-mc.ts,epe-monte-carlo/index.ts(+1) | used, in repo: fixed | run must be visible to the caller under RLS | Suite deploy |
| epe-cash-flow-engine-batch | on | suite:pages/apps/epe/EpeResultsViewer.jsx,_shared/epe-engine.ts,_shared/epe-mc.ts | used, in repo: fixed | run and sensitivity run visible under RLS | Suite deploy |
| epe-monte-carlo | on | suite:pages/apps/epe/EpeMonteCarloPanel.jsx,_shared/epe-engine.ts,_shared/epe-mc.ts | in repo, checked: no change | caller check present or public by design | none |
| fluid-studio-engine | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| forecast-safety | on | hse:services/predictiveAnalyticsService.js,components/hse/HSEDashboard.jsx | in repo, checked: no change | caller check present or public by design | none |
| gas-lift-designer | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| generate-fdp | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| generate-paystack-link | off | suite:verify-paystack-payment/index.ts | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| generate-pvt-preview | on | suite:pages/apps/reservoir-balance/lib/api.js,pages/apps/reservoir-balance/harness/MbalHarness.jsx,pages/apps/reservoir-balance/harness/engineStandIn.js,mbal/mbalEngine.ts | in repo, checked: no change | caller check present or public by design | none |
| generate-quote | on | suite:pages/__tests__/accountFixes.test.jsx,pages/__tests__/QuoteBuilder.seismicStorage.test.jsx,pages/__tests__/getQuoteRoute.test.jsx,pages/__tests__/QuoteBuilder.theme.test.jsx,pages/QuoteBuilder.jsx,pages/admin/PromoCodes.jsx(+25) ; ng:academy-checkout/index.ts | used, in repo: fixed | user from the session, never the body; org-admin check always | Suite deploy |
| generate-renewal-reminders | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| generate-report | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| get-active-apps | on | suite:pages/__tests__/W3fAdminPages.theme.test.jsx | unused (test only), in repo | no change (read-only catalog); candidate to delete later | none |
| get-app-seat-usage | off | suite:pages/__tests__/SubscriptionPages.theme.test.jsx,pages/SubscriptionManagement.jsx | used, privileged: brought into repo + fixed | org member; app_id validated; no listUsers | Suite deploy |
| get-quote-config | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| get-user-entitlements | on | suite:data/masterAppSlugs.json,dev/HubsHarness.jsx,dev/RouteGuardHarness.jsx,hooks/useUserEntitlements.js,hooks/usePurchasedModules.js,generate-quote/index.ts | in repo, checked: no change | caller check present or public by design | none |
| hello-world | off | NONE | unused | delete | delete |
| hse-checkout | on | suite:assurance/rls-pentest-commerce.sql,_shared/provision-quote.ts ; hse:services/billingService.js | in repo, checked: no change | caller check present or public by design | none |
| hse-expiry-reminders | on | NONE | in repo, checked: no change | caller check present or public by design | none |
| hse-invite-user | on | hse:services/orgAdminService.js,components/hse/team/InviteTeamMember.jsx | HSE, used: fixed | org admin or platform admin; invited_by from session | HSE deploy |
| hydraulics-simulator | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| incident-finder-engine | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| insert-geoscience-apps | off | suite:pages/admin/AdminSeedApps.jsx | used, privileged: brought into repo + fixed | platform admin or service role | Suite deploy |
| interpolate-surface | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| invite-employee | on | suite:components/InviteEmployee.jsx,org-export/index.ts,_shared/email.ts,accept-employee-invitation/index.ts ; hse:_shared/email.ts,hse-invite-user/index.ts | used, in repo: fixed | no self-set admin flag; super_admin never invitable; owners invite owners | Suite deploy |
| invite-user | off | suite:components/admin/organizations/OrgTeam.jsx ; hse:hse-invite-user/index.ts,services/orgAdminService.js,components/hse/team/InviteTeamMember.jsx | used, privileged: brought into repo + fixed | org admin or platform admin; DELETE after the Suite zip | Suite deploy |
| ipr-calculator | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| job-step | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| jobs-get | on | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| log-audit-event | on | hse:submit-public-observation/index.ts,services/orgAdminService.js,services/quickReportService.js | HSE, used: fixed | service role, or signed-in member of that org (actor = session) | HSE deploy |
| mvt-server | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| org-export | on | suite:pages/DataExport.jsx,lib/portability/supabaseSource.js,simworker/supa.py,pld-sign/index.ts,__tests__/helpers.test.js,org-offboard/helpers.js(+1) | used, in repo: fixed | shared org-admin / platform-admin check | Suite deploy |
| org-offboard | on | suite:pages/DataExport.jsx,pages/legal/VerifyDeletion.jsx,pld-sign/certificate.ts,pld-sign/index.ts | used, in repo: fixed | shared org-admin / platform-admin check | Suite deploy |
| paystack-webhook | off | suite:renewal-expiry/finalizers_live.sql,renewal-expiry/finalizers_new.sql,__tests__/paystack-ngn.test.ts ; ng:supabase/config.toml | in repo, checked: no change | caller check present or public by design | none |
| petro-scan-read | on | suite:pages/apps/PetrophysicsStudio/services/registryBackend.js,pages/apps/PetrophysicsStudio/services/scanRead.js,pages/apps/PetrophysicsStudio/services/scanProposal.js,pages/apps/PetrophysicsStudio/__tests__/u2018.test.js,pages/apps/PetrophysicsStudio/components/DigitizerDialog.jsx | in repo, checked: no change | caller check present or public by design | none |
| pld-sign | on | suite:pages/legal/VerifyExport.jsx,components/portability/__tests__/PackageExportDialog.test.jsx,components/portability/SigningSummary.jsx,lib/portability/signing.js,lib/portability/__tests__/signing.test.js,lib/portability/signClient.js(+2) | in repo, checked: no change | caller check present or public by design | none |
| ppfg-analyze | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| ppfg-report | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| probe-asset | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| process-and-embed-incident | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| process-paystack-payment | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| process-quote | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| process-quote-delivery | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| process-subscription-renewals | on | suite:__tests__/paystack-ngn.test.ts,_shared/seismic-storage.ts | used, in repo: fixed | service role or platform admin (charges saved cards) | Suite deploy |
| pta_fit_basic | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| pta_fit_interference | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| pta_fit_multilayer | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| pta_report_pdf | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| pvt-engine | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| qi-upload-url | on | suite:lib/__tests__/qiUpload.test.js,lib/qiUpload.js,dev/SeismolordServerImportHarness.jsx,__tests__/ingestUrl.test.js,handlers/exportSegy.js,handlers/angleStacks.js(+3) | in repo, checked: no change | caller check present or public by design | none |
| reactivate-subscription | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| reassign-admin-seat-to-member | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| recalculate-mems | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| register-org-admin | off | hse:components/auth/OrganizationSignup.jsx | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| reject-bank-transfer | on | suite:pages/admin/AdminOrganizations.jsx | used, in repo: fixed | platform admin | Suite deploy |
| remove-member-from-app | off | suite:pages/SubscriptionManagement.jsx | used, privileged: brought into repo + fixed | org admin; assignment must belong to the org; body requested_by ignored | Suite deploy |
| renew-subscription | off | suite:pages/__tests__/SubscriptionPages.theme.test.jsx,pages/RenewSubscription.jsx | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| report-autopilot | on | suite:contexts/SupabaseAuthContext.jsx,pages/apps/__tests__/TechnicalReportAutopilot.theme.test.jsx,pages/apps/__tests__/reportAutopilot.test.jsx,pages/apps/__tests__/economicsEC61.test.jsx,pages/apps/TechnicalReportAutopilot.jsx,data/masterAppSlugs.json(+6) | in repo, checked: no change | caller check present or public by design | none |
| request-app-access | off | suite:components/RequestAccessModal.jsx | used, deployed-only | verified caller (session + membership); admin mail lookup uses the dropped organization_users table, so no mail goes out (functional bug, not a hole) | none |
| reservoir-engine | off | suite:contexts/ReservoirContext.jsx | in repo, checked: no change | caller check present or public by design | none |
| reservoir-simulation-connector-engine | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| respond-to-access-request | off | suite:pages/__tests__/accountFixes.test.jsx,components/RespondToRequestModal.jsx | used, deployed-only | verified caller; admin check reads the dropped organization_users table, so it always refuses (fails closed) | none |
| run-incident-scraper | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| save-picks | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| scenario-planner-engine | off | suite:App.jsx | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| scrape-and-store-raw-incidents | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| seed-master-apps | off | suite:pages/admin/AdminSeedApps.jsx | used by the legacy "Seed apps" button on /admin/seed-apps | delete: unauthenticated writer of about 200 placeholder rows into master_apps; the button will then show an error | delete |
| seis-tile-job | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| seis_tile_job | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| seismolord-ai | on | suite:pages/apps/Seismolord/components/AiPanel.jsx,petro-scan-read/index.ts | in repo, checked: no change | caller check present or public by design | none |
| seismolord-engine | on | suite:pages/apps/Seismolord/components/workspace/StatusBar.jsx,pages/apps/Seismolord/hooks/useBackendStatus.js | in repo, checked: no change | caller check present or public by design | none |
| send-confirmation | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| send-demo-request | off | suite:components/BookDemoModal.jsx | used, privileged: brought into repo + fixed | public form kept anonymous; escaped, validated, 3 per address per day | Suite deploy |
| send-email | off | suite:generate-quote/index.ts,_shared/email.ts,_shared/provision-quote.ts,verify-paystack-payment/index.ts,verify-bank-transfer/index.ts ; hse:services/notificationService.js | used, privileged: brought into repo + fixed | service-role callers only (relay closed) | Suite deploy |
| send-email-via-smtp | off | suite:generate-quote/index.ts,_shared/email.ts,_shared/provision-quote.ts,verify-paystack-payment/index.ts,verify-bank-transfer/index.ts | used, privileged: brought into repo + fixed | service-role callers only (relay closed); Resend/Brevo | Suite deploy |
| send-invite | off | hse:services/inviteUserService.js,services/teamService.js ; lw:hooks/useResendInvitation.js | used, privileged: brought into repo + fixed | org admin of a pending invitation; DB recipient only (relay closed) | Suite deploy |
| send-payment-notification | off | suite:verify-paystack-payment/index.ts | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| send-quote | off | suite:pages/__tests__/W6fAdminOrgPages.theme.test.jsx,pages/admin/OrgDetail.jsx,pages/admin/OrgSendQuote.jsx,pages/admin/AdminOrganizations.jsx,components/admin/organizations/OrgSubscription.jsx,components/admin/organizations/OrgQuotes.jsx(+1) | used, privileged: brought into repo + fixed | platform admin; values escaped | Suite deploy |
| send-quote-email | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| send-renewal-notification | off | suite:process-subscription-renewals/index.ts | used, privileged: brought into repo + fixed | service-role callers only | Suite deploy |
| send-renewal-reminders | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| sendgrid-send-email | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| sign-upload | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| stripe-webhook | off | suite:create-stripe-checkout/index.ts,hse-checkout/index.ts | in repo, checked: no change | caller check present or public by design | none |
| submit-public-observation | on | hse:analyze-quick-report/index.ts,components/public/__tests__/PublicPages.theme.test.jsx,components/public/PublicObservation.jsx | in repo, checked: no change | caller check present or public by design | none |
| subscription-lifecycle-manager | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| sync-existing-payments | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| torque-drag-simulator | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| trajectory-engine | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| transcribe-audio | off | hse:services/aiAnalysisService.js | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| type-curve-generator | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| validate-and-store | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| verify-bank-transfer | on | suite:pages/admin/AdminOrganizations.jsx,pages/QuoteDashboard.jsx,__tests__/subscriptions-org-quote-race.test.ts,_shared/subscription-write.ts,verify-paystack-payment/index.ts | used, in repo: fixed | org admin of the quote org; PDF/image only, 10 MB | Suite deploy |
| verify-bridge-code | off | suite:pages/__tests__/QuoteBuilder.theme.test.jsx,pages/QuoteBuilder.jsx,verify-promo-code/index.ts | in repo, checked: no change | caller check present or public by design | none |
| verify-paystack-payment | on | suite:pages/PaymentVerification.jsx,pages/QuoteDashboard.jsx,utils/paymentVerificationLogic.js,renewal-expiry/finalizers_live.sql,renewal-expiry/finalizers_new.sql,__tests__/paystack-ngn.test.ts(+2) ; hse:services/billingService.js | in repo, checked: no change | caller check present or public by design | none |
| verify-promo-code | on | suite:pages/__tests__/QuoteBuilder.promoLink.test.jsx,pages/__tests__/QuoteBuilder.theme.test.jsx,pages/QuoteBuilder.jsx,_shared/promo-codes.ts | in repo, checked: no change | caller check present or public by design | none |
| verify-stripe-payment | on | suite:pages/PaymentVerification.jsx,create-stripe-checkout/index.ts,hse-checkout/index.ts,stripe-webhook/index.ts ; hse:services/billingService.js | in repo, checked: no change | caller check present or public by design | none |
| well-correlation-engine | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| well-cost-engine | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| well-log-parser | off | NONE | UNUSED (no caller in Suite, HSE, NextGen, Lordsway, cron) | delete | delete |
| ws-sign | on | suite:pages/apps/WellsiteStudio/services/transports/supabaseTransport.js,pages/apps/WellsiteStudio/__tests__/reports.test.jsx,pages/apps/WellsiteStudio/components/ReportSignoff.jsx,lib/wellsite/signClient.js | in repo, checked: no change | caller check present or public by design | none |