# Assurance & Compliance module — status

Plan of record: `docs/scope/Assurance-ROADMAP.md`.
Wave: **AS1 (foundations) and AS2 (Risk Register), BUILT 2026-09-16**,
migrations held.

This file replaces a document that carried the same name and described
the Economics E4 apps. That content now lives at
`docs/scope/ProjectManagementAfeReportAutopilot-STATUS.md`. The Assurance
module had no status document at all before this one.

---

## 1. Where the module actually stands

Assurance is the only Suite module that was never rebuilt. Geoscience
(G0-G8), Reservoir (R0-R5), Drilling, Production, Facilities (F0-F12),
Economics (E0-E5) and Midstream & Downstream (DS0-DS10) all got
programmes. This one is still in its Horizons-generated state.

| App | Route | Persists | State after AS1 | Wave |
|---|---|---|---|---|
| Risk Register | `apps/assurance/risk-register` | `risk_register`, `risk_tags`, `risk_links`, snapshots | **Active.** AS2 done | AS2 |
| Risk Heatmap | redirect into the register | via the register | **Active.** AS2 done | AS2 |
| Regulatory Compliance | `apps/assurance/regulatory-compliance/*` | 3 services | **Active.** Real, honest errors | AS3 |
| ISO Compliance | `apps/assurance/iso-compliance/*` | nothing | **Demoted to Coming Soon.** `@/data/isoComplianceData` in `useState` | AS8 |
| Document Control | `apps/assurance/document-control/*` | `documents`, mock fallback | Coming Soon | AS4 |
| Peer Review Manager | `apps/assurance/peer-review-manager/*` | `peer_reviews`, mock fallback | Coming Soon | AS5 |
| Management of Change | `apps/assurance/management-of-change/*` | nothing | Coming Soon | AS6 |
| Quality Assurance Plan | `apps/assurance/qa-plan/*` | nothing | Coming Soon | AS7 |
| Audit & Findings Manager | not built | - | New app | AS10 |

Tests: **none**, under any assurance path. Engine: **none**; there is no
`engines/assurance` in petrolord-engines. Both are why the two NextGen
assurance courses are deferred to AS12.

---

## 2. AS1, built 2026-09-16

Four migrations and two penetration tests. **Nothing is applied.**
Production applies are owner-run.

### 2.1 The catalogue was wrong in both directions

`master_apps` held 33 Assurance rows, 14 `Active` with
`is_functional = true`. **Ten of those fourteen had no page, no route and
no code at all**: Audit Trail Manager, Safety Audit Manager,
Environmental Compliance, Monte Carlo Analyzer, Decision Tree Analyzer,
Charge/Seal/Trap Risk, Exploration Risk Analyzer, Prospect Ranking Tool,
Data Privacy Manager and Security Analytics. A customer could buy all
ten, and module price is computed from this catalogue
(`pricing_config.module_pricing`).

At the same time five apps that are built, routed and entitlement-gated
sat behind a Coming Soon badge, so nobody could buy the ones that work.

`20260916100000_as1_assurance_honest_catalog.sql` archives the ten
phantoms and the fourteen zero-code Coming Soon stubs, demotes ISO
Compliance (real code, zero persistence), and leaves the five built apps
at Coming Soon for their own waves to promote.

Post-state, verified on a scratch rebuild: **3 Active, 6 Coming Soon,
24 Archived**. The three Active tiles are the three apps that are real
and persist honestly.

### 2.2 The assurance schema had RLS disabled

Read live from `pg_class.relrowsecurity` and
`information_schema.role_table_grants`: **twenty-three Assurance tables
had RLS disabled with `SELECT, INSERT, UPDATE, DELETE, TRUNCATE` granted
to both `anon` and `authenticated`**.

The four parent registers had RLS. Their children did not, and the
children are where the content lives: every risk comment, every MOC
approval decision, every document revision and its `file_url`, every
audit trail row. `anon` is the role behind the publishable key that
ships in the production bundle.

The tables are empty today. That is the only reason this is a defect and
not an incident, and it stops being true the moment the module is used.

`20260916101000_as1_assurance_rls.sql` revokes `anon` on all
twenty-three plus the nine already-protected parents, enables RLS, and
scopes each child through its parent's `org_id` via `public.my_org_id()`.

### 2.3 The schema existed only in the live database

No migration in this repo created any Assurance table, so the module
could not be rebuilt from source and its RLS posture was unauditable
without reading production.
`20260916099000_as1_assurance_schema_backfill.sql` backfills 33 tables,
101 constraints and 5 indexes, on the `rb_*` precedent.

Two things it records rather than fixes:

- `risk_register.risk_score` is a **stored generated column**,
  `(likelihood * impact)`, so the score tracks edits. `rating` beside it
  is an ordinary text column written by whichever client touched the row
  last, so the band can disagree with the score it describes. AS2 gives
  rating one computed authority.
- `documents`, `risks` and `actions` are unprefixed names predating the
  product-prefix convention. Not renamed; nothing new joins them.

### 2.4 The same hole is platform-wide

Re-run without the Assurance filter: **121 public tables have RLS
disabled and full CRUD granted to `anon`**. Almost all are empty legacy
tables. These are not:

- `organization_apps` (9 rows), the org entitlement table that
  `SupabaseAuthContext` reads to decide who may open which app. Anyone
  holding the publishable key could insert a row granting any
  organization any app. That is a monetization bypass.
- `pricing_config` (6 rows), the server-authoritative module pricing,
  writable the same way.
- `quotes` (6 rows), real customer quotes with `organization_id` and
  `user_id`.
- `api_keys`, `access_credentials`, `studio_access_tokens`: empty, named
  for secrets, referenced by no code in the repo.

`20260916103000_commerce_and_credential_rls.sql` closes those, shaped by
what actually reads each table so nothing breaks. It is a separate file
because it is not Assurance work and should be reviewed and applied on
its own terms. **`organization_apps` and `quotes` are shared tables and
need a second engineer's review before apply.**

The remaining ~90 empty legacy tables are named, not swept. Enabling RLS
on a table another module is quietly using breaks that module.

---

## 3. AS2, built 2026-09-16

The Risk Register was the honest app in the module. It was still broken
in ways nobody could have seen from a demo.

### 3.1 It could not create a risk at all

`RiskForm` collects `tags` and `linked_risks`. `NewRiskPage` passed the
whole form object into an insert on `risk_register`. Neither is a column
there, and PostgREST refuses an insert naming a column it does not know,
so every create from the UI failed with "Could not find the 'tags'
column of 'risk_register' in the schema cache". The four rows in the
live register are RSK-1001 to RSK-1004: seeded, not created through the
form.

`risk_tags` and `risk_links` are their real homes and had never been
written to. `utils/riskPayload.js` splits a form payload into the three
writes that exist, and its test pins the writable column list against
the schema read out of the AS1 backfill migration rather than restating
it. A linked code that matches no risk is reported rather than dropped.

### 3.2 Four scoring authorities that disagreed

| Where | What it said |
|---|---|
| `utils/riskScoring.js` | `>= 15 / >= 10 / >= 5` |
| `RiskHeatmapMatrix` | the same thresholds written again, in the file that imports the first one, with the imported helper left unused |
| `RiskRegisterTablePage` | `> 15`, so a 3x5 risk was the one score in the matrix the table painted green and everything else painted red |
| `useAssuranceAnalytics` | `r.rating || (a fourth copy)`, preferring a stored text column the register never wrote |

`src/lib/riskScoring.js` is the only one now, on the
`percentileConventions` precedent. It also refuses a level off the 1-5
scale rather than multiplying it: the old `Number(x) || 0` scored a 9x9
as 81, which falls in no band.

`rating` is written from it on every save, so the stored band cannot
disagree with the stored score.

### 3.3 Risk codes collided by construction

Codes were `RSK-${Math.floor(Math.random() * 10000)}` with no unique
constraint anywhere. By the birthday bound two risks share a code at
about 118 risks, silently, and people cite risk codes in audits.
Migration 20260916110000 adds a unique index per organization and
`next_risk_code()`, which issues codes in sequence under an advisory
lock and raises 42501 for a caller outside the organization.

### 3.4 Every number described the world before any control

The register scored inherent risk only, so the dashboard's "critical
risks", the heatmap and every count described risk before mitigation.
`residual_score` is generated and falls back PER AXIS, because
mitigation that cuts likelihood but not impact must not silently reset
impact to 1. `target_score` gives `appetite_status` a meaning (it was a
free text column, null on every row, that nothing wrote and nothing
defined), and a risk with no target reads "Not set" rather than
reporting a pass. `next_review_date` moved onto the register, so a risk
that has never been reviewed can still be overdue.

### 3.5 Three invented sections and a false confirmation

`RiskDetailPage` rendered, as literals, on every risk in every
organization: two tag badges reading "Drilling" and "High Priority"; one
linked risk reading "RSK-1002 (Dependency)"; and a "Scoring History"
that restated the current score as a creation event and reported
"Pending mitigation validation" whether or not a residual assessment
existed.

`SnapshotManager` was worse than a stub: "Capture Current State" toasted
"Snapshot Saved: Current risk register state has been captured" and
wrote nothing, above an invented "Q2 2026 Summary, 42 Risks". That is
the PM Pro "Connected" badge defect again, and the whole point of a
snapshot is that someone can go back to it at a board review. Snapshots
are rows now, with export and delete. Compare is removed rather than
left as a toast.

Edit was a "not implemented" toast. `EditRiskPage` reuses `RiskForm`,
loads the risk's real tags and links, and is routed at `:id/edit`.

A failed status change did nothing at all, so a status that did not save
looked exactly like one that did.

### 3.6 Verification

173 tests, from none. Two of the suites are guards rather than unit
tests, because unit tests would have passed happily while the table page
painted a 15 green:

- `riskScoring.test.js` fails if a fifth copy of the thresholds appears.
- `noInventedData.test.js` is the module's standing rule as a test: no
  `MOCK_` constants, no empty-result fallbacks, no hardcoded risk codes
  or tags in rendered literals, no "not implemented" toasts, load
  failures surfaced. It is the template AS4 to AS10 will need.

Both scan code with comments stripped, so neither can be satisfied by a
comment or fooled by one, and both were verified to fail when the defect
is put back.

Migration 20260916110000 was applied to a scratch PostgreSQL 15:
residual follows a per-axis edit and tracks an inherent edit, the checks
refuse an off-scale level, the unique index refuses a duplicate code
inside an organization and allows the same code in another, and
`next_risk_code` raises 42501 for a non-member.

### 3.7 AS1b: three tables the AS1 sweep missed

Found while auditing Regulatory Compliance for AS3. AS1 audited
everything matching `^(risk_|moc_|doc_|compliance_)`. Three tables the
module actually uses do not match that pattern and kept their full
`anon` CRUD grants: `regulatory_obligations` (the obligation register
behind the one genuinely working compliance app),
`regulatory_authorities`, and `audit_logs` (the platform audit trail,
written by `SupabaseService` and the admin console).

All three do have RLS with policies, so this was not an open door. It is
the same belt-and-braces AS1 applied to the parent registers: their
policies are written `FOR ROLE public`, so `anon` is held out only by
`auth.uid()` being null inside the predicate.
`20260916130000_as1b_regulatory_audit_anon_grants.sql` takes the grant
away. The lesson is that a regex-scoped audit is only as good as its
regex, and the AS3+ waves re-run the sweep by what the code reads rather
than by name.

**Also found: there are no `iso_*`, `qa_*`, `ncr*`, `lesson*` or
`finding*` tables in the database at all.** ISO Compliance, Quality
Assurance Plan and Lessons Learned do not merely fail to persist; they
have nowhere to persist to. Their waves create schema rather than wiring
up an app, which makes them larger than AS4 and AS5.

### 3.8 Left for later, deliberately

- The module's charts are still ad-hoc dark Recharts. The standing chart
  rule (white `chartTheme` plus the 40px `ChartLogo`) is applied in the
  AS11 hub wave, so every screen changes at once rather than a third of
  them changing now.
- `risk_actions` and `risk_mitigation_actions` are still unused. Actions
  to closure are the second half of the register and land with the
  Audit and Findings work at AS10, which needs the same CAPA shape.
- `risk_kris` is unused.
- There is no scoring history table, so the mitigation card shows the
  distance between inherent and residual rather than a timeline. A real
  history wants `risk_activity_log`, which nothing writes yet.

---

## 4. How AS1 was verified

No production write was made. Everything below ran on a scratch
PostgreSQL 15 instance.

1. The schema backfill rebuilt all 33 tables from nothing but itself
   plus `organizations`, `users`, `auth.users` and the two RLS helpers.
2. The catalogue and RLS migrations applied on top; re-applying all
   three on the rebuilt database is a clean no-op.
3. `tools/validation/assurance/rls-pentest-as1.sql`, seven behavioural
   blocks, all green: `anon` denied on read and on write; org isolation
   on a child of `risk_register` (own 1, other 0, update 0, delete 0);
   a cross-tenant child insert refused by the `WITH CHECK` half; the
   two-level `doc_workflows` path scoped correctly, with each org seeing
   only its own revision `file_url`; MOC approvals scoped; a
   cross-org `risk_links` row invisible to both ends.
4. `tools/validation/assurance/rls-pentest-commerce.sql`, eight blocks,
   all green, including the three client reads that must keep working.
5. **Negative controls were run for both**, because a gate that cannot
   fail proves nothing. Against the tables in their production posture:
   `anon` read both organizations' private risk comments and
   successfully inserted a row; `anon` read every entitlement and every
   quote, rewrote `pricing_config`, and granted an organization an app.

Two checks could **not** be completed. Impersonating the `anon` role
against production (`set local role anon`) and reading `pg_policies`
bodies were blocked by the auto-mode classifier as production reads. The
findings rest on the catalogue evidence, which is conclusive at the
schema level, and on the scratch reproduction.

---

## 5. Open

- **All six migrations are unapplied.** Ordered apply script:
  `tools/validation/assurance/as1-apply.sh`. Owner-run.
- The commerce migration needs a second engineer (shared tables).
- Five owner questions in `Assurance-ROADMAP.md` §7. AS1 proceeded on
  the recommendation in each case per the standing autonomous directive;
  each decision taken is recorded in the migration headers.
- `purchased_apps` is **inserted from the browser** by
  `src/utils/paymentVerificationLogic.js`. Recorded, not fixed.
- The ~90 remaining RLS-off legacy tables.
- `npm run build` currently fails in this environment at the PWA
  service-worker step with "Unable to write the service worker file.
  'crypto is not defined'". The Rollup bundle itself completes and
  writes every asset; the failure is inside workbox-build after
  bundling. It is not caused by the AS work, which touches no build
  config, and the repo already carries a fix for the same error
  (6e970c8b9, whose polyfill is present). A clean control build on
  unmodified main could not be completed here, because a git worktree
  cannot resolve this repo's node_modules. **It blocks cutting a
  production zip and wants its own look.**
- AS3 onward: the rest of the apps. The first rule of the programme is
  that no service in this module may return invented rows.
