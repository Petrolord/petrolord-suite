# QI Studio: status

QI programme Q1, Milestone A4 (2026-10-06). Route `/dashboard/apps/geoscience/qi-studio` (help at `/help`); dev harness `/dev/qi-studio`.

## What it is

QI Studio holds the first package of a quantitative interpretation study: the data audit and the feasibility (SOW sections 2 to 4). It reads the Suite's shared records and never changes another app's data.
- **Setup:** wells (the registry), target intervals (zone names shared by the wells), Seismolord volumes, the seismic acquisition date, and each well's first production date.
- **Data inventory:** 18 groups across wells, seismic, interpretation and reports. Each has a state (requested, received, usable, missing, outstanding), a received date and a note. States are suggested from the registries where the Suite holds the data.
- **Usability matrix:** each well against each target is good, limited or missing.
  - The items are the curve families over the zone (judged on recorded extent; digitized curves count as limited), checkshots, the depth reference and the survey, each with the reason.
  - A depletion flag appears when seismic was acquired after first production.
- **Issue register:** the matrix suggests one issue per well and gap kind, with a remedy. The user keeps, resolves or dismisses them, and adds their own.
- **Feasibility per target:** a verdict, separability, detectability and the recommended route.
- **Seismic QC** (A5): a `seismic_qc` job per chosen volume on the seismic worker. It measures:
  - spectra, peak and the -6 dB band per time window;
  - signal-to-noise from neighbouring-trace coherency;
  - the acquisition footprint on RMS maps.

  The result is kept with the project, and its issues can be added to the register.
- **Well ties** (A6): each well's committed Seismolord tie, the tie wavelets compared and averaged (the field wavelet), and tie issues to the register.
- **Inversion** (Q8a): post-stack impedance on the seismic worker: wells read into impedance in time, the wavelet from the ties, horizons for the low-frequency model, model-based, blocky, sparse-spike or coloured; the blind-well check, the volume run (a new volume in Seismolord), issues to the register.
- **Sensitivity** (Q8a): scenarios over the wavelet, the model cut and noise; the blind-error spread at the wells; AI at Q10, Q50 and Q90 and the relative spread as volumes.
- **Properties** (Q9a): porosity (Q10, Q50, Q90) or Bayesian facies (probabilities and the most likely code) from an impedance volume, calibrated at the wells and checked by leaving each well out.
- **Prospects** (Q10): the trap on a depth surface, the anomaly's conformance to structure, evidence independence, competing explanations, the QI recommendation, and the qi-prospect-1 record read by Risked Reserves Valuation.
- **Handover** (Q11): SEG-Y of every product from the seismic worker, run records, wavelet text files, and .pld portability of the study.
- **Data matrix** (Project Data Inventory, 2026-10-11): the start-of-project data grid, built from the registries with no typing.
  - The study's wells against 26 data columns, with coverage of the target interval read from the curve samples. Hole condition comes from caliper and DRHO.
  - The study's volumes (type, format and bits, IL/XL, area, sample rate, record length, CRS, size, domain), plus horizons, faults, maps, velocity, ties and wavelets.
  - Rule-based notes, each with impact, workaround, uncertainty and mitigation; readiness for seven workflows; items held outside Petrolord.
  - Presentation view, PNG, PDF and CSV.
  - Hand-set states and items are saved in the project payload (`dataInventory`), so no migration. The shared core is `src/lib/projectInventory`, the board is `src/components/projectInventory`.
  - The tab is appended after Report, so the recorded tabs (Setup to Report, including the Data inventory register) keep their names, order and positions.
- **Gathers** (QI upgrade P1.7, 2026-10-15): the gather viewer, a tab appended after the Data matrix. The `gather_panel` worker kind reads one CDP, part of an inline or crossline (up to 24 gathers) or the gathers at the study wells from a gather store (and its trimmed copy beside it), as one float32 panel behind a two-hour link (the janitor removes panels after six hours). Variable density or wiggle; Walden angle contours, stretch mute and angle mute from the velocity table (engines `qi/gatherDisplay.js`); residual moveout picks and the fitted parabola at the event times with the prestack QC's coherence rule; the stored QC reading where the QC sampled the CDP; NMO for a store recorded as not corrected. Closes QI-UPGRADE U2-004.
- **Report:** the QI Data Audit and Feasibility Report on the shared Report Kit, with the executive summary, the QC, tie, inversion, sensitivity, property, prospect and handover tables, and the QI class definitions.

## Decisions

- **Access:** opens on a Seismolord or Rock Physics Studio licence (`appId={['seismolord','rock-physics-studio']}`), the way Contour Map Digitizer opens on Mapping & Surface Studio. There is no `master_apps` row, hub tile or price. Listing and pricing it is an owner item.
- **Reach:** a "QI Studio" link in the Rock Physics Studio ribbon, and the help guide.
- **Saving:** `saved_qi_studio_projects` (migration `20261006140000`, NOT APPLIED; owner applies), under the record-sharing rules. Until it is applied the page says saving is not switched on.
- **Computed, never saved:** the usability matrix and the suggestions are recomputed from the registries on every open.

## Tests

- `__tests__/services.test.js` (11): rules, with negative controls.
- `__tests__/qiStudio.test.jsx` (5): an end-to-end walk on the in-memory backend, a saved project round trip, the note before the migration, and the report read back from the PDF.
- `__tests__/helpGuide.test.jsx` (2).
- `__tests__/inversionRun.test.js` (17): the run module on a synthetic survey with dipping horizons; blind wells for each method; no horizons as the negative control.
- `__tests__/inversionWells.test.js` (8), `__tests__/inversionReport.test.js` (4), `__tests__/propertyRun.test.js` (11), `__tests__/prospects.test.js` (6), and the Inversion, Properties and Prospects walks in `qiStudio.test.jsx`.

## Owner items

1. Apply `20261006140000_saved_qi_studio_projects.sql`.
2. Decide whether QI Studio gets its own Geoscience tile and price.

## Upgrade P1-P2 (owner GO 2026-10-14)

- **P1.1 Light governance (2026-10-15):** an "Objectives and acceptance criteria" box on Setup (study text, optional line per target; payload `objectives`), and decisions in the issue register (gate Data QC, Feasibility, Pilot or a named gate; outcome, decision, by whom, date, the run or version it rests on; saved in `issues` with `type: 'decision'`, shown in their own table under the register and never counted as issues). Both are printed in the report. No workflow engine and no enforced sign-off. Tests `__tests__/qiGovernance.test.jsx` (7).

- **P1.2 Truly blind wells (2026-10-15):** a held-back well is out of the low-frequency model, the wavelet scale or coloured operator, the background Vs/Vp and the wavelet average (field or angle wavelets rebuilt without it), for post-stack, simultaneous and property checks. Inversion volumes record each well's held-back estimate (`blind_traces`, packed) and the property check predicts from it. The protocol is printed under each blind table and in the report. Simultaneous blind results go to the issue register (U2-008). Tests: worker `poststackInversion`, `prestackInversion`, `propertyPrediction` (hand-built references plus the old protocol as negative control), `__tests__/qiBlindProtocol.test.js`.
- **P1.4 Inversion trust outputs (2026-10-15):** a seismic residual volume (input minus the synthetic of the inversion) for post-stack and, per stack, simultaneous runs; the residual at each well in the blind results; the density gate decides whether density is written (farthest stack 25 degrees, median blind density correlation 0.5 over two wells or more), with its reason, while AI, SI and Vp/Vs are always written; the Simultaneous tab's Settings offer the pulls, Vs/Vp, model cut and gate (U2-007).

- **P1.3 NTG and Sw (2026-10-15):** net-to-gross (an NTG or net-flag curve, or a net flag from Vsh and porosity cutoffs) and water saturation from impedance beside porosity, Q10/Q50/Q90 held within 0 and 1; each volume is written only when its blind check passes the gate (fully blind, two wells or more, every left-out well at correlation 0.5 or more and 60 to 95 percent inside Q10 to Q90; editable), enforced in the panel and on the worker (`gate_failed`). Sw is a fluid hypothesis.

- **P1.5 Maps from volumes (2026-10-15):** a Maps tab (appended last) and the worker kind `zone_maps`: zone statistics between two horizons or a horizon and a window (property maps from a Q50, confidence maps from the Q90 minus Q10 spread, facies probability maps, mean, RMS, min, max and the share beyond a cutoff), saved as attribute surfaces of the stack in the shared registry (`saveZoneMapAsSurface`, carrying the current Suite project), which Seismolord and Mapping & Surface Studio show and export. Runs kept in the payload `maps`; the report lists them.
