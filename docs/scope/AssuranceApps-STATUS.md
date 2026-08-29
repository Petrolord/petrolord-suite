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

**The archive or rebuild decision remains the owner's** and is not taken
here. What is fixed is the experience in the meantime. The app used to
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
