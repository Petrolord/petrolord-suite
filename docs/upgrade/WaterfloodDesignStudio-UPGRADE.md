# Waterflood Design Studio: upgrade (Reservoir round, app 6)

Step 1 (the two lenses, PL1 to PL12 and RL1 to RL12, with fixes) and the
Step 2 analysis. Branch `feat/waterflood-u1`, worktree `/root/wt-res-wf`.
Started 2026-10-04.

Read first: `docs/scope/AppUpgrade-Reservoir-PLAN.md`,
`docs/scope/AppUpgrade-Reservoir-GapMatrix.md` (section 4.8),
`docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`,
`docs/scope/ReportKit-DESIGN-AND-STATUS.md`,
`docs/upgrade/SCALStudio-UPGRADE.md` (kr-1),
`docs/upgrade/FluidSystemsStudio-UPGRADE.md` (pvt-1),
`docs/scope/WaterfloodDesignStudio-STATUS.md`.

- Harness: `/dev/studio/waterflood` (in-memory Supabase double).
- Status: in progress. Sections below fill as items land.

## 1. Step 1 checks

(filled as the walk proceeds)

## 2. Findings

| ID | Sev | Check | Finding | How found | State |
|---|---|---|---|---|---|
| WF-U1-001 | S3 | PL4 | The right rail's Surveillance "Alerts" read `.length` of the alerts object and always printed 0, while the sample carries a Hall injectivity alert. | Browser walk (rail showed 0 beside an alert badge); code. | Fixed: `countAlerts`; `wfU1Honesty.test.jsx` (negative control: the old reading gives 0). |
| WF-U1-002 | S4 | PL12 | Missing values printed '-' (studio `fmt`, rail) and 'N/A' (Surveillance KPIs). | Code. | Fixed: `EMPTY_VALUE` everywhere in the app's own files. |
| WF-U1-003 | S3 | RL7, PL1 | "Avg VRR" in the KPI panel was the cumulative reservoir-barrel ratio ("Cumulative VRR" in the rail); KPI titles were truncated at 1366 ("Avg W...", "Total I..."). | Browser walk at 1366x768. | Fixed: "Cumulative VRR"; titles wrap, six tiles in a row only from 2xl. |
| WF-U1-004 | S2 | PL1, RL7 | The five-spot areal sweep correlation (Craig's data, Willhite's regression) was entered with the endpoint mobility ratio (krw at Sor). Craig correlated the sweep with M taken with krw at the average water saturation behind the front at breakthrough. On the sample M 4.00 against 1.53, EA at breakthrough 53.9% against 62.5%: the forecast understated sweep, delayed nothing and moved breakthrough early. | PL1 quantity table against Craig (1971) and Ahmed ch. 14. | Fixed engines-first (PR #304): `arealSweepMobilityRatio`, `pattern.mobilityBasis: 'craig'`; the engine default stays 'endpoint' for the course fixtures. The app: new projects use Craig, saved projects keep the endpoint basis with a note and a switch (see 2.x). Gate `waterflood.wfu1.test.js` block 1; negative control fails 2. **Moves numbers.** |
| WF-U1-005 | S2 | PL1, RL5 | Surveillance totals (oil, water, injection) and the cumulative VRR summed the daily RATES of the rows: right on a daily file, about 30 times low on a monthly file (totals), and rate-weighted VRR on an irregular one; the rolling window counted rows. | Code; the Ekene course fixture records the same defect ("rows as days"). | Fixed engines-first (PR #304): `time_weighting: 'calendar'` (rate x days to the next row; calendar-day window), passed by the app; engine default unchanged for the course fixture. Daily files unchanged; the Ekene monthly file comes back to its ledger VRR within 1.2e-5. **Moves numbers for non-daily files.** |
| WF-U1-006 | S3 | RL6, RL8 | Hall plot: the baseline and recent slope windows were not drawn, no fitted lines, slopes with no interval (H11 fixed the axes only). | Gap matrix; code. | Fixed: engine returns both windows (line, 95 percent interval, r2, dates); drawn on screen and in the report (see the report item). |
| WF-U1-007 | S4 | PL12 | Chan mechanism labels and one recommendation note carried em dashes. | Browser walk (Surveillance tab). | Fixed in the engine copy (PR #304). |

## 3. Step 2 analysis

(after Step 1)
