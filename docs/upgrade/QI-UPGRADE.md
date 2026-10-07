# QI Studio: programme close (Q12)

QI Studio is the app the QI build programme produced (`docs/scope/QI-PLAN.md`,
status in `docs/scope/QI-STATUS.md`). Phases Q0 to Q11 were built and merged
between 2026-10-05 and 2026-10-07 (Suite #891 to #918, engines #312 to #339,
canonical engines d60083a). This document is the Q12 close in the house upgrade
format: the twelve practitioner checks (`docs/scope/AppUpgrade-BestPractices.md`)
run on the finished app, the persona walks, the advancement review and the
backlog left for the next round.

- Route: `/dashboard/apps/geoscience/qi-studio` (+ `/help`), on its own
  licence, the `qi-studio` tile (Geoscience, 1690 a month, included in the
  Geoscience module; migration `20261007130000`).
- Page `src/pages/apps/QIStudio/QIStudio.jsx`; fourteen tabs: Setup, Data
  inventory, Usability, Seismic QC, Well ties, Prestack, AVO, Inversion,
  Simultaneous, Properties, Prospects, Issues, Feasibility, Report.
- Harness `/dev/qi-studio` (in-memory backend: KETA-1 complete, AKOMA-2 with no
  shear or checkshots, BONSU-3 with no elevation and a digitized density; one
  full stack with a footprint stripe every 4 crosslines; three prestack datasets).
- Heavy work runs on the seismic worker (`worker/seismic-worker`, 17 job kinds,
  live at suite-1c4681ed8+engines-d60083a5e since 2026-10-07).
- Saved projects: `saved_qi_studio_projects`
  (`20261006140000_saved_qi_studio_projects.sql`), applied to production
  2026-10-07.

## Evidence kit

| Kit | Where | What it holds |
|---|---|---|
| Engines with goldens | `/root/petrolord-engines` `engines/qi/*`, `test-data/qi/` | Every engine gated on a published table, a pylops or segyio oracle, or a synthetic truth, each with a negative control (QI-STATUS per phase) |
| Worker handlers | `worker/seismic-worker/__tests__` | Every job kind on real fixtures through the handler, run in `deploy.sh` and CI |
| App services | `src/pages/apps/QIStudio/__tests__` (18 suites, 108 tests) | Runners, report read back from the PDF, the UI walk on the in-memory backend |
| Browser | `e2e/qi-studio.spec.js` (6) | The Package 1 audit to the PDF read back with pdftotext; seismic QC with its footprint issue; the prestack chain; every tab at 1366x768 in light and dark (no page errors, no sideways scroll, screenshots); the help link and the gated guide route |

## Step 1: the twelve checks

| Check | Result | Findings | Notes |
|---|---|---|---|
| PL1 Labels mean the textbook | Pass | | Products carry a `qi_class` (elastic_estimate, calibrated_prediction, interpretation, fluid_hypothesis). Uncertainty is labelled Q10/Q50/Q90 (the PT10 rule). Fluid factor is Smith-Gidlow, intercept and gradient are two-term Shuey and say so on the AVO tab. |
| PL2 The hostile file set | Pass | | Vendor aliases (DTCO, RHOZ, PHIT), digitized curves and missing shear are graded on the usability matrix with reasons. Gathers arrive with the offset at byte 37 by default and the byte is editable. |
| PL3 Units, datums and frames | Pass | | Wells without an elevation are refused for time work and say why (BONSU-3). Times are TWT ms throughout; depths on the prospect tab are TVDSS elevation as the surfaces registry stores them. |
| PL4 No claim without the event | Pass | | Server results only show once the job has succeeded. QI never sets Pg: Prospects hands a record to Risked Reserves Valuation. An absent anomaly lowers confidence only where feasibility says the case is visible. |
| PL5 Real saved state | Pass | | The saved-projects table is applied (2026-10-07). Before the apply the app detected the missing table and said so (tested). `.pld` carries `saved_qi_studio_projects` (#908). |
| PL6 Real browser | Failed, fixed | QI-U1-002, 003 | Six browser tests green. The dark theme check had not switched the app to dark (it used the media query, which the Suite scope ignores); it now uses the theme toggle and asserts its state. |
| PL7 The report a reviewer can sign | Failed, fixed | QI-U1-002 | The PDF was titled "QI Data Audit and Feasibility Report" while carrying the ties, AVO, angle wavelets, prospect assessment and handover. Retitled "Quantitative Interpretation Report"; the header, page description and help say the same. |
| PL8 The practitioner's day | Pass, gaps recorded | | Persona walks below. |
| PL9 The chain | Pass | | Reads the wells registry, Seismolord volumes and tie wavelets, Rock Physics work and depth surfaces. Writes v4 volumes Seismolord opens, SEG-Y exports, run records, and the prospect record Risked Reserves Valuation shows (QiEvidenceCard). |
| PL10 Real scale | Pass | | 10 GB SEG-Y upload and server conversion accepted in Q0; volume jobs stream bricks; gathers live in the worker store. Open-dataset scale runs wait for the licence check. |
| PL11 Inputs a person can type | Failed, fixed | QI-U1-001 | Every number field keeps typed text. But a cleared field reached the job as 0: a blank mean angle on AVO and Simultaneous ran at 0 degrees, a blank model cut or regularisation weight on Inversion ran at 0. Now the run is held with a message. |
| PL12 House standards | Pass | | White charts with ChartLogo; no em dashes or contrastive copy; route gated; EMPTY_VALUE in tables. |

### Findings

| ID | Severity | Finding | Fix |
|---|---|---|---|
| QI-U1-001 | S2 | A cleared number became 0 and the job ran: AVO and Simultaneous mean angle (0 degrees is in range, so the check passed), Inversion model cut and regularisation weight. A user who cleared a box to retype it and pressed Run got a wrong answer they would trust. | `avoProblem` and the Simultaneous check refuse a blank angle; Inversion holds the run with "Give the low-frequency model cut, 2 to 20 Hz." or "Give the regularisation weight, zero or more." Tested in the UI walk. |
| QI-U1-002 | S3 | Report and header titled the study as the Package 1 audit only. | Retitled throughout (above). |
| QI-U1-003 | S4 | The e2e dark-theme check did not reach dark mode. | Toggle clicked and asserted. |

### Persona walks (PL8)

**1. QI lead opening a new study (Package 1).** Chooses three wells, a target and
the seismic date on Setup. Usability grades KETA-1 good, AKOMA-2 limited (no
shear, no checkshots), BONSU-3 missing (no elevation), and a click on a cell
gives the reason. Issues are suggested from the matrix, highest first; a
dismissed one sinks. Records a feasibility verdict and downloads the report;
the PDF carries the matrix reasons and the verdict (e2e test 1).

**2. Seismic interpreter checking the data.** Runs seismic QC on the full stack:
spectra, the -6 dB band, signal-to-noise and the footprint, with the 4-crossline
stripe found and sent to the issue register (e2e test 2). On Prestack, builds
the gather store, angle stacks with a velocity table, trims the gathers and QCs
them (residual moveout, stretch, fold) (e2e test 3).

**3. Inversion specialist.** Reads the wells into impedance in time, checks
blind wells, runs the sensitivity spread, inverts the volume and exports SEG-Y
with a run record; then calibrates porosity from impedance with Q10/Q50/Q90
volumes (jest UI walk). Gap recorded: the app measures the gathers but has no
gather panel at a well to look at them (backlog U2-004).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

Compared with the capabilities Hampson-Russell (Strata, AVO, Emerge), Jason,
RokDoc and Petrel's QI modules describe in their product literature; links not
re-checked in this round.

| Capability | Leaders | Ours | Gap |
|---|---|---|---|
| Data audit and usability | Done by hand in spreadsheets | Inventory, usability matrix with reasons, issue register | ahead |
| Seismic and prestack QC | HRS, Petrel | Spectra, SNR, footprint; residual moveout, stretch, fold | partial (no gather display) |
| Conditioning | HRS: trim, Radon, f-x, SOF, spectral balancing | Trim statics, stack matching | partial (Radon, f-x, SOF deferred) |
| Ties and wavelets | All | Multi-well field wavelet, per-stack angle wavelets | parity |
| AVO | HRS AVO | Intercept, gradient, fluid factor, chi, at the wells against modelled | parity on stacks; no gather-based AVO |
| Post-stack inversion | Strata, Jason | Coloured, model-based, blocky, sparse spike, blind wells, spread | parity |
| Prestack inversion | Strata, Jason | Fatti simultaneous with per-stack wavelets, blind wells | partial (no geostatistical inversion) |
| Facies and properties | Emerge, RokDoc | Porosity transform with Q10/Q50/Q90, Bayesian facies in 1D and 2D | partial (no neural or multi-attribute regression) |
| Prospect integration | Petrel | Trap, anomaly fit, evidence independence, assessment table to RRV | ahead in the chain |
| Server compute | Desktop or cluster licences | Shared seismic worker, org quota | ahead for small teams |

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| Radon multiple attenuation, f-x deconvolution, structure-oriented filtering | QI-STATUS C9 | Still wanted once a client delivers gathers with multiples (U2-001) |
| Vintage and processing-version linking (stack family) | QI-PLAN Q3 | The per-stack angles, matching and wavelets cover a single survey; linking waits for a 4D client (U2-006) |
| Gather panels at wells and prospects | QI-STATUS C8 | Wanted (U2-004) |
| Survey-wide spectral shaping per stack | QI-STATUS C9 | Only if a study needs bandwidth matching (U2-005) |
| Open-dataset benchmark (Volve, F3) | QI-PLAN | Waits on the owner's licence check (U2-002) |

### 2c. Suite integration

Reads geo_wells and logs, tie wavelets, Seismolord volumes and horizons,
Rock Physics work, depth surfaces. Writes seismic_volumes (derived, v4), qi_jobs,
qi_datasets, SEG-Y exports, the RRV prospect record and `.pld`.

### Ranked backlog

| Rank | ID | Item | Size |
|---|---|---|---|
| 1 | U2-002 | Benchmark the whole chain on Volve (prestack, wells with shear) and F3; record blind-well errors in QI-STATUS | L |
| 2 | U2-003 | ~~Owner tile and price for QI Studio~~ Done 2026-10-07: own tile, 1690 a month | S |
| 3 | U2-004 | Gather viewer at a CDP and at wells, with the mute and the trimmed result beside it | M |
| 4 | U2-001 | Radon, f-x and structure-oriented filtering on the worker (engines first) | L |
| 5 | U2-005 | Per-stack shaping filter that keeps relative amplitudes | M |
| 6 | U2-006 | Vintage and processing-version linking | M |
| 7 | U2-007 | Offer the Simultaneous pulls, Vs/Vp and model cut on the tab (the job already takes them) | S |
| 8 | U2-008 | Simultaneous blind-well results to the issue register | S |

### Owner items

1. ~~Apply `20261006140000_saved_qi_studio_projects.sql`~~ Applied 2026-10-07.
2. ~~Decide the QI Studio tile and price~~ Done 2026-10-07 (U2-003); apply `20261007130000` before the next zip.
3. The Volve and F3 licence check for the benchmark (U2-002).
4. ~~Cut the Suite zip~~ Live 2026-10-07 (dc206c539).
