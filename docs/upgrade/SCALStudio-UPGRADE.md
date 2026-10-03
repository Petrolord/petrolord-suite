# SCAL Studio: comprehensive upgrade

App #5 of the Reservoir round of the upgrade programme
(`docs/scope/AppUpgrade-Reservoir-PLAN.md`). Step 1 (the practitioner lens
PL1 to PL12 of `docs/scope/AppUpgrade-BestPractices.md` and the reviewer lens
RL1 to RL12 of `docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`) is run
and fixed on branch `feat/scal-u1`, from 2026-10-03. Step 2 (advancement
review) is analysis only; the programme lead chooses the batches.

- Route: `/dashboard/apps/reservoir/scal-studio` (ProtectedAppRoute, slug `scal-studio`).
- Harness: `/dev/studio/scal` (in-memory Supabase double).
- Scope lock: thin-real (owner, 2026-07-17 and 2026-07-18; plan owner question 13): Corey relative permeability and Leverett J capillary pressure only. No new physics in Step 1.
- Earlier cycles: SC1 to SC7 (2026-07-18), senior test T1 (2026-09-26), design system 1D.

Work in progress. The Step 1 table, the report, the `kr-1` contract and
Step 2 are written as the items land.

## Findings (running)

Severity: S1 wrong answer with no warning; S2 wrong or lost data, or a door
that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| SCAL-U1-001 | S1 | PL1, RL8 | The averaged J of several core samples normalised each sample with its own Swirr (just under its own lowest Sw) and mapped the averaged fit back to true Sw with one Swirr (under the lowest Sw of all samples). Two rocks generated from one true J curve whose data start at Sw 0.15 and 0.30 came back with J 16 percent low at Sw 0.5 and 49 percent low at Sw 0.2, refit r2 0.989, no warning. Pc, the saturation-height profile and the Sw that Petrophysics, Earth Modeling, Rock Physics and ReservoirCalc Pro read from a SCAL project (all through `buildJSpec`) follow it. An override at or above one sample's lowest Sw was silently ignored for that sample. | Probe; `scalU1Swirr.test.js` with the old path as negative control. | Fixed: one Swirr (the override, or the lowest Sw of all included samples less 0.02) normalises every sample and maps the fit back; an override that is not below every sample's lowest Sw is refused with the sample named. Samples that start at the same Sw (the demo pair) are unchanged to 1e-12. Changes numbers for multi-sample projects whose samples start at different Sw, in SCAL and in the four consumers. |
