# PM Pro, AFE and Report Autopilot (Economics E4) — status

Phase: Economics E4 (Economics-ROADMAP.md §6 E4)
Status: **SHIPPED 2026-08-29** (branch feat/economics-e4)

The three remaining apps in the module, each with a surface that told the
user something untrue.

## 1. Project Management Pro

### The External Systems hub, removed

The D0 follow-up that was never done. A hub offered connections to Jira,
SAP ERP, Slack, SharePoint and Salesforce. Clicking Connect waited 1.5
seconds, wrote a row to `pm_integrations` with `status: 'connected'` and
a config of `{ apiKey: '*****' }`, and showed a green **Connected**
badge. Sync waited two seconds and stamped `last_sync_at`. No external
system was contacted at any point, and the false state was persisted to
the database rather than merely displayed.

Fixing it would mean building five real integrations; the E-series
disposition allowed "fix or honestly remove". Removed, along with its
service. `pm_integrations` was checked before removal and holds **zero
rows across zero projects**, so nobody had ever "connected" and nothing
was stranded. The table is left in place rather than dropped, per the
repo's database rules.

### The five app integration panels, corrected

These were worse than the hub, because they wrote fabricated content
into the user's own project rather than only displaying it:

- **PPFG** inserted two risks into the risk register reading "PPFG: High
  Overpressure Zone Detected" and "Significant ramp in pore pressure
  detected at 3200m based on Eaton calculation", each scored 20 and
  tagged `ppfg_source: true`, then wrote "Imported 2 critical risks" to
  an integration log. Nothing was ever read from the PPFG app. **Removed
  entirely**: inventing engineering findings in a register that people
  act on is the most serious thing found in this phase.
- **Geomechanics** inserted an MEM report deliverable already marked
  **Approved**, after a half-second wait commented "simulate verifying
  MEM completion" that verified nothing, and pushed a drilling task
  carrying a mud window of "1.20 - 1.45 SG", a value written into the
  source file. The deliverable is now a draft, and the task asks the
  engineer for the window instead of supplying one.
- **Log Facies, BasinFlow and Velocity** each inserted deliverables
  pre-set to **Approved** or **Under Review**. All now create drafts.

Every panel carried a green **Connected** badge. All five now say
plainly that there is no live link to the app yet and that nothing is
read from it, and what they offer is described as what it is: planning
items added to this project.

The honest actions were kept. Creating a milestone or a standard task
list is a legitimate template the user asked for, and claims nothing.

## 2. AFE Cost Control Manager

### JV partners were fictional and unsaved

The Joint Venture tab held its partners in React state seeded with
**"Partner A Corp" at 30 percent and "Partner B Ltd" at 15 percent**.
Every user who opened the tab met the same two invented partners, could
generate a billing statement PDF against them, and lost anything they
typed on reload.

Migration `20260829830000` adds `afe_partners`, scoped through the
parent AFE. Partners are now real records that persist with the AFE, and
the tab opens empty.

### A billing hazard closed

`calculatePartnerCosts` computed the operator share as 100 percent less
the partner interests, with nothing checking that the interests add up.
A mistyped interest produced a **negative operator share**, which bills
out more than the cost, silently. The function now reports the partner
total, whether it is valid, and a sentence saying what is wrong, and the
tab shows it. A shortfall is still valid, because the operator may
simply hold the balance.

### The first tests on this app's math

19 of them, over the earned-value metrics, the S curve and the JV split:
budget, commitment and actual roll-ups, the forecast rule (entered
forecast, else the greater of budget and committed spend), variance,
earned value weighted by budget, CPI as earned value over actual cost,
SPI against elapsed time with the simplification stated, division-by-zero
on an empty AFE, and the identity that matters for billing: **the split
allocates every currency unit exactly once**.

### A help guide

Explaining the four numbers per cost line, how the forecast and the two
indexes are derived, what the schedule index's time approximation means,
and where this stops being cost control and would need accounting.

## 3. Technical Report Autopilot

The E2 audit established that this app's backend is gone: it calls a
hardcoded Heroku host that returns a 404 on every path, root included,
so report generation, the report-type list and DOCX export are all
unreachable.

**Owner decision taken 2026-08-29: REBUILD onto Supabase edge
functions.** Delivered the same day; see the section at the end of this
document. What E4 fixed first was the experience in the meantime. The app used to
dump the 404 page's HTML into a red box headed "Technical Report
Autopilot crashed", which reads as though the user broke something.

It now distinguishes an absent service from a real error and says:
report generation is unavailable, nothing you entered caused this, there
is no setting that will work around it, and the rest of the app still
works so you can build a brief and save it as a project for when
generation is restored. The Generate button is disabled rather than
offered into a void. A genuine application error still shows as an
error.

## Verification

- Jest: 19 AFE math tests, 12 E4 guard tests, full suite green.
- `npm run build` clean.
- Migration `20260829830000` **APPLIED 2026-08-29** after a
  rollback-wrapped dry run. Post-apply probe: table present, RLS
  enabled, one policy.
- `pm_integrations` verified empty before the hub was removed.

## Left open

- **The owner decision on Technical Report Autopilot**: rebuild the
  generation path onto Supabase edge functions like the rest of the
  Suite, or archive the tile. It is Active in the catalog today with its
  core function unreachable.
- Real cross-app integration for PM Pro, if it is wanted. It should read
  the Suite's own saved artifacts rather than simulate a connection.
- `src/utils/digitizerApi.js` still points at the same dead host and has
  zero importers; it belongs to Geoscience.

---

# The rebuild (owner decision, 2026-08-29)

The owner's call on the finding above was to rebuild the generation
path onto Supabase edge functions like the rest of the Suite, rather
than archive the tile. Done.

## Where each piece went

The old app made four calls to the dead host. Only one of them ever
needed a server.

| Old call | Now |
|---|---|
| `GET /trp/templates` | **Client-side.** Report types and their sections are static configuration in `src/data/reportAutopilotTemplates.js`. They never needed a network call, and moving them means the app opens, the brief is fillable and a project is saveable even when the writer is down. |
| `POST /trp/generate` | **Edge function `report-autopilot`.** The one thing that genuinely needs a server: it holds the model key. |
| `GET /trp/export-docx` | **Client-side.** A .docx is a zip of OOXML parts and the Suite already ships JSZip, so the document is assembled in the browser from the sections on screen. No round trip, no download link into a service that can disappear, and what is exported is exactly what was reviewed. |
| `POST /trp/upload` | **Client-side, and honest.** Text and CSV attachments are read in the browser and their contents travel with the brief, so an attachment now actually reaches the writer. Before, files were posted to the service, an id came back, and nothing was ever read. Anything the browser cannot read as text is refused by name rather than accepted and silently ignored, which is what "uploaded" used to mean. |

## The generation prompt

The standing hazard in a report generator is invention: a model asked
for a drilling report will supply an ROP nobody measured. The system
prompt is built around stopping that. It may use only the facts given;
where the brief asks for something the inputs do not support it must
say so in one plain sentence rather than fill the space; it may not
restate a number to more precision than it was given; and where the
inputs contradict each other it must name the two facts that conflict
rather than choose one silently.

Sections are written independently and in parallel, each with the whole
context. A chained generator starts inventing continuity between
sections that is not in the data.

Each section carries a `brief` written as an instruction to a report
author rather than as prose, so the model has something specific to
answer. Temperature is 0.2, because a report is not a place for
invention. Length is budgeted from the requested detail level and page
count and capped, and the request is bounded at twelve sections and
60,000 characters of context so it cannot be used as a bulk-completion
proxy.

## What is still honest about it

The preview still says, in the app, that this is an AI-generated draft
to be reviewed before distribution, and the exported document carries
the same line in its footer. That is not boilerplate: the generator is
constrained to the user's facts, but a draft assembled by a model is a
draft.

The outage panel E4 added is kept and now covers the case that remains:
the function reachable but unconfigured, or the model call failing. A
brief the user can fix, such as selecting no sections, gets a toast
telling them what to change rather than an outage banner.

## Verification

- Jest **394 suites / 5575 tests green**, including 14 on the DOCX
  writer (every OOXML part Word needs, XML escaping, empty reports) and
  8 on the rebuild itself (the dead host is gone from the tree,
  generation goes through the edge function, the app opens with no
  network call at all).
- `npm run build` clean.
- `report-autopilot` deployed (script 64.59 kB) and smoke-tested live:
  unauthenticated requests are refused 401 at the gateway.
- `OPENAI_API_KEY` was already set as a function secret.

## Still open

- `src/utils/digitizerApi.js` is now the last reference to the dead
  Heroku host in the repo. Zero importers, and Geoscience rather than
  Economics, so it is left for whoever next touches that module.
- PDF and spreadsheet attachments cannot be read in the browser. The
  app says so and tells the user to paste the figures into the notes.
  Server-side extraction would need a storage bucket and a parser.
