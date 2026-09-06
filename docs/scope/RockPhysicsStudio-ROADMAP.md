# Rock Physics Studio, RP series (Petrel tester readiness, 2026-09)

Status: **planned 2026-09-06**, the next door after ReservoirCalc Pro in
the Geoscience tester-readiness program (owner's standing instruction:
continue the waves from one Geoscience app to the next). Decisions are
v1 defaults the owner may override.

## Why this app, and why now

Rock Physics Studio (G6) is engine-solid: Batzle-Wang fluids, Gassmann,
Greenberg-Castagna Vs, AVO and the wedge all sit on an independent
oracle with goldens, on the shared shell, with a harness and e2e. What a
Petrel user meets is at the edges:

| Area | Today | A Petrel user expects |
|---|---|---|
| Units | Everything in SI (m/s, kg/m3, metres) with no choice | Velocity in ft/s or slowness in us/ft, density in g/cc, depth in the account's unit; the numbers they compare against Petrel's Quantitative Interpretation |
| Outputs | Display and a saved scenario only; substituted logs leave the app nowhere | Substituted Vp, Vs and density written back to the well as logs (the fluid-substituted case Seismolord ties and Well Correlation displays) |
| Links | Registry-native wells, no launchers | Open the well in Well Data Manager, Petrophysics Studio or Well Correlation; a help guide |

## Program

| Wave | Theme | One line |
|---|---|---|
| RP0 Units | display units at the edge | Velocity (m/s, ft/s, us/ft), density (kg/m3, g/cc) and depth (the account setting) selectors in the ribbon; tables, charts, zone labels and manual AVO halfspaces convert; SI stays internal |
| RP1 Publish | substituted logs to the registry | VP_SUB, VS_SUB, RHOB_SUB over the well (original outside the zone, substituted inside) with full provenance, overwrite-own; both backends |
| RP2 Links and help | launchers, guide, status | Open-in launchers for the selected well, in-app help guide, STATUS |

## Recorded decisions (v1 defaults, 2026-09-06)

- The engine and the goldens are untouched; units convert at the UI edge
  (`services/units.js`), and the e2e derives converted expectations from
  the goldens.
- Published curves are SI (m/s, kg/m3) like the Pore Pressure Studio
  publish (MPa); provenance records the zone, scenario, rock model and
  the pipeline version; republishing replaces only this engine's curves
  for the same well and project.

## Wave log

- **RP0 + RP1 (2026-09-06), branch `feat/rp0-units-publish`.** Display
  units in the ribbon (`services/units.js`, pure and tested): velocity
  as m/s or ft/s or as sonic slowness in us/ft or us/m, density as
  kg/m3 or g/cc, depth as m or ft with the account's Geoscience depth
  unit as the default through `backend.getDepthUnit` (the Mapping
  setting; the harness answers m so the oracle-anchored labels stay in
  metres). The Fluids table, interval means, chart axes and tooltip,
  zone labels, AVO tops, the averaging window, the mean-halfspace table
  and the manual halfspaces all convert; the manual inputs edit the SI
  value through a draft (`components/UnitInput.jsx`) so a half-typed
  number never snaps. Choices are remembered in localStorage. Publish
  (`services/publish.js`): the substituted case becomes VP_SUB, VS_SUB
  and RHOB_SUB over the well's whole depth grid (in-situ outside the
  zone, substituted inside), SI, with the zone, scenario, rock model,
  K_min, Vs source and input log ids in the provenance; overwrite-own
  on both backends (`publishCurves`, the Pore Pressure contract). The
  explorer lists what this app has published on the selected well.
  e2e: ft/s, us/ft, g/cc and ft expectations derived from the goldens;
  publish then republish leaves exactly one set of three curves and the
  engine inputs untouched (exact-name mapping ignores the *_SUB curves).
  Found while wiring: the first draft of the publish description printed
  the hydrocarbon spec object; the scenario side carries `hc.kind`.
