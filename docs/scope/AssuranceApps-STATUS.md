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
| ISO Compliance | `apps/assurance/iso-compliance/*` | nothing | **Demoted to Coming Soon.** `@/data/isoComplianceData` in `useState` | AS8 |
| Document Control | `apps/assurance/document-control/*` | `documents`, `doc_revisions`, `doc_workflows`, `doc_activity_log`, `doc_categories` | **AS4 done.** Coming Soon until its own promotion migration | AS4 |
| Peer Review Manager | `apps/assurance/peer-review-manager/*` | `peer_reviews`, `peer_review_comments`, `peer_review_audit`, `peer_review_participants` | **AS5 done.** Coming Soon until its own promotion migration | AS5 |
| Management of Change | `apps/assurance/management-of-change/*` | `moc_records`, `moc_approvals`, `moc_actions`, `moc_impacts`, `moc_activity_log` | **AS6 done.** Coming Soon until its own promotion migration | AS6 |
| Quality Assurance Plan | `apps/assurance/qa-plan/*` | nothing | Coming Soon | AS7 |
| Audit & Findings Manager | not built | - | New app | AS10 |

Tests: **264** as of AS6 (AS2 34, AS3 63, AS4 45, AS5 52, AS6 58, plus
the shared authority suites), all under
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

- **All ten migrations are unapplied.** Ordered apply script:
  `tools/validation/assurance/as1-apply.sh`, which does not yet include
  AS3's `20260917100000_as3_regulatory_compliance.sql`, AS4's
  `20260917200000_as4_document_control.sql`, AS5's
  `20260917300000_as5_peer_review.sql` or AS6's
  `20260917400000_as6_management_of_change.sql`; run those after the
  AS1 pair, in that order. Owner-run.
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
- **Document Control's tile promotion.** AS1 left it Coming Soon; AS4
  makes it real, but the promotion migration is held with the rest.
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
