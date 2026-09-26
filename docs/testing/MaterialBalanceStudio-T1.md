# Material Balance Studio: senior test T1

- App: Material Balance Studio (`/dashboard/apps/reservoir/material-balance-studio`)
- Wave / position: Wave 2, #19 (Senior Testing Programme)
- Build tested: main after Fluid Studio T1 (#646)
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark: Petex MBAL
- Coverage before T1: MB1 to MB7, 11-case validation harness; light human walk; no e2e

## How it was tested

The app keeps its cases in `rb_*` tables and computes in the `calculate-mbal`
edge function, so the `/dev` route showed an empty studio. T1 built a
harness: an in-memory copy of the `rb_*` tables seeded with Tarek Ahmed
Example 11-3 (Table 11-3, depletion-drive oil) and a `calculate-mbal`
stand-in that runs the canonical engine in the browser with the edge
function's own row mapping. This is the app's first end-to-end test.

## Verdict

**Demo-ready after T1.** The engine is right: on Ahmed 11-3 it returns
OOIP 291.3 MMSTB, R squared 0.993, depletion drive, drive indices summing
to 1.01, and an independent recomputation of the free-intercept Havlena-Odeh
regression gives the same 291.3. The defects were in the workflow: once a
case was created its name and initial conditions (initial pressure,
temperature, Sw, Pb) could not be changed, although three messages sent the
user to an "Overview tab" that no longer exists and the create dialog
promised the fields could be edited later.

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| MB-T1-001 | S2 | No editor for a case's initial conditions; copy pointed to a missing Overview tab | Edit case on the case card (the create form in edit mode, saving through `updateCase`); copy points to it |
| MB-T1-002 | S2 | Empty right rail (shared layout) | Fixed in #646 |
| MB-T1-003 | S3 | Left rail clipped long names and values (Radix ScrollArea grows to its widest child) | Shared `StudioLayout` rails use plain scrollers; names truncate |
| MB-T1-004 | S3 | Case picker read "Select Project", "Create new project" | Shared picker takes the noun from its label ("case") |
| MB-T1-005 | S3 | Havlena-Odeh subtitle said the line runs through the origin while the fit has a free intercept | Subtitle corrected; intercept shown in the fit box |
| MB-T1-006 | Observation | OOIP on Ahmed 11-3: 291.3 MMSTB free intercept, 282.8 through the origin, Ahmed's graphical 257 (volumetric 270.6); the harness passes it within 15 percent | Offer a through-origin fit for no-aquifer, no-gas-cap cases in the engine; after NAPE |
| MB-T1-E1 | Enhancement | Harness with the real engine and a published case | Built (`/dev/material-balance-studio`) |

## Tests

`e2e/material-balance-t1.spec.js` (rail layout, run, intercept, edit case);
reservoir-balance and studio jest; the Well Test Analysis and other
StudioLayout e2e still pass.
