# Pore Pressure Studio, PP series (Petrel and Drilling tester readiness, 2026-09)

Status: **planned 2026-09-06**, the next door after Rock Physics Studio in
the Geoscience tester-readiness program (owner's standing instruction:
continue the waves from one Geoscience app to the next). Decisions are
v1 defaults the owner may override. The original build is
PorePressure-PLAN.md and its state PorePressure-STATUS.md.

## Why this app, and why now

Pore Pressure Studio is engine-solid: Eaton, Bowers, the NCT fit, the
overburden integration and the fracture gradient sit on an oracle with
goldens, on the shared shell, with a harness whose seeded well IS the
golden. Its STATUS lists the one gap a driller or a Petrel user meets
first: everything displays in MPa and metres below mudline, while the
people who consume a prognosis read psi, ppg equivalent mud weight and
feet. Its own follow-on list names "EMW/ppg display units for the
Drilling handoff".

| Area | Today | A Petrel or Drilling user expects |
|---|---|---|
| Units | MPa, m below mudline, us/m, kg/m3, no choice | psi or ppg EMW (sg offshore), depth in the account's unit, us/ft sonic, the readout and the charts in those units |
| Handoff | Publish PP/FP/OBG in MPa (the MEM consumer) | Also a prognosis table they can carry into the well plan: pressures and EMW against depth in the chosen units |
| Links | Registry-native wells, no launchers | Open the well in Well Data Manager, Petrophysics Studio or Well Correlation; a help guide |

## Program

| Wave | Theme | One line |
|---|---|---|
| PP0 Units and CSV | display units at the edge, prognosis table | Pressure (MPa, psi, ppg EMW, sg EMW) and depth (the account setting) selectors in the ribbon; readout, charts, dock fields, picks and calibration convert; Prognosis CSV in the chosen units with EMW columns |
| PP1 Links and help | launchers, guide, status | Well data and Open in for the selected well, in-app help guide, STATUS |

## Recorded decisions (v1 defaults, 2026-09-06)

- The engine, the goldens, the saved project and the published curves
  are untouched (SI: Pa, m below mudline, us/m); every wave converts
  at the UI edge (`services/units.js`, pure and tested), and the e2e
  derives converted expectations from the goldens.
- Equivalent mud weight needs a depth below a datum. The reference is
  the rotary table when the dock's mudline MD is set (depth below RKB =
  mudline MD + depth below mudline), otherwise sea level (water depth +
  depth below mudline). The readout, the chart tooltip and the CSV name
  the datum in use. ppg uses the drilling convention EMW = psi / (0.052
  x TVD ft); sg = ppg / 8.3454.
- The sonic slowness and the compaction constant follow the depth unit
  (m: us/m and 1/m; ft: us/ft and 1/ft), the Petrel field-unit pairing.
  Density fields follow the pressure unit (MPa: kg/m3, psi and ppg:
  ppg, sg: sg). Bowers A and B stay in their published ft/s and psi
  form; sigma max shows in MPa or psi.
- Publishing stays in MPa (the Drilling MEM consumer's contract); the
  CSV is the display-unit deliverable.

## Wave log

- **PP0 (2026-09-06), branch `feat/pp0-units-csv`.** Display units in
  the ribbon (`services/units.js`, pure and tested): pressure as MPa,
  psi, or an equivalent mud weight in ppg or sg (EMW needs a depth
  below a datum: the rotary table when the dock's mudline MD is set,
  else sea level; the readout's unit tooltip, the chart axis and the
  CSV name the datum); depth as m or ft with the account's Geoscience
  depth unit as the default through `backend.getDepthUnit` (the harness
  answers m so the oracle-anchored readout stays in metres). The
  readout (its depth text converts, the sample it points at does not),
  the prognosis and NCT charts, the pick input, the dock (water depth,
  mudline MD, densities in kg/m3, ppg or sg following the pressure
  unit, sonic in us/m or us/ft and the compaction constant in 1/m or
  1/ft following the depth unit, sigma max in MPa or psi) and the
  calibration lines all convert at the edge; the engine, the project
  and the published curves stay SI. Prognosis CSV downloads the
  profile in the chosen units with EMW columns in ppg and sg and the
  method, parameters and datum in a comment header. Choices are
  remembered in localStorage. e2e: psi and ppg expectations derived
  from the goldens, the NCT in us/ft and 1/ft, the dock in ft and ppg,
  the 3500 m row of the CSV equals the golden.
