# NextGen Geoscience Courses — Phased Build Plan (NG series)

Status: **NG1–NG7 ALL COMPLETE 2026-07-15 — THE NG SERIES IS DONE**
(nextgen PRs #16–#21 and #26 merged; migrations applied live
dry-run-first; live pentests 12/12, 10/10, 10/10, 10/10, 10/10, 11/11,
17/17 — see migrations/docs/ng*-pentest.md in the nextgen repo). All
six geoscience courses are `available` in the live catalog with all
THREE tiers (Associate/Professional/Expert) live and the full ladder
walkable honestly end to end at the published fees. The NG1
prerequisite gate, the NG6 tier-fee-integrity and ladder-progression
spine fixes, and the NG7 Suite bridge are all live.

**Owner Q3 LOCKED 2026-07-15** (Suite-bridge mechanics, decided before
the first Expert cert as required): an Expert certification
AUTO-ISSUES a personal, single-use **50% discount code for the
certified Suite module**, valid for the certificate's 12-month window.
The code lives in NextGen (`academy_suite_bridge_codes`; issue/void
triggers; anon verify fn; service-role-only redeem fn); the learner
sees it on their certificates page. **Suite-side checkout redemption
SHIPPED 2026-07-16** (Suite repo, branch feat/nextgen-bridge-checkout):
QuoteBuilder takes the code (verify-bridge-code proxy fn gives live
feedback), generate-quote re-verifies server-side and applies the
module-scoped discount (50% off the certified module's app licenses +
their seats; platform fee/storage/other modules full price; matched
case-insensitively — master_apps.module is 'Geoscience', the code
carries 'geoscience'), and ALL four payment finalizers
(verify-paystack-payment, paystack-webhook, activate-bank-transfer,
_shared/provision-quote for the Stripe rails) redeem server-to-server
via `academy_redeem_bridge_code` (idempotent; abnormal outcomes land
in payment_audit_log as bridge_redemption_flagged for the human
commercial follow-up). Quote-side snapshot lives in quotes.bridge_*
(migration 20260716090000, applied live). Live E2E 2026-07-16 with a
disposable test cert: verify valid/unknown, discounted quote to the
kobo, redeem + idempotent retry, used-code and wrong-module rejections
all green; test rows deleted on both projects. Manual honoring is no
longer needed.

Paystack keys are set on the NextGen project — the self-enroll and
campus doors are commercially live.

## 1. Starting position (all verified)

- **The N4 template is proven end to end**: enroll → activate →
  Learning Mode → auto-graded capstone → Associate certificate →
  entitlement trigger advances scope. Live pentest 16/16.
- **The capstone machinery is generic.** `academy_capstones` /
  `academy_get_capstone` / `academy_submit_capstone` work for any
  (app, tier). A new course needs only: a capstone seed row (oracle
  answer key server-side), a catalog flip, a learning page, and a
  teaching lib.
- **Engines and goldens are central** (`@petrolord/engines`, consumed
  by subtree at `packages/engines`): welldata (LAS parse/import,
  validated bit-for-bit vs lasio; 6 golden LAS files with per-curve
  stats), wellcorrelation (tops/flattening/zone spans), seismolord
  (wavelets/impedance/reflectivity/synthetics/horizon tracking),
  mapping (tops→points→grid + gridding/contours), earthmodeling
  (zone volumes, with committed volume goldens).
- **Doctrine constraints** (NextGen-Academy-PLAN §1, binding): one app
  = one course, three tiers mapping to Associate/Professional/Expert;
  teaching datasets ARE the validation goldens; grading server-side
  against oracle truth within stated tolerance; WDM Beginner is the
  ONLY hard prerequisite (the other geoscience courses read the well
  registry); everything else is recommended sequence; RLS-first.

## 2. Phases

Build in daily-loop path order. One PR + one live migration per phase,
each independently shippable.

- **NG1 — Well Data Manager Beginner** (path root). Teaching: LAS
  fundamentals on the six golden LAS files (structure, null handling,
  wrapped files, feet vs metres, curve QC). Learner parses each file
  with the real engine and reads the QC panel; the capstone asks for
  values they must find (sample counts, depth step, null counts, curve
  means) and grades them against the committed lasio goldens.
  **Also lands the prerequisite gate**: `academy_apps.prereq_slug`
  (welldata for the other five geoscience apps) enforced in the three
  enrollment-creating door functions — a live Associate certification
  on the prerequisite app is required; learners with an existing
  enrollment/certification on the target app are unaffected
  (grandfathered). EnrollPage surfaces the requirement. Flips
  `welldata` → available.
- **NG2 — Well Correlation Beginner.** Teaching wells with formation
  tops; flatten on a datum, correlate a marker, report zone spans via
  the section engine. Capstone: zone thickness/spans vs an oracle
  fixture reproduced from the engine in Node before seeding.
- **NG3 — Seismolord Beginner** (synthetics-first; no 3D viewer
  needed at this tier). Ricker wavelets, impedance and reflectivity
  from sonic/density, building a synthetic, bulk-shift alignment.
  Capstone: synthetic/reflectivity statistics vs engine-reproduced
  oracle.
- **NG4 — Mapping Beginner.** Tops → points → grid → contours with
  the central gridding library. Capstone: grid node values and surface
  statistics vs oracle.
- **NG5 — ReservoirCalc Beginner.** Contact-based zone volumetrics on
  the earthmodel teaching framework (`zoneVolumes` + the committed
  volume goldens). Capstone: GRV / net rock / pore volume / STOIIP
  within tolerance. Completes the six-course Beginner path.
- **NG6 — Intermediate tiers (Professional)** across the six courses,
  Petrophysics first (crossplots, Pickett, multi-method Sw — the
  engines and goldens already cover these). Certifying Professional
  advances the scope ladder per N3.1.
- **NG7 — Advanced tiers (Expert) + the Suite bridge** (owner Q3
  discount mechanics — decided before the first Expert cert).
  SHIPPED 2026-07-15 (nextgen PR #26, pentest 17/17): six
  advanced/expert capstones — petrophysics Rw triangulation (Arps +
  SP quicklook + Pickett converge on the typewell's 0.05, then pay
  booked with corrected vs raw Rw), welldata six-file import campaign,
  wellcorrelation missing-pick prediction (two interval methods;
  spread = growth uncertainty), seismolord wedge tuning at 25/40 Hz
  (rockphysics engine, Kallweit-Wood check), mapping leave-one-out +
  blind-test validation (hull-mask honesty), reservoircalc trend-φ
  property grid (population engine; STOIIP delta vs the constant
  booking) — plus the bridge spine per the locked Q3 terms.

## 3. Per-course definition of done

1. Migration seeds the capstone (oracle `expected`/`tol` from goldens
   or engine-reproduced fixtures; NO client SELECT policy) and flips
   the catalog row; applied live dry-run-first; logged in the NextGen
   MIGRATIONS.md.
2. Oracle independently reproduced from `@petrolord/engines` in Node
   BEFORE the migration is written (the N4 discipline) and recorded in
   the pentest doc.
3. Learning page: scope-gated (`academy_has_scope(app,'learning')`),
   TRAINING watermark from the quota read model, lessons + guided
   exercise driving the real engine + capstone submission.
4. Engines consumed from `@petrolord/engines` only — no forks, no
   re-implementations (doctrine non-goal).
5. Live RLS pentest: answer key unreadable, unenrolled submit blocked,
   pass issues the certificate exactly once, public verification works.
6. Build + CI green; EnrollPage/catalog/homepage stay consistent.

## 4. Follow-on phases (NG8-NG11): the four remaining geoscience apps

The NG series covered 6 of the Suite's 10 Geoscience apps. Full
coverage adds courses for the other four, in engine-readiness order.
Each new course is now ONE phase for ALL THREE tiers: the spine (NG1
prereq gate, NG6 tier-fee integrity + ladder, N3.1 entitlements, NG7
bridge) is generic, so a course is one catalog row + three capstones +
a learning page. Standing rule per the NG7 gotcha: the catalog row
maps `academy_apps.module` BEFORE the Expert tier sells, or the bridge
trigger issues no code. Fees inherit the subsurface school defaults.

- **NG8 — Rock Physics. SHIPPED 2026-07-16** (nextgen PR #27,
  migration applied live, pentest 15/15): Batzle-Wang fluids + VRH
  frame + Wood mix (Beginner), inverse Gassmann + substitution +
  Greenberg-Castagna (Intermediate), substitution chained into AVO
  screening (class I brine flips to class III gas) + Zoeppritz check +
  wedge tuning (Advanced). Engine + goldens existed since Suite G6;
  every graded value golden-anchored. 7th live course.
- **NG9 — Pore Pressure. SHIPPED 2026-07-16** (nextgen PR #28
  stacked on #27, migration applied live, pentest 15/15): the golden
  synthetic well itself as the teaching dataset (forward-inverse
  consistent; graded overpressure at TD is exactly the imposed 6
  MPa). Hydrostatic/overburden/NCT-fit frame (Beginner), full Eaton
  prognosis (Intermediate), EMW mud-weight window + Bowers
  cross-check + Eaton-n lever (Advanced). 8th live course.
- **NG10 — Earth Modeling. SHIPPED 2026-07-16** (nextgen PR #29
  stacked on #28, migration applied live, pentest 15/15): the golden
  three-surface fixture as the teaching dataset. Framework +
  180-node pinch-out clamp + the closed-form 45.0e6 m3 bulk anchor
  (Beginner), minimum-curvature well ties with the deviated-well
  lesson (Intermediate), fault blocks + trend/kriging population +
  per-block bulk volume with the kriging-exactness lesson
  (Advanced). Division of labour held: bulk container only, STOIIP
  stays with reservoircalc. 9th live course.
- **NG11 — Basin & Charge Modeling. SHIPPED 2026-07-16 — COMPLETES
  10/10 GEOSCIENCE COURSE COVERAGE.** NG11a (petrolord-engines PR #1,
  merged): BasinFlow Genesis math extracted verbatim into the central
  `basin` domain with its independent Python oracle + byte-identical
  goldens (the Suite's dead wrong-units VectorizedSolver left
  behind); Suite-side subtree sync + app refactor onto the domain is
  the recorded follow-up. NG11b (nextgen PR #30 stacked on #29,
  migration applied live, pentest 15/15): decompaction + the
  hand-checkable steady heat column (Beginner), Easy%Ro ramps with
  the time-is-a-reagent lesson + kerogen TR (Intermediate), and the
  full 150 Ma forward model run twice for charge + the erosion
  signature ΔRo 0.0567 (Advanced). 10th live course.

## 5. Non-goals / notes

- No cohort features in NG1–NG5 (Campus/Residency dashboards come with
  the first cohort intake).
- No new test framework in the NextGen app for now; oracle
  reproduction runs as a Node script per the N4 discipline (a vitest
  harness for teaching libs is future hardening).
- Registration fee amount is still the ₦10k placeholder (owner item).
- Curriculum polish (real lesson prose beyond the working drafts,
  entry-assessment content) remains the standing owner follow-up.
