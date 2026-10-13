# Material Balance Studio videos: plan

Owner GO 2026-10-13, with added scope the same day: three reservoir types and
an animated contact movement in a demo. Voice Daniel, oilfield units, feet,
4K, `expectText` on every number spoken.

## Data

| Reservoir | Source | Truth |
|---|---|---|
| Ekene, undersaturated oil, no gas cap, no aquifer | kit `09-reservoir/ekene-mbal-tank-history.csv` | 12,139,208 stb (the volumetric STOIIP) |
| Ekene to 2025, under waterflood | `ekene-mbal-tank-history-2025.csv` (seed/mbal_assets.mjs) | the same N with injection in F |
| Ekene gas-cap scenario | `ekene-gascap-scenario-history.csv` + truth json (seed/mbal_companions.mjs) | N 18.0 MM stb, m 0.45, Carter-Tracy aquifer |
| Oboro gas scenario | `oboro-gas-scenario-history.csv` + truth json (seed/mbal_companions.mjs) | G 60 Bscf, volumetric |

All five files are in the ekene-demo-v4 release. The booked volumetric case
is the RCP project seed/mbal.mjs saves ("MBAL demo: Ekene booked volumetric").

## Demos (5:00 or less)

1. `mbal-01` From pressure history to oil in place (Ekene): case, import door,
   row PVT, compressibilities, 12.14 MM stb at r2 1, Havlena-Odeh, level
   Campbell, DDI 0.607 / CDI 0.393, rock compressibility range 10.50 / 12.14 / 13.16.
2. `mbal-02` A gas cap, an aquifer and moving contacts (gas-cap scenario):
   18.00 MM stb, DDI 0.284 / GDI 0.398 / WDI 0.299, climbing Campbell,
   influx, history match 18.064, contacts through time (OWC up 25.4 ft, GOC
   down 25.6 ft, 59.0 ft of oil left).
3. `mbal-03` When the data changes (Ekene to 2025): volumetric estimate from
   ReservoirCalc Pro by id, flood-era surveys with injection, 12.14 MM stb on
   12 surveys, WIDI 0.394; without injection 16.66 at r2 0.7940; methods
   table; ReservoirCalc Pro cross-check.

## Lessons: Material Balance with Petrolord

| Module | Lesson | Reservoir |
|---|---|---|
| A Foundations | 1 The studio and a new case; 2 Data in: the import door; 3 PVT and rock | Ekene |
| B Oil without support | 4 Havlena-Odeh: the straight line; 5 Is there an aquifer?; 6 The pressure history match | Ekene |
| C Gas cap and aquifer | 7 The gas cap ratio m; 8 Aquifer models; 9 Contacts through time | gas-cap scenario |
| D Gas | 10 A gas reservoir: p/z and Cole | Oboro gas scenario |
| E Changes and handoffs | 11 Injection in the balance; 12 The report and the handoffs | Ekene to 2025, Ekene |

## App fixes on the way (all merged)

#1049 a pressure that rises under injection is saved; #1050 Campbell and Cole
axes span 5 percent either side of the level; #1051 the RCP cross-check opens
the volumetric project and never compares a sample workspace; #1052 the PVT
tab says when rows carry their own PVT; #1053 contacts through time (animated
section); #1054 a pot aquifer the data cannot see is flagged.
