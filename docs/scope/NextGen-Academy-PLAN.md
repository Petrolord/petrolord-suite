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
- **N3.2 — One identity, four doors**: personal-email account spine;
  university email as Campus verification attribute; door flows in
  order of leverage — self-enroll + Paystack first (Suite pattern),
  cohort codes, sponsorship codes, residency application queue. Role
  model rework: `learner` replaces `student` as the base identity;
  campus/residency/sponsored are enrollment attributes, not roles.
- **N3.3 — Activation gate + integrity controls**: orientation step +
  short entry assessment per account; two-device limit and session
  monitoring (login_activity exists as the raw feed); provided-
  datasets rule enforced by Learning-Mode scope itself.
- **N3.4 — Certificates v2**: verifiable ID scheme, public
  verification page (no-auth read of a minimal verification view),
  validity window per §6 decision, re-certification path.
- **N4 — First course on the spine** (unchanged from the roadmap, now
  entitlement-native): Petrophysics Beginner tier — lessons, in-app
  guided exercises on the golden teaching datasets, quiz, auto-graded
  capstone vs oracle truth. Proves Learning Mode end to end.
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

## 6. Open decisions (owner — needed before the first certificate)

- **Q1 — Certification validity window**: recommend 12 months,
  renewable by re-certification or a modest subscription; must be
  locked before the first certificate is issued.
- **Q2 — Renewal mechanism**: re-certification exam vs subscription vs
  either — pricing shape only, the spine stores validity either way.
- **Q3 — Expert→Suite bridge**: discount mechanics (code into Suite's
  Paystack flow?) — can land after N4.
- **Q4 — Entry-assessment failure policy**: gate hard (retake after
  cooldown) vs advisory placement.
- **Q5 — Learning-Mode quota numbers** per app (defaults proposed at
  N3.1 from Suite quota policy, owner tunes).
