# Assurance & Compliance module — status

Plan of record: `docs/scope/Assurance-ROADMAP.md`.
Wave: **AS1 (foundations) and AS2 (Risk Register) BUILT 2026-09-16;
AS3 (Regulatory Compliance), AS4 (Document Control), AS5 (Peer Review
Manager) and AS6 (Management of Change) BUILT 2026-09-17**, migrations
held.

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
| Regulatory Compliance | `apps/assurance/regulatory-compliance/*` | `regulatory_obligations`, `regulatory_authorities`, `regulatory_evidence` | **Active.** AS3 done | AS3 |
| ISO Compliance | `apps/assurance/iso-compliance/*` | `iso_standards`, `iso_clauses`, `iso_audits`, `iso_audit_clauses`, `iso_findings`, `iso_actions`, `iso_activity_log` | **AS8 done.** Coming Soon until its own promotion migration | AS8 |
| Document Control | `apps/assurance/document-control/*` | `documents`, `doc_revisions`, `doc_workflows`, `doc_activity_log`, `doc_categories` | **AS4 done.** Coming Soon until its own promotion migration | AS4 |
| Peer Review Manager | `apps/assurance/peer-review-manager/*` | `peer_reviews`, `peer_review_comments`, `peer_review_audit`, `peer_review_participants` | **AS5 done.** Coming Soon until its own promotion migration | AS5 |
| Management of Change | `apps/assurance/management-of-change/*` | `moc_records`, `moc_approvals`, `moc_actions`, `moc_impacts`, `moc_activity_log` | **AS6 done.** Coming Soon until its own promotion migration | AS6 |
| Quality Assurance Plan & NCR | `apps/assurance/qa-plan/*` | `qa_plans`, `qa_checkpoints`, `qa_ncrs`, `qa_capas`, `qa_activity_log` | **AS7 done.** Coming Soon until its own promotion migration | AS7 |
| Lessons Learned | `apps/assurance/lessons-learned/*` | `lesson_records`, `lesson_applications`, `lesson_activity_log` | **AS9 done.** Coming Soon until its own promotion migration | AS9 |
| Audit & Findings Manager | `apps/assurance/audit-manager/*` | `audit_programmes`, `audit_templates`, `audit_template_items`, `audit_records`, `audit_responses`, `audit_findings`, `audit_actions`, `audit_activity_log` | **AS10 done.** New app; its tile is seeded Coming Soon | AS10 |

Tests: **568** as of AS10 (AS2 34, AS3 63, AS4 45, AS5 52, AS6 58, AS7 79,
AS8 93, AS9 63, AS10 69, plus the shared authority suites), all under
`src/lib/__tests__/` and the two app trees. There were none at all
before AS2. Engine: **none**; there is no `engines/assurance` in
petrolord-engines, which is why the two NextGen assurance courses are
deferred to AS12.

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

## 3b. AS3, built 2026-09-17 — Regulatory Compliance

### 3b.1 The roadmap was too kind to this app

AS0 audited it as "Real. Three Supabase services, honest errors" and
listed it as one of the three genuinely working apps in the module. The
reads are honest. Almost nothing else was, and the audit had looked at
the services rather than at what a user can do.

**Nobody could create an obligation.** `NewCompliance.jsx` was a dashed
box reading "New compliance creation form will be implemented here", and
the Add Obligation button in the app header navigated to it.
`addRecord()` and `addRegulator()` were written in the services and no
UI ever called either one. `ComplianceDetail.jsx` was a second dashed
box, so clicking a row went nowhere, and the dashboard's deadline list
linked to `register?id=...`, a query string nothing read. Delete worked.
So the only thing a user could do to their own compliance register from
this app was destroy a row.

This is the same shape as AS2's finding on the risk register, one step
further along: there the form existed and wrote columns that did not,
so every create failed at the database; here the form did not exist.

**Twelve controls answered a click with** "🚧 This feature isn't
implemented yet, but don't worry! You can request it in your next
prompt! 🚀" — Filters, Export, Add Record, Edit, the row title, Add
Regulator, the website link, Print All, Export PDF and the two report
download buttons. That string names the prompt builder the app was
generated in, and it shipped to paying customers.

**The Reports page was fiction.** "Obligations by Authority" was a
module-level constant: EPA 45, BSEE 32, OSHA 28, State Dept 15, Local
Auth 22. Every organization that opened the page saw the same 142
obligations against four American regulators, whatever was in its own
register, with nothing on the page saying so. It is the worst thing in
the app, because a compliance report is a document people act on.
Beside it, "Compliance Readiness Matrix" rendered the words "Matrix
visualization loading..." in a dashed box. It was not loading. There
was no matrix.

**The dashboard invented a trend.** The "Obligations Trend" area chart
was `[total-10, total-7, total-5, total-2, total, total]` plotted
against six hardcoded month names with no relation to today: a picture
of a register growing steadily over six months, for a register that had
never been measured over time. "Recent Activity" printed "Record
&lt;title&gt; was updated" for the first four rows whether or not
anything had been updated.

**The app chose its own organization.**
`compliancePermissionsService.checkAccess()` queried
`organization_members` directly and took the first active row by
`joined_at`. That is a second membership authority beside the Suite's
own (`organization_members` is THE membership table, read through the
auth context), so anyone belonging to more than one organization could
be shown a different org's obligations from the one the app switcher
said they were in. It also ignored impersonation, which the auth
context honours.

### 3b.2 What AS3 built

- **One status authority**, `src/lib/complianceStatus.js`, on the AS2
  `riskScoring.js` precedent. Status is derived and never typed; what a
  person sets is the `lifecycle`. Three decisions in it are worth
  keeping: an expired permit outranks an overdue return; evidence filed
  in March does not clear a return that was due this month; and
  "On track" and "Compliant" are different words, so Compliant is never
  asserted for an obligation with no evidence against it.
- **`expiry_date` as a first-class date.** A permit's expiry and a
  report's due date are different obligations against the same row. The
  register carried one date, so it could not warn that a discharge
  permit lapses in three weeks while every return against it is up to
  date. The earlier of the two now drives the warning, and the register
  labels which one is counting down.
- **`regulatory_evidence`**, which is what makes "Compliant" mean
  anything. Recording a filing writes the evidence and rolls the due
  date forward by frequency, **from the date that was due, not from the
  filing date** — rolling from the filing date walks the whole schedule
  later every period.
- A real obligation form with a live status preview, a real detail
  page, working filters, a CSV export of the rows actually on screen,
  and a regulator directory that can add and edit, and that refuses to
  delete a regulator obligations still point at.
- Charts moved to the Suite standard: white surface, 40px `ChartLogo`.
  The status colours live in the same authority as the status words, so
  a slice and the badge beside it cannot come to mean different things.
- `REG-` codes issued in sequence under an advisory lock behind a
  unique index, with a membership check inside the SECURITY DEFINER.
- Dead code removed: `RegulatorsDirectory.jsx` (never routed), all
  three services, and two util files nothing imported.

### 3b.3 Gotchas worth keeping

- **`Number(null)` is 0, not NaN.** The first draft of the lead-time
  fallback used `Number.isFinite()` alone, so a null `lead_time_days`
  became a zero-day warning window: the obligation would jump from On
  track straight to Overdue with no notice, which is the one thing that
  field exists to prevent. The unit test caught it.
- **`new Date('2026-09-17')` is UTC midnight**, which is 16 September in
  every negative offset. These are calendar dates, not instants, so
  everything parses at local midnight. Without that, an obligation due
  today reads overdue for every user west of Greenwich.
- **`set local role` outside a transaction is a warning and a no-op**,
  and the whole pentest then runs as the superuser, which bypasses RLS
  and passes everything. The first draft of `rls-pentest-as3.sql` did
  exactly that and reported a clean sweep against a database with no
  protection at all. Every section now runs inside its own transaction,
  and every write sits on its own savepoint, or the first denial aborts
  the rest of the section.
- The tabs disappeared on every detail route, not only on forms: the
  old `isFormView` counted path segments. Opening an obligation lost
  the app's navigation.

---

## 3c. AS4, built 2026-09-17 — Document Control

The roadmap called this app DE-FICTION and quoted its fail-open
fallback. The fallback is not the worst of it.

### 3c.1 Silent loss of a controlled document

```js
async saveDocument(docData) {
  try { ... } catch (e) {
    return { success: true, data: [{ id: 'new-id', ...docData }] }; // Mock success
  }
}
```

The form then toasted "Document saved as draft" and navigated to the
library. And the errors were routine, not hypothetical: the create path
wrote a `category` string and a `description` into a table that has
`category_id` and had no description column, and it minted the document
number as `Math.floor(Math.random() * 1000)` against
`documents_org_id_document_number_key`, a real unique constraint. The
database rejected the insert correctly. The app reported success.

This is the sharpest instance of the pattern the AS programme exists
for: the one write path in a controlled-document system told the user
it had worked, every time it had not.

### 3c.2 Everything on the screen was invented

- **Five documents.** `if (total === 0) throw` then
  `catch { return MOCK_DOCUMENTS }` showed an organization with an empty
  library "Offshore Rig Evacuation Procedure", "Chemical Handling Safety
  Policy" and "Subsea Manifold Schematic V2", owned by Sarah Jenkins,
  Mike Ross, Dr. Alan Grant, Jessica Pearson and Louis Litt. The last
  five names are from Jurassic Park and Suits.
- `getDocumentById()` fell back to `MOCK_DOCUMENTS[0]`, so asking for a
  document you do not have showed you a different document, complete
  with a revision number and an owner.
- **Four of eight methods never queried anything.** `getApprovals()`
  returned two hardcoded rows due in March 2024. `getActivityLog()`
  returned four rows reading "2 hours ago", permanently, to everyone.
  `getReportData()` returned fixed distributions.
- **`overdue: 1 // Mock overdue`** sat on the SUCCESS path of
  `getDashboardStats()`. The single number this app exists to produce
  was a literal even when the database answered.

`doc_workflows` and `doc_activity_log` were in the database the whole
time, carrying exactly what those two panels needed.

### 3c.3 Two defects nobody had reported

- **The Reports tab crashed on every render.** It built
  `icon: FileListIcon` and imported only Download, BarChart2, PieChart
  and TrendingUp, so the component threw a ReferenceError. Behind the
  crash were four cards describing reports that did not exist, one
  offering a "Full FDA CFR 21 Part 11 style audit extract" attached to
  a not-implemented toast.
- **The upload box accepted nothing.** "Click to upload or drag and
  drop. PDF, DOCX, XLSX up to 50MB" was a styled `div`: no input
  element, no `onChange`, no drop handler, no state. There was no way
  to tell by looking.

### 3c.4 What AS4 built

On the tables that were already there: a real revision chain with one
current revision enforced by a partial unique index; real file upload to
a private storage bucket with signed-URL download; the approval queue
from `doc_workflows` with decisions actually recorded; activity from
`doc_activity_log`; publishing that computes the review date from the
issue date and the review period; and reports counted from the
organization's own rows. Numbers come from `next_document_number()`.
Charts move to the white Suite standard. The tree moves under
`apps/assurance/` with the rest of the module, and every hardcoded hex
becomes a UI token.

Where something half-succeeds it says so. A document written but a file
not stored reports exactly that, rather than a success toast for a
controlled document with no content behind it.

### 3c.5 Two portability gaps in AS1, found and fixed here

Rebuilding the module from the repo on a scratch PostgreSQL 15 is what
surfaced them, and both matter for AS5 onward:

- **AS1's RLS migration grants `authenticated` nothing.** It revokes
  `anon`, enables RLS and writes policies `to authenticated`, which is
  correct against production because the grants were already there.
  Against an empty database, which is what the schema backfill claims to
  support, the result is a module with perfect RLS over tables no
  application role can read. AS4 states the grants explicitly for the
  `doc_*` family, as AS3 did for the regulatory tables.
- **Several AS1 foreign keys are unqualified** as
  `REFERENCES users(id)`, which resolves through `search_path` to
  `public.users`, not `auth.users`. The scratch fixture now carries
  both tables.

### 3c.6 The storage bucket is owner-run

Deliberately not created by migration: the Suite's existing buckets
(`seismic`, `wellsite`) were created through the Supabase dashboard, and
doing it differently here would leave the platform with two
conventions. The owner creates a **private** bucket named `documents`.
Paths are `<org_id>/<document_id>/<revision_id>-<filename>`, so a
storage policy scoping on the leading segment is the same `org_id` check
every AS1 table policy uses. Until it exists the app asks the bucket,
says plainly that files cannot be attached, and still registers and
revises documents.

---

## 3d. AS5, built 2026-09-17 — Peer Review Manager

AS4's Document Control reported success on failed writes. This app did
not fail. It never opened a write path at all.

### 3d.1 Every write went to a JavaScript array

```js
let localReviews  = [...MOCK_REVIEWS];
let localComments = [...MOCK_COMMENTS];
let localAudit    = [...MOCK_AUDIT];
```

`saveReview()` pushed onto `localReviews`. `addComment()` pushed onto
`localComments`. `updateCommentStatus()`, `updateReviewStage()` and
`logAudit()` mutated them in place. The UI then reported "Review
initiated", "Your comment has been successfully registered" and
"🚧 Action recorded. Backend process triggered."

There was no backend process. Every review raised, every technical
comment written against a deliverable, every disposition, every stage
change and the entire audit trail survived until the page was reloaded
and were then gone, with no error at any point.

For a technical assurance app this is the worst failure mode in the
module, because the audit trail **is** the deliverable. The point of
peer review is being able to show, afterwards, who raised what and how
it was answered.

`getDashboardStats()` never queried the database, so every KPI was
counted from `MOCK_REVIEWS`. A customer's peer review dashboard was a
picture of somebody else's invented project, permanently — and it
looked entirely plausible: four KPIs and a stage doughnut, internally
consistent, all about a field that does not exist.

### 3d.2 Twelve fabricated reports, downloadable as CSV

The worst artefact the AS programme has found.

`getMockReportData(reportId)` generated report rows procedurally:

```js
case 1: return Array.from({length: 45}).map((_, i) => ({
  Comment_ID: `CMT-${1000 + i}`,
  Author: `Reviewer ${i % 5 + 1}`,
  Status: i % 3 === 0 ? 'Open' : (i % 3 === 1 ? 'Responded' : 'Closed'),
}))
```

Forty-five invented comments; thirty invented severities; all plausible,
none real. Each of the twelve cards had a Download button that handed
the result to a CSV writer which stamped it
`"<Report title> - Generated on <today's date>"` and saved it as
`comments_by_status_2026-09-17.csv`.

**A CSV outlives the app.** It gets emailed, attached to an audit
response and filed as a record, long after anyone remembers which
screen produced it. Report 12 was titled "Full System Audit" and
described as a "Complete FDA CFR 21 Part 11 compliant extract of all
system actions": a regulatory claim on a file of invented records.

The same CFR 21 Part 11 wording appears in Document Control's Reports
page, so it came from the generator rather than from anyone's intent.
That is precisely why it had to be found rather than trusted.

### 3d.3 What AS5 built

On the three tables that already existed and had never been written to.
`peer_review_comments` already carried `response_text`,
`responded_by`/`responded_at` and `verified_by`/`verified_at`: the
disposition and verification loop was in the schema all along.

`src/lib/peerReview.js` is the fourth authority in this module, and it
owns the two things the app never had:

- **A comment moves only along a disposition its status permits.**
  Open leads to Responded or Withdrawn; Responded to Verified or
  Rejected; Rejected back to the author. A comment cannot be Verified
  before the author has actually responded, which the database cannot
  express and the authority therefore does.
- **A review cannot be Closed while a Critical or Major comment is
  unresolved.** Minor and Editorial do not block, because closing over
  those is a coordinator's judgement. A review that can be closed over
  an open showstopper is not an assurance process; it is a list. The
  old app moved the stage from a dropdown with no check at all.

Plus a real roster on the new `peer_review_participants` table, a real
audit trail written and read back, exports built from the rows on
screen, and charts on the white Suite standard.

Removed rather than rebuilt: the attachments panel, which toasted
"Upload dialog opening..." and opened nothing. A reviewed deliverable is
a controlled document and AS4 just built that, so linking the two
belongs to AS11 rather than growing a second document store here. The
header's Export button, which toasted "Downloading complete peer review
archive as CSV" and downloaded nothing, is gone too.

### 3d.4 THE THIRD AS1 PORTABILITY GAP, and the most serious

AS1 §8 reads: "documents itself already has RLS and policies; it only
needs the anon grant taken away. Same for risk_register, moc_records,
peer_reviews, peer_review_comments, peer_review_audit."

That is true of production, and it means **the repo cannot reconstruct
this module's security posture**. Rebuilding the Assurance schema from
the repo on an empty database — exactly what the AS1 backfill claims to
support, and how a staging or recovery environment gets stood up —
yields those six parent registers with **RLS disabled and no policy of
any kind**. Every one of them holds a register.

The AS5 schema checks caught it: on a clean rebuild, a member of Org B
could read Org A's reviews.

AS5 states RLS and policies for its own three tables. **The other
parents are deliberately not touched**, because rewriting another app's
live policy from a guess at what production holds is how a working
module breaks. See §5 for the open item.

This is the third gap of its kind, after the missing `authenticated`
grants and the unqualified `REFERENCES users(id)` that AS4 found. All
three were invisible until the module was actually rebuilt from the
repo, which is an argument for doing that on every remaining wave.

---

## 3e. AS6, built 2026-09-17 — Management of Change

Seven `moc_*` tables exist and the app used none of them. Not one page
issued a query.

### 3e.1 The create form had no state

Not one input in `NewMOC.jsx` carried a `value` or an `onChange`, and
there was no `useState` for any field. The submit handler was:

```js
setTimeout(() => {
  toast({ title: "MOC Draft Saved",
          description: "Record MOC-2026-090 has been created successfully." });
  navigate('/dashboard/apps/assurance/management-of-change/MOC-2026-090');
}, 800);
```

A user could fill in the current situation, the proposed change, the
justification and the target date, and none of it was read out of the
DOM, let alone saved. The record number was a string literal, the same
one every time.

### 3e.2 Approving a change recorded nothing

The approval queue was two hardcoded tasks and clicking Approve toasted
"Approval recorded for MOC-2026-088". An MOC approval is a named person
authorising a change to a facility. Falsely confirming one is the most
consequential lie in this module.

One of the two rows also carried `urgent: true`, which rendered an
"Overdue" badge on a task that had no due date at all.

### 3e.3 Invented change registers, exportable to PDF

The register held five hardcoded rows — MOC-2026-089 down to -077,
including an Emergency "Temporary pipeline clamp" at High risk — and
offered them as **CSV, Excel and PDF**. An MOC register is the document
that proves a facility's changes were controlled; a PDF of five invented
ones, stamped with today's date, is the kind of file that ends up in an
audit pack.

The reports page did the same for its stage and category charts and,
worst of the three, for an expiry report:

```js
const expiryData = [
  { id: 'MOC-012', daysLeft: 2 }, { id: 'MOC-044', daysLeft: 5 },
  { id: 'MOC-088', daysLeft: 12 }, { id: 'MOC-091', daysLeft: 15 }
];
```

Four invented change numbers with invented countdowns, with CSV, Excel
and PDF buttons pointed at the constant. **The temporary-change expiry
report is the one document in this app that says which deviations a
facility is running on and for how much longer.**

### 3e.4 And the rest of it

- The dashboard's tiles were 42 / 12 / 5 / 128, with a literal stage
  breakdown and monthly trend, and a hardcoded alert reading
  "MOC-2026-015 and MOC-2026-033 expire in less than 7 days" — naming
  two changes that do not exist.
- `MOCDetail.jsx` read `const { id = 'MOC-2026-089' } = useParams()`
  and rendered one hardcoded record whatever the URL said. Its stage
  button toasted "Moving to next stage..." and moved nothing.
- The shell carried a notification bell with a red unread badge over
  four invented notifications ("A. Davis approved MOC-2026-088"), with
  mark-read and delete that mutated local state.

### 3e.5 What AS6 built

The unused schema was genuinely good — `expiry_date`,
`moc_approvals.level`, `moc_actions` split by phase, `moc_impacts`,
`moc_activity_log` — so this is wiring plus three rules.

`src/lib/managementOfChange.js` is the fifth authority in this module,
and the first statement anywhere in the Suite of what MOC enforces:

- **A change does not leave Approval until every approval level has
  signed**, and never with a rejection against it. An empty approval
  list is not a passed gate, which is the failure mode a naive
  `every()` would produce.
- **Pre-implementation actions close before the change goes in**, and
  implementation and post-implementation actions close before it
  closes. That ordering is the whole point of splitting the list.
- **A temporary change past its expiry is EXPIRED**, and that outranks
  every other state it is in. It sorts above everything in the
  register, raises a banner on the dashboard and on the change, and
  has its own export.

The third is the failure the discipline exists to catch: the clamp that
was going to be replaced next shutdown and is still there four years
later. It is enforced three ways — the database refuses a temporary or
emergency change past Draft without an expiry date, the authority
refuses to implement one without it, and the register surfaces one that
has passed.

Removed rather than rebuilt: the notification bell (real notifications
need a table with per-user read state, which does not exist; the
dashboard's activity and each change's audit trail read
`moc_activity_log` instead) and PDF and Excel export.

### 3e.6 Gotcha worth keeping

**The guard found the notification bell, not the audit.** The AS6 audit
read all six pages and missed it, because it sat in the shell's header
rather than on a page. The `NO HARDCODED MOC NUMBER APPEARS ANYWHERE`
test failed on the first run and pointed straight at it. A regex over
the whole app tree catches what reading page by page does not, which is
the same lesson as §3d.4 from a different direction.

---

## 3f. AS7, built 2026-09-17 — Quality Assurance Plan & NCR

There were no `qa_*`, `ncr*` or `capa*` tables anywhere in the database.
The whole app was four files under `src/data/qa-plan/`.

### 3f.1 An app with no database at all

Six invented quality plans, each with a `progress` percentage written in
by hand (45, 10, 78, 90, 30, 100), two checkpoints that both belonged to
the same plan, two NCRs, and two corrective actions **that no page
imported at all**. Corrective action is the half of the discipline that
closes the loop, and it was absent from the interface entirely.

So an organization with no quality plans, an organization with a full
register and an organization whose database was down all saw the same
six plans, owned by the same invented people.

Nothing could be created. `NewQAPlan.jsx` had no state — no `value`, no
`onChange`, no `useState` for any field, exactly as AS6 found in
`NewMOC.jsx` — and its Create Plan button toasted "QA Plan Draft
Created" before navigating to the register of invented plans. Raise NCR
toasted "Raise NCR form...". Add Checkpoint toasted "Add checkpoint
dialog...".

### 3f.2 Two wrong routes, and the second hid half the app

`QAPlanDetail.jsx` read `useParams().id` while the shell declared
`:qaPlanId`, so `id` was always undefined and

```js
const plan = qaPlans.find(p => p.id === (id || 'QAP-2026-001')) || qaPlans[0];
```

opened the first invented plan from every row in the register.

The second one is the more serious, because it was invisible: the NCR
register's rows navigated to `ncr/:id`, **a route the shell never
declared**, so every click on a non-conformance fell through the
catch-all onto the dashboard. That was the whole of the NCR lifecycle.
An organization could raise a non-conformance and then had nowhere to
agree a disposition, record a root cause, raise a corrective action,
check whether it worked, or close it. `NCRDetail.jsx` is that page now,
and it is the only caller of `canCloseNcr`.

### 3f.3 The reports page drew no charts

Both of its panels rendered a sentence describing a chart:

```jsx
[Chart Visualization: Active 60%, Draft 20%, Closed 20%]
[Chart Visualization: Engineering 12, Drilling 5, Projects 8]
```

Percentages and counts of nothing, identical for every organization,
under an Export Dashboard button that toasted "Downloading PDF..." and
downloaded nothing at all. This is the one page in the module whose
fiction was never exportable, which is the only good thing to say about
it.

It now leads with the report a quality manager actually needs —
**which inspection and hold points are outstanding, and which are past
their planned date**, hold points first — and exports the plan
register, the NCR register and that list as CSV, each built from the
fetched rows.

### 3f.4 What AS7 built

`src/lib/qualityAssurance.js` is the sixth authority in this module.
Three rules carry it:

- **A hold point stops work; a witness point does not.** That
  distinction is the engineering content of an inspection and test
  plan. A hold point may not be passed until the verifying party
  attends and signs; a witness point is a notification, and work
  proceeds if the party does not attend. `canClosePlan` refuses over an
  outstanding hold point and lets an unattended witness point through.
  A failed checkpoint blocks whatever its type: a failed inspection is
  the most outstanding item on a plan.
- **A decision is a date and a named verifier.** Any checkpoint
  reaching Passed, Failed or Waived carries both — a Suite user, or a
  name in text for a certifying authority surveyor who has no login
  here. A hold point that passed with nobody named did not pass. A
  waiver carries its reason as well, because waiving an inspection
  point is a deliberate acceptance of less assurance.
- **A completed corrective action is not a working one.**
  `canCloseNcr` will not close a critical or major non-conformance
  until a corrective action has been **verified effective**, on AS5's
  proportionality precedent where Minor and Editorial do not block. The
  effectiveness check is a date and a name either way, including for a
  "not effective" verdict, which is the one that matters most: it is
  the trigger to go round again.

There is deliberately **no `progress` column**. Completion is counted
from the checkpoints, and a plan with no ITP reads "No inspection
points" rather than 0% complete, because it is not 0% complete.

Both code series (`QAP-YYYY-NNN`, `NCR-YYYY-NNN`) are issued by the
database under an advisory lock, per org and per year.

### 3f.5 Gotcha worth keeping

**A hook method with no caller is the same defect as a create form with
no state.** Halfway through this wave the hook exposed eighteen write
methods and the pages called five of them: `setDisposition`,
`closeNcr`, `voidNcr`, `addCapas`, `updateCapa` and
`recordEffectiveness` all existed, were correct, were tested through
the authority, and were unreachable from the interface. It read as
finished work from the service level, which is exactly the trap §1.2a
recorded after AS3. The check that catches it is a grep for each
exported method across the app tree, and it is now a test.

---

## 3g. AS8, built 2026-09-17 — ISO Compliance

There were no `iso_*` tables anywhere in the database. The whole app was
one file.

### 3g.1 The data was not invented once; it was invented on every reload

`src/data/isoComplianceData.js` did not hold rows. It generated them at
module load:

```js
score:       Math.floor(Math.random() * 20) + 80,
dueDate:     new Date(Date.now() + Math.random() * 5000000000)...,
lastUpdated: new Date(Date.now() - Math.random() * 10000000000)...,
status:      i % 5 === 0 ? 'Non-Compliant' : i % 4 === 0 ? 'Partial' : 'Compliant',
```

Thirty clauses titled "Clause Title 1" to "Clause Title 30", owned by
"User 1" to "User 10"; fifteen audits led by "Auditor 1" to "Auditor 5",
each scoring between 80 and 100; twenty findings; fifteen actions.

**So the dashboard's "Overall Compliance 73%" was a different number on
every reload**, and the findings register's overdue column changed with
it. This is the only app in the module whose fiction was not even
stable, and it is the one an organization would have used to decide
whether it was ready for a certification audit.

The shell held the four arrays in `useState` and passed them down as
props, so no page in the app could have queried anything.

### 3g.2 Nothing persisted, and the one create path lied

The Add Clause modal in the shell read its fields out of the DOM with
`new FormData(e.target)`, built a row with
`id: \`CLAUSE-${Math.floor(Math.random() * 10000)}\`` and
**`status: 'Compliant'`**, pushed it onto `useState` and toasted "The
new ISO clause has been successfully registered". A reload lost it.

`NewISO.jsx` was a dashed box reading "Detailed form view placeholder".
`ISODetail.jsx` rendered the URL's id as a heading over a second dashed
box and a status panel hardcoded to **Compliant / Current / Oct 12,
2023**, whichever clause was asked for.

The reports page listed four report types in a sidebar —
`compliance-by-standard`, `audit-schedule`, `finding-severity`,
`action-tracking` — and rendered the same one whichever was clicked,
because `selectedReport` was set and never read. Its Print and Export
PDF buttons both called `handleExport`, which toasted "Your report is
being generated and will download shortly" and generated nothing.

And `isoActionsData` was imported by no page that rendered it: corrective
action, the half of the discipline that closes the loop, missing from the
interface — **exactly as AS7 found with `capaSampleData.js`**. Twice in
two waves, in apps written by different hands.

### 3g.3 What AS8 built

Seven tables, two code series under an advisory lock, RLS from the
start, and `src/lib/isoCompliance.js` as the seventh authority in this
module. Four rules:

- **A conformity claim is evidence, a date and a name.** "Compliant" in
  a dropdown is an opinion; ISO conformity is a claim about documented
  information, and the first question at a certification audit is which
  document and when anybody last looked at it. An external assessor with
  no Suite account is named in text, as AS7 does for a certifying
  authority surveyor.
- **Not applicable needs a justification** (ISO 9001:2015 §4.3), and an
  excluded clause cannot also be claimed conformant, which is how an
  exclusion quietly becomes a pass.
- **An auditor may not audit their own work** (ISO 19011). Enforced by a
  trigger from both directions — naming a lead auditor who owns a clause
  in scope, and adding to the scope a clause its lead auditor owns — and
  named in the interface before the row is attempted. An external lead
  auditor is independent by construction and is not blocked.
- **A major nonconformity is not closed by a correction** (ISO 9001
  §10.2). The correction deals with the item, the corrective action with
  the cause, and for a major one the corrective action must have been
  verified effective. A minor one needs the correction; an observation
  or an opportunity for improvement needs neither. The same
  proportionality as AS5 and AS7.

**Coverage is counted over the certification cycle**, and only an
internal audit counts: a certification body's own audit is not the
programme ISO 9001 §9.2 requires the organization to run. "Never
audited" and "audited before this cycle began" are different facts and
the register shows both rather than averaging them.

**And certification readiness is a list of blockers, not a percentage.**
`certificationReadiness()` returns named, counted work. A test asserts
it exposes no `percent`, `complianceRate` or `score` at all.

`isoCompliance.js` imports the action helpers from AS7 rather than
restating them, and `iso_actions` carries the same column names on
purpose. Two modules that both know when an action is overdue is the
defect §6 exists to prevent.

### 3g.4 Gotchas worth keeping

**Two defects in the migration were found by running the checks, not by
reading it.** A trigger function read `NEW.audit_id` on a table with no
such column — in PL/pgSQL that is an error, not a null, so every insert
into `iso_audits` failed — and it was invisible in review because the
same function serves three tables. The other was in the checks file:
a closure dated before the finding was raised. Both took one run to
find and neither would have survived to production, but both would have
survived a careful read.

**The AS7 orphan test earned its place immediately.** "Every write
method the hook exports has a caller" failed on its first run here and
named four: `updateStandard` and `deleteStandard`, which had no Edit or
Remove on the standards register, and `updateClause` and `deleteAudit`,
which are now gone — `assessClause` is `updateClause`'s only caller and
must stay the only way past the gate, and an audit is cancelled rather
than deleted so its findings keep their provenance.

---

## 3h. AS9, built 2026-09-17 — Lessons Learned

The third app in a row with no tables of its own, and the one whose
whole point had been left out.

### 3h.1 Five lessons and seven numbers

`src/utils/lessons-learned/mockData.js` held five invented lessons — a
pump failure on "Subsea Tie-back Alpha" by John Doe, a drill bit
optimization by Jane Smith — and:

```js
export const METRICS = { total: 156, draft: 12, underReview: 24,
  published: 110, archived: 10, pendingAction: 5, highReusability: 89 };
```

Seven literals, rendered as seven dashboard tiles, **two of them
carrying trend badges reading "+12% MoM" and "+5% MoM"** over nothing
at all. Above them sat a captured-trend chart of six hardcoded months
and a category pie of four hardcoded slices.

### 3h.2 The capture form had no state. Again.

Not one of `NewLesson.jsx`'s six fields carried a `value` or an
`onChange`, and there was no `useState` in the file. Save Draft ran a
toast and a navigate:

```js
toast({ title: "Draft Saved",
        description: "Lesson draft has been saved successfully." });
navigate('/dashboard/apps/assurance/lessons-learned');
```

**This is the third app in this module with that exact defect**, after
`NewMOC.jsx` (AS6) and `NewQAPlan.jsx` (AS7). Three apps, three
different page authors, the same shape: a complete-looking form that
reads nothing out of the DOM and confirms a save that never happened.

### 3h.3 The prompt builder, and a different lesson

Every control on the register — Filters, Export, Capture Lesson, and
the menu on each row — called one handler:

```js
toast({ title: "Action triggered", description: "🚧 This feature isn't
  implemented yet—but don't worry! You can request it in your next
  prompt! 🚀" });
```

naming the prompt builder to paying customers, which is the AS3
Regulatory Compliance finding in a second app. The reports page and the
detail page did the same for Share, Print, Edit, Global Filters and
Print All.

And the detail page read:

```js
const lesson = MOCK_LESSONS.find(l => l.id === id) || MOCK_LESSONS[0]; // fallback for demo
```

so asking for a lesson this organization does not have showed it a
different lesson — the AS4 Document Control defect, in a second app,
with the comment saying so.

### 3h.4 What AS9 built

Three tables, a code series under an advisory lock, RLS from the start,
and `src/lib/lessonsLearned.js` as the eighth authority in this module.
Three rules:

- **An author may not validate their own lesson.** The third
  independence rule here, after AS5's peer reviewer and AS8's ISO 19011
  auditor. A lessons database published by the people who wrote it
  holds what individuals think happened; a validated one holds what the
  organization accepts happened. An external validator recorded by name
  is not blocked.
- **An anecdote is not a lesson.** Validating or publishing needs what
  happened, why it happened AND what to do about it. A Draft needs none
  of it: capture comes before analysis, and a form that demands the
  root cause on the day of the event is a form nobody fills in.
- **A lesson that was never applied has not been learned.**
  `lesson_applications` records each push into the thing that changes,
  and the two Suite targets carry real foreign keys into
  `risk_register` and `moc_records`. `Embedded` is not a status
  somebody selects: a trigger counts the applications, because a check
  constraint cannot, and a **rejected** application embeds nothing.
  Archiving needs a written reason.

**And reusability is counted, not claimed.** There is no reusability
column. The old register drew a High / Medium / Low badge on every row
from the data file and the dashboard totalled them into "High
Reusability: 89". What replaces it is the applicability scope — this
asset, this discipline, this organization, industry-wide — and
`reuseRecord()`, which counts rows and names what they changed.

**The push is a real write.** From a lesson's own page, `Raise a risk`
creates a `risk_register` row through `buildRiskWrite` and
`next_risk_code`, and `Raise a change` creates a `moc_records` row
through `buildMocWrite` and `next_moc_code` — the modules that own
those tables, rather than a second statement of their writable columns
here. Both are linked back through `lesson_applications`, so the trail
runs in both directions.

### 3h.5 Gotcha worth keeping

**A partial failure has to say what did happen.** If the risk is
created and the link back to the lesson fails, `raiseRiskFromLesson`
reports "Risk RSK-1042 was raised, but the link back to this lesson was
not saved", rather than returning a plain failure. The alternative —
the pattern the whole module is being rebuilt to remove — is a message
that implies nothing happened while a row sits in another app's
register.

---

## 3i. AS10, built 2026-09-17 — Audit & Findings Manager (new)

The only wave in this programme that is not a rebuild, and the one that
closes the module's original finding.

### 3i.1 Two tiles, sold, with no code of any kind

`safety-audit-manager` and `audit-trail-manager` were **Active** with
`is_functional = true` in `master_apps`, and behind them there was no
route in `App.jsx`, no page, no component, no service — nothing but a
marketing entry. A customer could buy both. AS1 archived them and
recorded that they would return here as one app that seeds its own
tile; this is that app.

Assurance module pricing is computed from the catalogue
(`pricing_config.module_pricing`), so those two tiles had been priced
as working software.

### 3i.2 The decision that had to be made first

AS8 had already built an audit programme. The question was whether
this app is that app.

It is not, and the migration header records why rather than leaving it
to be inferred. **AS8's audit is an audit of a management system**: its
scope is a set of clauses and its coverage record runs over a
certification cycle. **A contractor HSE audit has neither** — it has a
protocol of questions, an auditee, and answers. Forcing either shape
onto the other damages both.

What the two genuinely share is shared **in code**: `audit_findings`
and `audit_actions` carry the same columns and the same vocabularies
as `iso_findings` and `iso_actions` on purpose, and
`src/lib/auditManagement.js` imports AS8's `canCloseFinding` rather
than restating it. A unit test asserts the imported function **is** the
ISO one (`expect(canCloseFinding).toBe(isoCanCloseFinding)`), so a
future copy-paste fails the suite. That is §6 enforced by a test rather
than by good intentions.

### 3i.3 The five rules

- **An audit is not reported with half its checklist blank, and "not
  applicable" is an answer that needs a reason.** A 120-item protocol
  returned with 40 items untouched and reported as "no findings" is the
  failure a paper audit programme actually produces, and marking the
  awkward items not applicable is the fastest way to produce it. A
  nonconformant answer also carries its objective evidence.
- **A nonconformant answer on a CRITICAL item must raise a finding**
  before the audit can be reported. That link is what makes a checklist
  a control rather than a form, and a **voided** finding does not
  satisfy it.
- **A stop-work finding records what was done about it immediately**,
  from the moment it is raised rather than at closure, and a stop-work
  observation is refused as the contradiction it is. Imminent danger
  does not wait for the corrective action cycle.
- **An auditor may not audit their own area** — the lead auditor and
  the auditee. The module's fourth independence rule, after AS5's
  reviewer, AS8's ISO 19011 auditor and AS9's lesson author.
- **A programme is complete when its audits are, not when the year
  ends.** Completion needs every audit reported or cancelled WITH A
  REASON, and `programmeProgress()` counts delivery from audits
  reported. There is deliberately no `deleteAudit` anywhere in the app:
  a programme whose audits can be deleted can always be reported
  complete.

### 3i.4 Gotcha worth keeping

**The module's own defect list became the test suite.** AS10 had no
fiction to remove, so its 28 file-level tests are written against the
eight defect classes the earlier waves found — a create form with no
state (AS6, AS7, AS9), a fall-back to the first record (AS4, AS9), a
route parameter the page does not read (AS7), `Math.random()` in the
data (AS8), a literal standing in for a query (every wave), a "not
implemented" toast naming the prompt builder (AS3, AS9), an export
built from something other than fetched rows (AS5, AS6), and a hook
method with no caller (AS7, which caught four in AS8). The last one
caught `deleteAudit` here, and the right answer was to delete the
method rather than add a button.

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

- **All fifteen migrations are unapplied.** Ordered apply script:
  `tools/validation/assurance/as1-apply.sh`, which does not yet include
  AS3's `20260917100000_as3_regulatory_compliance.sql`, AS4's
  `20260917200000_as4_document_control.sql`, AS5's
  `20260917300000_as5_peer_review.sql`, AS6's
  `20260917400000_as6_management_of_change.sql`, AS7's
  `20260917500000_as7_quality_assurance_plan.sql`, AS8's
  `20260917600000_as8_iso_compliance.sql`, AS9's
  `20260917700000_as9_lessons_learned.sql` or AS10's pair
  (`20260917800000_as10_audit_findings_manager.sql` and its tile seed
  `20260917810000`); run those after the AS1 pair, in that order.
  Owner-run.
- **The six parent registers have no RLS or policies in the repo**
  (§3d.4). `documents`, `risk_register`, `moc_records`,
  `compliance_rules` and the risk children AS1 listed as already
  protected are protected in production and nowhere else, so the module
  cannot be rebuilt securely from source. Wants its own small
  migration, written after reading the live policies rather than
  guessing at them. **Not a production vulnerability**; a
  reconstruction one.
- **A private `documents` storage bucket** for AS4 file uploads (§3c.6).
  Owner-run through the Supabase dashboard.
- **Seven held tile promotions.** AS1 left Document Control, Peer
  Review Manager, Management of Change, Quality Assurance Plan and
  Lessons Learned at Coming Soon and demoted ISO Compliance to it; AS4
  to AS9 make them real. AS10 SEEDS a seventh tile
  (`audit-findings-manager`) at Coming Soon, since its app is new.
  Every promotion to Active is held for the upload that ships the
  routes.
- The commerce migration needs a second engineer (shared tables).
- Five owner questions in `Assurance-ROADMAP.md` §7. AS1 proceeded on
  the recommendation in each case per the standing autonomous directive;
  each decision taken is recorded in the migration headers.
- `purchased_apps` is **inserted from the browser** by
  `src/utils/paymentVerificationLogic.js`. Recorded, not fixed.
- The ~90 remaining RLS-off legacy tables.
- **The `npm run build` PWA failure is diagnosed, and it is not a repo
  bug.** AS1 recorded it as unexplained and blocking prod zips. Traced
  in AS3 to three lines, with no Suite code involved at all:

  ```
  node -e "require('workbox-build').generateSW({globDirectory:'dist',
    globPatterns:['**/*.css'],swDest:'/tmp/sw.js'}).catch(e=>console.log(e.message))"
  ```

  The real stack, once workbox's wrapper is removed, is
  `ReferenceError: crypto is not defined at generateUID
  (serialize-javascript/index.js:102)`, reached at module load from
  `@rollup/plugin-terser`. `serialize-javascript` 7.1.1 calls the Web
  Crypto global `crypto.getRandomValues()` at import time, and **the
  bare `crypto` global does not exist in Node 18**; it arrives in Node
  19+. This machine runs **Node 18.19.1** while `package.json` already
  declares `"engines": {"node": ">=20.0.0"}`.

  So the build is being run on a Node the repo does not support. On
  Node 20 it works as written. Confirmed here by giving Node 18 the
  behaviour it is missing: `NODE_OPTIONS=--experimental-global-webcrypto
  npx vite build` completes end to end, emits `dist/sw.js` and
  `dist/workbox-*.js`, and exits 0.

  **The fix is to build on Node 20, not to change the build script.**
  Patching `package.json` with the flag would paper over an engine
  mismatch the repo already declares, and the flag is deprecated in
  newer Node. Prod zips are unblocked either way.
- AS4 onward: the rest of the apps. The first rule of the programme is
  that no service in this module may return invented rows, and AS4 and
  AS5 are where it bites hardest — both fail open into fiction today.
