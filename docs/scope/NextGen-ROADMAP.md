# Petrolord NextGen — Audit & Roadmap (plan of record on approval)

Status: DRAFT 2026-07-14 — awaiting owner sign-off on §5.
Owner directives already given: NextGen reuses the Suite's validated
engines from a central position (a shared engines repo both products
consume), and **all current NextGen applications are removed** — none
is solidly okay.

## 1. Audit (2026-07-14)

### 1.1 What NextGen is today

- **Repo**: `petrolord-nextgen` (local checkout at
  `workspaces/dev1/projects/petrolord-nextgen`; origin
  `iPeculia/petrolord-nextgen`, a `Petrolord/petrolord-nextgen` mirror
  also exists — canonical remote is an open question, §5 Q4). Horizons
  import, ~1,594 src files / ~35k loc, last commit 2026-04-21
  ("Snapshot: clean building state") — **stale ~3 months**. `dist/` is
  committed (the pre-cleanup Suite pattern).
- **Product shape**: a university LMS — roles Super Admin / University
  Admin / Lecturer / Student; courses → modules → lessons → quizzes →
  certificates/achievements/leaderboards; university onboarding and
  department mapping; 74 top-level pages. A prior Horizons audit
  (`SYSTEM_AUDIT_REPORT_20260127.md`) describes the same shape.
- **Embedded engineering tools** (the part the owner has condemned):
  ~15 tools across `src/pages/apps/` (9 files, ~100 loc each —
  DeclineCurveAnalysis, MaterialBalancePro, VolumetricsPro,
  WellCorrelationTool, TorqueDrag, WellPlanning, WellTest,
  ReservoirSimulation), `src/pages/modules/**` (16 files, 2.8k loc),
  `src/pages/production/**` (nodal-analysis, pressure-transient,
  network-optimization), `src/pages/economics/**` (irr-analysis +
  risk-analysis: **39 loc total**), plus a 28-file `enterprise/` tree.
  Quality probe: **zero** Supabase usage in `pages/apps`, only 4 files
  in the entire tool surface contain transcendental math, 3 contain
  `Math.random`, one jest test exists. These are name-twins of Suite
  apps with none of the Suite's validation discipline — the owner's
  verdict ("none solidly okay") is confirmed. **All of it goes (N2).**
- **Database** (own Supabase project `txcsbtvcdaqmkjjbhbeg`,
  Stockholm): 150 public tables, 326 RLS policies, 14 auth users.
  Demo-scale content: 26 courses / 45 modules / 115 lessons; 42
  `university_applications`; 194 `well_logs` rows (tool leftovers).
  The table population splits into an LMS core (user/university/
  course/progress families) and engineering-tool families that orphan
  when the tools are deleted — the same ss_*/em_*/bf_* situation the
  Suite just cleaned up, to be inventoried at N2.
- **Demand signal**: the Suite's own `/nextgen` landing page collects
  interest into the **Suite** project's `nextgen_registrations` table
  — **24 registrations** — currently disconnected from the NextGen
  project entirely.

### 1.2 What the Suite brings

Eight oracle-validated, client-side engine directories exist today
(Seismolord, WellDataManager, PetrophysicsStudio, WellCorrelation,
MappingSurfaceStudio, RockPhysicsStudio, EarthModeling,
PorePressureStudio), each with committed goldens
(`test-data/<domain>/`), independent Python oracles
(`tools/validation/<domain>/`), and jest suites pinned to the goldens.
Every app also has an **in-memory backend** that runs the full
workstation with no auth/DB — the exact embedding NextGen lessons
need. Future Suite module rebuilds (Reservoir, Drilling, Production,
Economics, Facilities, Assurance) will produce more engine sets on the
same discipline; each becomes NextGen teaching material as its module
completes. **NextGen does not wait for Suite completion** — engines
ship to NextGen module-by-module.

## 2. Central engines repo — workability assessment

**Verdict: workable and cheap, with one deployment constraint that
dictates the consumption mechanism.**

- **Extraction cost is low.** A sweep of all eight `engine/` dirs
  found exactly ONE import that isn't relative-internal
  (`lib/waveform`). The engines package is therefore: the eight
  engine dirs + the shared math libs (`src/lib/waveform.js`,
  `src/lib/gridding/`) + their goldens (`test-data/<domain>/`) + jest
  suites + the Python oracles/genfixtures that regenerate the goldens.
  Registries (`wellsRegistry`, `surfacesRegistry`), backends and UI
  stay in the products — NextGen never touches Suite's data platform
  (separate Supabase projects, separate RLS worlds).
- **The constraint: Hostinger builds the Suite from a source zip**
  (`npm install && npm run build` on their infra). A private npm
  registry would need auth tokens in Hostinger's build env — fragile.
  Options:
  - **(a) Git-subtree vendoring (recommended).** `petrolord-engines`
    is the source of truth; Suite and NextGen each vendor it at
    `packages/engines/` via `git subtree pull`. Zero registry, zero
    build-env change — the vendored code is just files in the zip.
    Updates are an explicit, reviewable subtree pull per consumer.
    Costs: subtree pulls are a little ceremonial; both consumers must
    resist editing the vendored copy directly (edits go to the
    engines repo, PR'd, then pulled).
  - **(b) Public npm package** (`@petrolord/engines`). Cleanest
    dependency semantics; works with Hostinger since public installs
    need no auth. Note `petrolord-suite` is already a public repo, so
    a public package is not an IP regression — but it is a louder
    publication, and adds release/versioning ceremony (changesets,
    semver) for a small team.
  - **(c) Monorepo** (NextGen moves into petrolord-suite as a
    workspace). Rejected: restructuring the repo root risks the
    working Hostinger pipeline (which already once rejected a zip
    over a stray `.vite/` folder), and couples two products' release
    cadences.
- **Sequencing rule**: extract per the second-consumer principle —
  the whole geoscience engine set moves at N1 (NextGen is the second
  consumer), and each future Suite module's engines move at ITS
  close-out once NextGen consumes them. Goldens are the API contract:
  both consumers run the same golden-pinned jest suites, so drift in
  the shared code breaks visibly in both CIs.
- **Proof gate**: N1 is complete only when the SUITE builds and passes
  jest/e2e from the vendored package — the Suite itself becomes the
  first consumer of the central position before NextGen writes a line.

## 3. Target NextGen v1 (proposed — owner may reshape)

One product: **a petroleum-engineering teaching platform where every
lesson drives a real, validated engine** — the thing no LMS competitor
has. The LMS chassis (roles, universities, courses, quizzes,
certificates) frames the content; the content is interactive
engine-backed exercises with teaching datasets (the Suite's harness
philosophy: workstation + in-memory backend + seeded fixture), and
assessments that check the student's computed results against golden
answers — auto-gradable by construction.

v1 hard scope: ONE teaching module (Geoscience, on the shipped
engines) end-to-end through the existing LMS chassis, live with one
pilot cohort (the 24-registration interest list + the 42 university
applications are the seed funnel). Everything else (more modules,
marketplace, pricing tiers) sequences behind it.

## 4. Phases

- **N0 — Sign-off**: this document; decisions in §5 locked.
- **N1 — Central engines repo**: create `petrolord-engines`
  (engines + math libs + goldens + jest + Python oracles, CI running
  the golden suites); Suite consumes via the chosen mechanism (§5 Q1)
  and swaps imports; **gate: Suite jest 935+/build/e2e 51+ green from
  the central position**; MIGRATIONS.md-style log of what moved.
- **N2 — NextGen purge**: delete all ~15 engineering tools + their
  component trees (importer-closure discipline, G2.6 style); inventory
  the NextGen DB's 150 tables into LMS-core vs tool-orphan families;
  drop the orphans (owner-gated, dry-run-first — the Suite cleanup
  playbook, including the pentest-driver gotchas already learned).
- **N3 — LMS chassis audit**: G0-style honest audit of the surviving
  LMS (auth flows, the 326 policies, role model, course/quiz engine)
  ending in a REPAIR vs REBUILD recommendation with evidence — not
  assumed either way. Includes wiring the Suite-side
  `nextgen_registrations` funnel into NextGen onboarding.
- **N4 — Geoscience teaching module v1**: lesson framework that
  mounts engine-backed exercises (in-memory backends + teaching
  fixtures derived from the oracle goldens); auto-graded exercises
  checking computed results; one course shipped end-to-end
  (petrophysics or rock physics first — smallest engine surface,
  strongest closed-form answers).
- **N5+ — Module trains**: each completed Suite module rebuild ships
  its engines to `petrolord-engines` at close-out, and NextGen adds
  the corresponding teaching module. Suite close-out checklists gain
  an "engines handed to NextGen" line.

## 5. Open questions (owner)

- **Q1 — Consumption mechanism**: git-subtree vendoring
  (recommended, §2a — zero deploy-pipeline risk) vs public npm
  package (§2b) vs monorepo (§2c, not recommended).
- **Q2 — LMS chassis**: agree the N3 audit decides repair-vs-rebuild
  on evidence (recommended), or direct a rebuild now.
- **Q3 — NextGen DB cleanup timing**: drop tool-orphan tables during
  N2 (recommended, while the deletion context is fresh) vs defer.
- **Q4 — Canonical repo/remote**: `Petrolord/petrolord-nextgen` as
  canonical (recommended, matches the Suite's org) — the local
  checkout currently points at `iPeculia/petrolord-nextgen`.
- **Q5 — Deployment**: where does NextGen v1 go live (Hostinger like
  the Suite? which domain), and does it keep its own Supabase project
  (recommended: yes — student data never shares an RLS world with
  Suite customer data).
- **Q6 — First course**: Petrophysics (recommended — richest
  closed-form teaching anchors) vs Rock Physics vs owner's pick.

## 6. Non-goals (v1)

- No NextGen-side forks of engines, ever — fixes flow through
  `petrolord-engines`.
- No sharing of Suite registries/RLS/storage with NextGen; engines
  and teaching fixtures only.
- No new engineering tools built inside NextGen; if a teaching need
  exceeds an engine's surface, the engine grows in the central repo
  (benefiting the Suite too).
- No multi-module curriculum before N4 ships one module well.
