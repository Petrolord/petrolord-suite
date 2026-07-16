# NextGen Academy — Doctrine, N3 Audit & Build Plan

Status: DRAFT 2026-07-15 — doctrine dictated by owner (below, binding);
open decisions in §6 await sign-off. Supersedes the N3 sketch in
NextGen-ROADMAP.md ("LMS chassis audit + wire registration funnel"):
the 24 `nextgen_registrations` rows are **test-only** — no funnel
migration; the funnel itself will change with the four-door model.

## 1. Doctrine (owner directive, 2026-07-15 — plan of record)

**Onboarding: one identity, four doors.** Four entry paths —
self-enrolled learners, Campus cohorts, Residency intakes,
employer-sponsored professionals — on ONE account and enrollment
spine. The primary identity is a **personal email**; the university
email is demoted to a verification attribute on Campus learners
(scholarship eligibility). An academy relationship outlives graduation
— certifications, alumni standing, the bridge to professional Suite
use — and university emails die at graduation. The doors differ only
in who pays and how the enrollment is granted: self-enrolled pay the
published fee at registration (Paystack, Suite's integration pattern);
Campus scholars enter via a cohort code from the university liaison
(scholarship applied at the published fee; learner pays the modest
personal registration fee); Residency candidates apply and selection
creates the enrollment; sponsored professionals redeem an employer
sponsorship code that bills the sponsor. Same account, same courses,
same certificates — only the payer differs.

**Kept from the old policy** (were right): orientation step + short
entry assessment as an activation gate (now per-account, not
per-university); the two-device limit; session monitoring; the
"use only provided datasets" data rule; the academic-integrity
provisions. **Retired**: blanket 10/12-month durations (access follows
enrollment and certification); lecturer-uploaded lists as the only
path; all "no licensing fees" language (the university proposal
document is rewritten around scholarships-at-published-fees before it
goes to another university — owner-side document task).

**Course management: the catalog is the app catalog.** One app = one
course; three tiers per course (Beginner → Intermediate → Advanced)
mapping to the Associate → Professional → Expert certification ladder.
Modules become learning paths (Geoscience = Well Data Manager →
Petrophysics → Correlation → Seismolord → Mapping → ReservoirCalc —
the daily-loop sequence). Prerequisite graph stays shallow and honest:
only what the data spine genuinely forces (WDM Beginner is a hard
prerequisite for the other geoscience courses because they all read
the well registry); everything else is recommended sequence. Each tier
= lessons + guided exercises inside the actual app on bundled teaching
datasets + a quiz + a practical capstone. **The teaching datasets are
the validation golden files**, so every practical has a
machine-checkable right answer — picked horizons, computed porosity,
Monte Carlo STOIIP auto-graded against oracle truth within stated
tolerance (the jest mechanism). Auto-graded practicals at scale = a
24-course academy operable by a small team. Cohort features
(instructor dashboard, progress visibility, time-boxed unlocks) for
Campus and Residency; self-paced default otherwise. Certificates carry
verifiable IDs with a **public verification page from day one**.

**The unlock procedure: scope, not switch.** You cannot learn an app
you can't touch, so unlock is a ladder of capability scopes:
- *Enrollment → Learning Mode*: the app opens against bundled teaching
  datasets only — no own-data upload, small quotas, exports
  watermarked "Training".
- *Associate → working mode*: own-data upload within modest quotas,
  core features, watermark removed.
- *Professional → advanced capabilities* (e.g. Seismolord fault-aware
  gridding / multi-well ops; multimineral solver class features).
- *Expert → full capability + the bridge outward*: highest quotas,
  full export formats, discounted pathway into professional Suite
  (Expert graduates are pre-trained future Suite customers).

Mechanically, in NextGen's own Supabase project: an **entitlements
table** (user, app, tier scope, granted-by — certification /
enrollment / instructor override / sponsorship — valid-from,
valid-until), written by a trigger when a certification row lands,
read by RLS policies on every app table and by frontend feature
flags. **Enforcement server-side through RLS, never client-only.**
Certification-granted access carries a validity window (owner decision
§6 — decided BEFORE the first certificate is issued). Instructor
overrides exist but are time-boxed and logged. Quotas lift Suite's
live-computed quota policy. Entitlements, certifications and progress
are the academy's commercial records — full shared-table discipline
(second-engineer review bar, staging-first, pentests).

**Build order**: the unlock/entitlement spine is the FIRST thing built
— before any app is ported — so every ported app lands into the
entitlement framework instead of having gates retrofitted.

## 2. N3 chassis audit (2026-07-15, post-N2 tree at `baa44fe4`)

**Repair-grade (keep):**
- Course/quiz data core: `courses → course_modules → course_lessons`,
  `quizzes/quiz_questions/quiz_options/quiz_attempts/
  quiz_attempt_answers`, `course_passing_requirements`; real CRUD
  services (quizService 239 loc). Zero live attempts/enrollments/
  certificates — demo content only, so schema changes carry **no data
  migration burden**.
- Role mechanism (RoleContext + `role_permissions`) — the machinery is
  reusable; the role MODEL changes (see below).
- Admin/compliance surfaces (audit logs, notifications, imports) —
  serviceable; N3 does not touch them.

**Contradicts the doctrine (rebuild):**
- Identity is university-email-gatekeepered end to end (university
  onboarding steps, CSV lecturer-list import, add-user forms) — the
  exact model the doctrine flips.
- Access = `licenses` with semester/alumni-grace durations (180/60
  days hardcoded in LicenseDisplay) — the retired duration model; no
  entitlements, no capability scopes, no quotas.
- One door only (Campus): no self-enrollment, **zero payment code**
  (no Paystack anywhere), no sponsorship codes, no residency intake.
- Certificates: table + PDF with a `certificate_number`, but **no
  public verification page, no validity window** — day-one doctrine
  requirements.

**Never existed** (old-policy "keep" items that were never built —
greenfield, not repair): two-device limit, session monitoring,
orientation + entry-assessment activation gate.

**Verdict: hybrid.** Keep the course/quiz core and admin surfaces;
REBUILD the identity/enrollment/access layer, which implements
precisely the retired policy. DB is at 93 tables / 224 policies
post-N2; the licenses/university-application families shrink further
as the spine replaces them (dropped only after the new doors work —
no big-bang cutover).

## 3. Build phases (N3.x, on the NextGen repo/project)

- **N3.1 — Entitlement + certification spine** (FIRST, per doctrine):
  tables `academy_enrollments` (user, course, door, payer ref,
  cohort/sponsorship linkage), `academy_certifications` (user, course,
  tier, verifiable id, issued/valid-until), `academy_entitlements`
  (user, app, scope, granted_by, valid window), `academy_codes`
  (cohort + sponsorship codes, issuer, redemption limits), plus the
  certification→entitlement trigger and the quota read model (Suite's
  live-computed pattern). Migration files + MIGRATIONS.md, dry-run
  first, RLS pentest per commercial-records discipline. Naming
  prefixed `academy_*` (product-prefix convention).
- **N3.2 — One identity, four doors** — **DONE 2026-07-15**
  (nextgen `feat/n3-2-four-doors`): personal-email account spine
  (`/register`, base role `learner`); university email as Campus
  verification attribute (`profiles.university_email`); all four door
  flows live — self-enroll + Paystack, cohort codes, sponsorship codes,
  residency application queue — plus a learner Enroll page and an admin
  Academy-Doors page (issue codes, decide residency). Migration
  `20260715_n32_four_doors.sql` (applied live, dry-run first): 4 tables
  + 6 SECURITY DEFINER door functions + server-side fee lookup;
  `academy_apply_successful_payment` validates amount **and** currency
  (hardening over the Suite verify) and is idempotent + service-role
  only. Edge functions `academy-checkout` / `academy-verify` /
  `academy-paystack-webhook` deployed (mirror the Suite Paystack pattern:
  server-side amount, HMAC webhook, server-verify trust anchor). Role
  model reworked to `learner` base; doors are enrollment attributes, not
  roles. **Two pre-existing live escalation holes found + fixed**:
  signup metadata role forgery and self role-change via the
  update-own-profile RLS policy. Live pentest 37/37
  (`migrations/docs/academy-doors-pentest.md`). **Published fees SET
  2026-07-15** (owner schedule, `20260715_published_fees.sql`, PR #10):
  per school × tier — Subsurface & Engineering ₦60k/₦120k/₦200k, Energy
  Business & Society ₦40k/₦75k/₦120k (Associate/Professional/Expert);
  NGN charge, USD secondary display; `academy_apps.school` drives the
  lookup. Registration fee still a ₦10k placeholder (schedule doesn't
  set it). **Still blocked on owner**: `PAYSTACK_SECRET_KEY` secret
  before the self/campus doors can take live money.
- **N3.3 — Activation gate + integrity controls** — **DONE 2026-07-15**
  (nextgen `feat/n3-3-activation-gate`, PR #7 stacked on #6): per-account
  orientation step + short entry assessment as the activation gate;
  two-device limit; session monitoring. Migration
  `20260715_n33_activation_gate.sql` (applied live, dry-run first):
  `academy_account_state`, `academy_assessment_questions` (answer key
  server-side only — no client SELECT policy; placeholder placement
  bank), `academy_devices`, `academy_sessions`. The gate is **folded
  into `academy_has_scope`** — an unactivated learner holds entitlements
  but resolves NO effective scope, so the gate is RLS-real via the same
  predicate every ported app reads. Server-graded entry assessment →
  placement tier; **Q4** shipped as a `system_settings` toggle
  (`academy_entry_assessment_policy`) defaulting to `advisory`
  (owner flips to `hard_gate` with a retake cooldown). Two-device limit
  enforced in the definer function (a Supabase JWT carries no device id,
  so it cannot be a per-request RLS predicate — the definer gate +
  `academy_sessions` feed is the honest ceiling, documented as such).
  Provided-datasets rule = the existing learning-scope quota
  (`own_data_upload=false`), no new mechanism. Frontend: Get Started
  wizard, activation banner, DeviceGuard + Devices page, admin session
  monitoring. Legacy `login_activity`/`student_login_logs` NOT reused
  (writer-less / legacy-only). Live pentest 21/21
  (`migrations/docs/academy-activation-pentest.md`). **Owner follow-up**:
  decide Q4 policy; replace placeholder assessment questions with
  curriculum content.
- **N3.4 — Certificates v2** — **DONE 2026-07-15** (nextgen
  `feat/n3-4-certificates`, PR #8 stacked on #7). The verifiable-ID
  scheme + anon verify function shipped at N3.1; N3.4 adds the missing
  halves. Migration `20260715_n34_certificates_v2.sql` (applied live,
  dry-run first): `academy_issue_certification` (instructor/admin or the
  trusted server for N4 auto-issue; **re-certification = clean supersede**
  — re-issuing the same user/app/tier revokes the prior live cert,
  expires its entitlement via the N3.1 trigger, and the fresh insert
  grants a new 12-month window) + `academy_revoke_certification`
  (instructor/admin, idempotent). Frontend: public no-auth
  `/verify` + `/verify/:code` (mining-resistant — keyed on the
  unguessable `verify_code`, not the sequential number; table has no
  anon SELECT), learner certificates v2 page (verifiable IDs + validity
  window + shareable link + print; repoints `/dashboard/certificates`
  off the legacy `certificates` table), instructor/admin issuance
  console. Q1 (12-month validity) is the N3.1 table default; **Q2**
  (renewal pricing shape) still an owner call — sits above this layer,
  spine stores validity either way. Auto-issue on capstone pass lands at
  N4 via the service-role path this exposes. Live pentest 20/20
  (`migrations/docs/academy-certificates-pentest.md`).
- **N4 — First course on the spine** — **DONE 2026-07-15** (nextgen
  `feat/n4-petrophysics`, PR #9 stacked on #8). Petrophysics Beginner,
  entitlement-native, **proves Learning Mode end to end**: enrol →
  activate → Learning scope → drive the real engine over the teaching
  dataset → pass an auto-graded capstone → Associate certificate
  auto-issued → ladder advances to working mode. Central engines
  consumed unchanged via **git-subtree** at `packages/engines`
  (`@petrolord/engines`; no fork — the roadmap's second-consumer rule).
  Migration `20260715_n4_petrophysics_capstone.sql` (applied live,
  dry-run first): `academy_capstones` (oracle answer key = the
  validation goldens' net-pay summaries, **no client SELECT** — the
  auto-graded-practical moat) + `academy_capstone_attempts`;
  `academy_get_capstone` (labels only) + `academy_submit_capstone`
  (server-side tolerance grading, requires `academy_has_scope(app,
  'learning')`, auto-issues the mapped cert idempotently on a full pass).
  Frontend: a Petrophysics Learning Mode workspace (scope-gated, Training
  watermark, editable interpretation params driving VSH/φ/Sw/net-pay,
  live chart, capstone → cert). Expected values independently reproduced
  from the engine so an honest learner reaches them exactly; the teaching
  dataset IS the validation goldens, so grader and data cannot drift.
  Live pentest 16/16 (`migrations/docs/petrophysics-capstone-pentest.md`).
  The remaining 23 courses follow this template.
- **Retirement pass** (after doors are live): drop the legacy
  licenses/duration tables and university-gatekeeper onboarding.

## 4. Non-goals / guardrails

- No client-only gating anywhere — every scope check is an RLS policy
  first, a feature flag second.
- No forked engines; teaching exercises call `@petrolord/engines`
  exactly as the Suite does.
- No blanket durations return through the back door (instructor
  overrides are time-boxed + logged, not open-ended).
- The 24 test registrations are discarded, not migrated.

## 5. What N3 explicitly does NOT decide

The published fee levels, scholarship economics and the university
proposal rewrite are owner/commercial workstreams; the spine only
needs their SHAPES (a fee is a Paystack charge on door 1; a
scholarship is a code-granted enrollment at published fee).

## 6. Open decisions — ALL LOCKED

- **Q1 — LOCKED (2026-07-15)**: 12-month validity, live since N3.1.
- **Q2 — LOCKED (2026-07-16, owner-delegated)**: renewal =
  RE-CERTIFICATION at a 50% renewal fee (subsurface ₦30k/60k/100k,
  energy_business ₦20k/37.5k/60k), window = last 60 days of validity
  or after expiry; passing the capstone supersedes the old cert with
  a fresh 12-month one (entitlement + Expert bridge code roll via the
  existing triggers). Shipped: nextgen PR #31, migration
  20260716_owner_decisions.sql live, pentest 7/7.
- **Q3 — LOCKED (2026-07-15)**: Expert cert auto-issues the 50%
  module code; Suite checkout redemption live (Suite PR #82).
- **Q4 — LOCKED (2026-07-16, owner-delegated)**: ADVISORY placement
  stands (hard_gate machinery kept, owner can flip the setting).
  Entry-assessment content is real now: 15-question v1 bank spanning
  the ten courses (nextgen PR #31).
- **Q5 — LOCKED (2026-07-16, owner-delegated)**: the N3.1 default
  quota matrix stands.
- **Registration fee — LOCKED (2026-07-16, owner-delegated)** at the
  live ₦10,000.
- **Curriculum prose — LOCKED as v1 (2026-07-16, owner-delegated)**:
  the shipped lesson sets (9-11 engine-grounded lessons per original
  course, 6 per NG8-NG11 course).
