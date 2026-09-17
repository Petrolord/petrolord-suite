# Petrolord Assurance & Compliance Module — Roadmap

Status: **PROPOSED — awaiting owner sign-off on §7**
Scope: the entire Assurance & Compliance module
This file is the plan of record for the AS series. Per-app plans are
written per wave against this roadmap.

Origin: `docs/scope/NextGen-Remaining-Courses-PLAN.md` §9, decision of
2026-09-16 (Suite PR #497). That decision adopted two NextGen assurance
courses and then **deferred both of them behind this programme**, on the
grounds that Assurance is the only Suite module never rebuilt and a
course cannot be taught over a lab that invents its own data.

Audit date: **2026-09-16**, full code sweep of all eight routed app
trees plus a live catalogue and schema read of the production database.

---

## 1. The honest baseline

An assurance and compliance lead's daily loop is: **keep a risk register
that is scored the same way twice → run changes through a gated MOC →
hold documents under revision control with review dates that actually
fall due → run audits and carry the findings to closure → track
regulatory obligations against real permit expiries → review each
other's technical work before it is issued → capture what went wrong so
it is not repeated.** The commercial toolkit for that loop is Intelex,
Enablon, Sphera, Cority and ProcessMAP at the platform end, SAP QM and
Documentum/OpenText at the document end, and the ISO 9001 / 14001 /
45001 / 31000 canon underneath all of it. Most operators run it on
SharePoint and Excel.

Petrolord covers this loop with **eight routed apps**. The live tile
catalogue advertises **fourteen active ones**.

### 1.1 The catalogue does not describe the software

Read live from `master_apps` on 2026-09-16. The module has 33 rows, 14
of them `status='Active'` with `is_functional=true`.

| Live tile | Status in catalogue | What is actually behind it |
|---|---|---|
| Risk Register | Active | **Real.** `risk_register` via `useRiskRegister`, honest errors |
| Risk Heatmap | Active | **Real.** Redirects into the Risk Register heatmap tab |
| Regulatory Compliance | Active | **Reads real, writes impossible.** See the AS3 correction below |
| ISO Compliance Tool | Active | **Sellable, persists nothing.** `@/data/isoComplianceData` into `useState`. AS8 rebuilt it; see the STATUS doc |
| Audit Trail Manager | Active | **No code of any kind** |
| Charge/Seal/Trap Risk | Active | **No code of any kind** |
| Data Privacy Manager | Active | **No code of any kind** |
| Decision Tree Analyzer | Active | **No code of any kind** (the real one is Economics' Decision Tree Builder) |
| Environmental Compliance | Active | **No code of any kind** |
| Exploration Risk Analyzer | Active | **No code of any kind** |
| Monte Carlo Analyzer | Active | **No code of any kind** (the real one is ReservoirCalc Pro's `MonteCarloEngine.js`) |
| Prospect Ranking Tool | Active | **No code of any kind** |
| Safety Audit Manager | Active | **No code of any kind** |
| Security Analytics | Active | **No code of any kind** |
| Document Control | Coming Soon | **Built and routed** (six routes, entitlement-gated). AS4 rebuilt it; see the STATUS doc |
| Lesson Learned DB | Coming Soon | **Built and routed** |
| Management of Change | Coming Soon | **Built and routed** (six routes). AS6 rebuilt it; see the STATUS doc |
| Peer Review Manager | Coming Soon | **Built and routed** (five routes). AS5 rebuilt it; see the STATUS doc |
| Quality Assurance Plan | Coming Soon | **Built and routed**. AS7 rebuilt it; see the STATUS doc |

So the catalogue is wrong in both directions at once. **Ten of the
fourteen tiles a customer can buy have no page behind them**, and five
apps that do exist and are entitlement-gated are hidden behind a Coming
Soon badge, which means nobody can buy the ones that work. Module
pricing is computed from this catalogue
(`pricing_config.module_pricing`, see the suite pricing model), so the
Assurance module is currently priced on ten apps that do not exist.

This is the same class of defect Facilities F0 found in the Pipeline
Sizer — gated and sellable while returning fiction — except that here
there is not even a mock page to return it.

### 1.2 Three of the eight routed apps fail open into fiction

| App | LOC | Persistence | Verdict |
|---|---|---|---|
| Risk Register | 2,253 | `risk_register` + snapshots | **KEEP + HARDEN** (AS2) |
| Regulatory Compliance | 972 | 3 services, no create path | **KEEP + HARDEN** (AS3, done) |
| Peer Review Manager | 1,834 | **none** — every write went to a module-level array | **DE-FICTION** (AS5, done) |
| Document Control | 952 | `documents`, **mock fallback**, and a create path that reported success on failure | **DE-FICTION** (AS4, done) |
| Management of Change | 1,219 | **none** — every page a literal, and the create form had no state at all | **REBUILD** (AS6, done) |
| Quality Assurance Plan | 458 | **none** | **REBUILD** (AS7, done) |
| ISO Compliance | 795 | **none** — `useState` over a data file **that regenerated itself with `Math.random()` on every load** | **REBUILD** (AS8, done) |
| Lessons Learned | 752 | **none** | **REBUILD** (AS9) |

The fail-open pattern is worth stating exactly, because it is the worst
thing in the module and it is invisible in a demo:

```js
// src/services/DocumentControlService.js
if (total === 0) throw new Error("Empty DB");   // an empty org is treated as a failure
...
} catch (e) { return MOCK_DOCUMENTS; }          // and is shown invented documents
```

An organization with no documents of its own is not shown an empty
library. It is shown "Offshore Rig Evacuation Procedure", "Chemical
Handling Safety Policy" and "Subsea Manifold Schematic V2", owned by
"Sarah Jenkins" and "Mike Ross", as though they were its own controlled
documents. `getDocumentById` falls back to `MOCK_DOCUMENTS[0]`, so
asking for a document you do not have shows you a different document.

`PeerReviewService` is the same shape and worse in one respect:
`getDashboardStats()` **never queries the database at all**. Every KPI
on the Peer Review dashboard — active reviews, overdue reviews, open
comments, critical comments, the stage distribution chart — is computed
from a module-level `localReviews` array seeded from `MOCK_REVIEWS`. A
customer's peer review dashboard is a picture of somebody else's
invented project, permanently.

`assurance/moc/Register.jsx` filters five hardcoded records as though
they were a register. ISO Compliance holds `@/data/isoComplianceData` in
`useState`; nothing a user does there survives a reload.


### 1.2a AS3 correction: this audit was too kind to Regulatory Compliance

Recorded here rather than quietly edited above, because the way the
audit got it wrong is itself a lesson for AS4 to AS10.

AS0 called Regulatory Compliance "Real. Three Supabase services, honest
errors" and counted it as one of the three working apps in the module.
The services are real and the errors are honest. **But the audit read
the services, not what a user can do**, and on that measure the app was
close to unusable:

- **No obligation could be created by anyone.** The create page was a
  dashed box reading "New compliance creation form will be implemented
  here", and the Add Obligation button in the app header navigated to
  it. `addRecord()` and `addRegulator()` had no callers anywhere.
- The detail page was a second dashed box, so rows opened onto nothing.
- Twelve controls toasted "This feature isn't implemented yet... you can
  request it in your next prompt", naming the prompt builder to paying
  customers.
- The Reports page drew every organization's "Obligations by Authority"
  from a hardcoded EPA/BSEE/OSHA array, and its second panel rendered
  "Matrix visualization loading..." forever.
- The dashboard's trend chart was arithmetic on the current total across
  six hardcoded month names.

**The lesson for the remaining waves: a service-level read is not an
audit.** Trace a create path from the button to the database before
calling an app real. AS4 and AS5 are already known to fail open into
fiction; AS6 to AS9 should be assumed to have create paths that do not
exist until one is followed end to end.

### 1.3 The module has no tests and no engine

Zero test files under any assurance path. The two files that match the
word are `flowAssuranceContext` and `flowAssurance`, which are
Production. There is no `engines/assurance` in petrolord-engines, so a
NextGen capstone has nothing to be graded against — which is precisely
why §9 of the courses plan deferred the courses behind this programme.

### 1.4 SECURITY: the assurance schema has row level security disabled

Read live on 2026-09-16 from `pg_class.relrowsecurity` and
`information_schema.role_table_grants`.

**Twenty-three assurance tables have RLS disabled and carry
`SELECT, INSERT, UPDATE, DELETE, TRUNCATE` grants to both `anon` and
`authenticated`:**

`compliance_audits`, `compliance_frameworks`, `compliance_requirements`,
`doc_activity_log`, `doc_categories`, `doc_comments`, `doc_distribution`,
`doc_revisions`, `doc_workflows`, `moc_actions`, `moc_activity_log`,
`moc_approvals`, `moc_comments`, `moc_impacts`, `moc_reviews`,
`risk_actions`, `risk_activity_log`, `risk_attachments`, `risk_comments`,
`risk_links`, `risk_register_snapshots`, `risk_reviews`, `risk_tags`.

The parent tables (`risk_register`, `documents`, `moc_records`,
`peer_reviews`) do have RLS. Their children do not. Since the child rows
carry the actual content — every risk comment, every MOC approval
decision, every document revision and its file URL, every audit trail
entry — the protection on the parent is decorative. `anon` is the role
behind the publishable key that ships inside the production SPA bundle.

These tables are empty today, which is the only reason this is a defect
and not an incident. **They become an incident the moment the module is
used**, which is what this programme is for. AS1 closes them before any
other work lands.

### 1.5 SECURITY: the same hole is platform-wide, and that part is NOT in scope here

The audit query above was re-run without the assurance filter.
**121 tables in the public schema have RLS disabled and full
`SELECT/INSERT/UPDATE/DELETE` granted to `anon`.** Almost all are empty
legacy Horizons tables, but four are not, and some of the empty ones are
load-bearing:

| Table | Rows | Why it matters |
|---|---|---|
| `organization_apps` | 9 | **The org entitlement table.** `SupabaseAuthContext` reads it to decide who may open which app. It is `anon`-writable |
| `pricing_config` | 6 | The server-authoritative module pricing. It is `anon`-writable |
| `quotes` | 6 | Real customer quotes, with `organization_id` and `user_id`. `anon`-readable |
| `modules` | 9 | The module catalogue behind the quote builder |
| `purchased_apps`, `subscription_modules` | 0 | Purchase records |
| `api_keys`, `access_credentials`, `studio_access_tokens` | 0 | Named for secrets; referenced by no code at all |

Anyone holding the publishable key — which is in the production
bundle — can read every stored quote, and can insert a row into
`organization_apps` granting any organization any app. That is a
monetization bypass, not only a data exposure.

**This is outside the Assurance rebuild and is not fixed by it.** It is
called out here because this audit is where it surfaced. AS1 ships the
assurance half. A second, separately reviewable migration for the
commerce and credential tables is prepared alongside it and is described
in §5; it is deliberately kept apart so it can be applied first and
reviewed on its own terms. The remaining ~90 empty legacy tables want a
sweep of their own and are listed in the AS1 wave notes rather than
fixed blind, because enabling RLS on a table another module is quietly
using breaks that module.

One verification was attempted and **not** completed: impersonating the
`anon` role in SQL (`set local role anon`) to demonstrate readability
end to end. The auto-mode classifier blocked it as a production read.
The finding rests on the catalogue evidence — RLS off plus the grant —
which is conclusive at the schema level.

### 1.6 Documentation

`docs/scope/AssuranceApps-STATUS.md` did not describe Assurance. Its
contents were the Economics E4 status for PM Pro, AFE and Report
Autopilot, and the Assurance module had no status document at all.
Fixed at AS1: that content moved to
`docs/scope/ProjectManagementAfeReportAutopilot-STATUS.md` (with the two
`Economics-ROADMAP.md` references re-pointed) and `AssuranceApps-STATUS.md`
now describes this module.

---

## 2. What we build on (reuse, never rebuild)

| Asset | Where | Feeds |
|---|---|---|
| Studio kit + `saved_*_projects` convention | `src/components/studio/` | Every app shell |
| Chart standard: white `chartTheme` + 40px `ChartLogo` | `src/lib/chartTheme` | Every chart; the module's charts are currently ad-hoc dark Recharts, against the standing rule |
| RLS helpers | `public.my_org_id()`, `public.is_super_admin()` (`20260713300000_membership_consolidation.sql`) | Every policy written in AS1 |
| Membership | `organization_members` is THE membership table | Ownership, approvers, reviewer rosters |
| Honest-catalogue precedent | `20260827220000_p0_production_honest_catalog.sql`, `20260829500000_f0_facilities_honest_catalog.sql` | AS1's catalogue migration |
| Monte Carlo | ReservoirCalc Pro `MonteCarloEngine.js` (canonical, per ReservoirEngineering-Module §5) | Quantitative risk aggregation in AS2. **No new MC implementation** |
| Decision trees / VOI | Economics `engines/economics/voi.js`, Decision Tree Builder | Nothing is rebuilt here; the Assurance tiles that duplicate them are retired at AS1 |
| Export utilities | `src/utils/exportUtils.js` | Register exports |
| Project portability | `.pld` registries | Out of scope for AS; revisit after AS11 |

---

## 3. The locked roster

Eight apps, down from a catalogue of fourteen active and thirty-three
listed. Every removal is named and justified.

| # | App | Industry counterpart | Scope |
|---|---|---|---|
| 1 | Risk Register & Heatmap | Enablon / Intelex risk module | The module flagship. ISO 31000 scoring, 5x5 matrix with a single scoring authority, inherent vs residual, appetite bands, mitigation actions to closure, KRIs, review dates that fall due, snapshots and trend |
| 2 | Regulatory Compliance | Enablon / Cority obligations | Obligation register against regulator, permit and licence expiries, evidence, jurisdictional regimes. **Environmental Compliance folds in here as a regime category**, not as a separate thin app |
| 3 | Document Control | Documentum / SAP DMS | Controlled documents, revision chain, review-due calculus, approval workflow, distribution and acknowledgement, confidentiality |
| 4 | Peer Review Manager | technical assurance / DRB practice | Review stages, comment severity and disposition, verification, the audit trail |
| 5 | Management of Change | Sphera / ProcessMAP MOC | Change request, impact assessment, multi-level approval gate, temporary change expiry, action closure before implementation |
| 6 | Quality Assurance Plan & NCR | SAP QM | ITP and quality plan, inspection points, non-conformance reports to closure |
| 7 | ISO Compliance | ISO 9001/14001/45001 internal audit | Clause coverage, internal audit programme, findings register, certification readiness |
| 8 | Lessons Learned | operator lessons databases | Capture, categorise, search, and — the part that makes it worth building — push a lesson into the register or the MOC it applies to |
| 9 | Audit & Findings Manager | Intelex audit module | **New app, consolidating Safety Audit Manager and Audit Trail Manager**, both currently sold and both empty. Audit programme, checklist execution, finding severity and ageing, CAPA to closure |

Retired from the catalogue at AS1, with reasons:

- **Monte Carlo Analyzer**, **Decision Tree Analyzer** — duplicates of
  ReservoirCalc Pro and the Economics decision apps. Rebuilding them here
  would also create the cross-course answer leakage the academy rules
  exist to prevent. Retired; the tiles point at the real apps.
- **Charge/Seal/Trap Risk**, **Exploration Risk Analyzer**, **Prospect
  Ranking Tool** — exploration risk is geoscience material. Moved to the
  Geoscience catalogue as Coming Soon, matching the §9 decision that
  makes exploration risk an eleventh geoscience course.
- **Data Privacy Manager**, **Security Analytics** — platform
  administration, not petroleum engineering. They belong in operator
  documentation and in the existing org-data-export and DPA work, not in
  a sellable app tile. Retired.
- The fourteen `Coming Soon` rows that no wave claims (Business
  Continuity, Permit to Work, Training Tracker and the rest) are left as
  Coming Soon. They are honest as they stand: nobody can buy them.

---

## 4. Wave plan

Each wave is a branch, a PR, and a commit per completed sub-task, per the
repo conventions. Every wave ends with the relevant STATUS doc updated.

| Wave | Title | Gate |
|---|---|---|
| **AS0** | This roadmap | DONE 2026-09-16 (PR #500) |
| **AS1** | Foundations: honest catalogue, RLS and grants, schema in code, STATUS doc | **BUILT 2026-09-16**, migrations held for the owner |
| **AS2** | Risk Register & Heatmap: scoring authority, residual risk, actions, tests | needs AS1 |
| **AS3** | Regulatory Compliance: obligations, expiries, environmental regimes | **BUILT 2026-09-17**, migration held |
| **AS4** | Document Control: de-fiction, real revision chain, review-due | **BUILT 2026-09-17**, migration held |
| **AS5** | Peer Review Manager: de-fiction, real stats, comment disposition | **BUILT 2026-09-17**, migration held |
| **AS6** | Management of Change: real persistence on `moc_records`, approval gate | **BUILT 2026-09-17**, migration held |
| **AS7** | Quality Assurance Plan & NCR | **BUILT 2026-09-17**, migration held |
| **AS8** | ISO Compliance: real persistence, audit programme, findings | **BUILT 2026-09-17**, migration held |
| **AS9** | Lessons Learned, and the push into register and MOC | needs AS2, AS6 |
| **AS10** | Audit & Findings Manager (new) | needs AS1 |
| **AS11** | The Assurance hub: real cross-app analytics over all nine apps | needs AS2-AS10 |
| **AS12** | `engines/assurance` extraction with goldens and an independent oracle | needs AS2, AS10 |
| **AS13** | Help guides, user manual, launch | needs all |

The two NextGen assurance courses unlock at AS12, not before. That is
the whole point of the §9 deferral: the capstone needs an engine with an
oracle behind it.

### 4.1 AS1 in detail, because everything is gated on it

1. **Honest catalogue migration.** Ten phantom Active tiles demoted or
   retired per §3; the five built-but-hidden apps left at Coming Soon
   until their own wave promotes them; ISO Compliance Tool demoted from
   Active because it persists nothing. The result is a module that
   advertises **three** working apps, which is the true number. Each
   later wave carries its own one-line promotion migration, held.
2. **RLS and grants on the twenty-three assurance tables.** Enable RLS,
   revoke `anon` entirely, scope `authenticated` through the parent's
   `org_id` via `public.my_org_id()`. Parents carry `org_id`; children
   carry only a parent key, so each child policy is an `exists` against
   its parent.
3. **Schema in code.** The assurance DDL exists only in the live
   database. Backfill it into repo migrations, on the precedent of the
   `rb_*` backfill, so the module can be rebuilt from the repo.
4. **`AssuranceApps-STATUS.md`** rewritten to describe Assurance; the
   Economics E4 content it held moved to
   `ProjectManagementAfeReportAutopilot-STATUS.md`.
5. **The commerce and credential migration** of §5, prepared as a
   separate file so it can be applied and reviewed first.

---

## 5. The commerce and credential migration (prepared, not applied)

Separate from the assurance work and separately reviewable:

- `pricing_config` — no client code reads it; only `generate-quote` and
  `hse-checkout`, both service role. Revoke `anon` and `authenticated`,
  enable RLS, no policy.
- `organization_apps` — read client-side by authenticated users for
  their own org, written only by `provision-quote`. Enable RLS, revoke
  `anon`, `SELECT` for members via `my_org_id()`, writes service role
  only.
- `quotes` — read by `QuoteDashboard` for the owning org, written by
  edge functions. Enable RLS, revoke `anon`, org-scoped `SELECT`.
- `modules` — the public module catalogue. Enable RLS, `SELECT` to
  `authenticated`, revoke writes from both roles.
- `purchased_apps` — note in passing: it is **inserted from the browser**
  by `src/utils/paymentVerificationLogic.js`. That is a second
  monetization concern and is recorded, not fixed, here.
- `api_keys`, `access_credentials`, `studio_access_tokens`,
  `subscription_modules`, `user_points_summary` — referenced by no code.
  Enable RLS with no policy and revoke both roles.

Per the database conventions, `organization_apps` and `quotes` touch
shared tables and **require a second engineer's review before apply**.

---

## 6. Standing rules for this module

- **No fail-open fallbacks, anywhere.** An empty result is an empty
  result. A failed query is an error the user can see. No service in
  this module may return invented rows. This rule is what the module is
  being rebuilt for, and a wave is not done while a `MOCK_` constant is
  reachable from a render path.
- **One scoring authority.** Risk score, rating band and appetite status
  are computed in exactly one module and imported everywhere, including
  by the hub. Two places that both know the 5x5 matrix is the defect
  this module is most likely to grow.
- Charts use the white `chartTheme` with the 40px `ChartLogo`
  watermark. The module's current dark ad-hoc Recharts are replaced as
  each wave touches its app.
- Every register writes `org_id` from `my_org_id()` and never from a
  client-supplied value. The HSE `teamService` write-by-`user_id` bug is
  the precedent.
- Product-prefixed tables for anything new. The existing `documents`,
  `risks` and `actions` names are unprefixed and predate the convention;
  they are not renamed under this programme, but nothing new joins them.

---

## 7. Open questions for the owner

1. **The catalogue correction is customer-visible.** Ten tiles that say
   Active today will say Coming Soon or disappear. If any organization
   has already been sold the Assurance module on that count, the price
   needs revisiting alongside the migration. Proceed on the honest
   catalogue?
2. **Roster of nine**, with Environmental Compliance folded into
   Regulatory Compliance and Safety Audit + Audit Trail consolidated
   into one Audit & Findings Manager? Or one app per retired tile?
3. **The commerce and credential migration** of §5 touches shared
   tables and needs a second engineer. Who reviews, and does it go
   before AS1?
4. **The ~90 remaining empty legacy tables** with RLS off: sweep them in
   one migration under this programme, or raise a separate platform
   hygiene item?
5. **Data Privacy Manager and Security Analytics** retired from the
   sellable catalogue as proposed, or kept as operator-only features
   reachable from the admin console?

Until these are answered, AS1 proceeds on the recommendation in each
case, per the standing autonomous directive, and every decision taken is
recorded in the wave notes.

---

## 8. Non-goals

- No new Monte Carlo and no new decision tree implementation. The
  canonical modules are imported or the tile is retired.
- Assurance does not rebuild HSE. `petrolord-hse` is a separate product
  with its own incident, training and audit surfaces.
- The exploration risk apps are not built here. They move to Geoscience.
- The platform-wide RLS sweep of §1.5 beyond the commerce tables is
  named, not undertaken.
