# ReservoirCalc Pro, RC series (Petrel tester readiness, 2026-09)

Status: **planned 2026-09-06**, the next door in the Geoscience loop after
Earth Modeling (owner's standing instruction: continue the tester-readiness
waves from one Geoscience app to the next). Decisions below are v1
defaults the owner may override.

## Why this app, and why now

ReservoirCalc Pro is where Mapping and Earth Modeling now land (both
launch into its Surface import with `?surface=`), and it has already had
three tester rounds (units, typing and project flow, exports and the
symmetric tornado; see ReservoirCalcPro-STATUS.md). What a Petrel user
still meets, against the apps the testers just walked:

| Area | Today | A Petrel user expects |
|---|---|---|
| Wells | No door from the registry; `services/registryInputs.js` (G5.1) maps zone averages and surface area to inputs but nothing in the UI calls it | Pick a registry zone and pull porosity, Sw, NTG and net thickness from the wells that carry it; area from a registry surface or a boundary polygon |
| Polygons | AOIs are drawn inside the app only | Boundary polygons drawn in Mapping (geo_culture) as AOIs |
| Depth | Contacts typed as negative elevation in the unit system's length unit | The account's depth unit (ft or m, the Mapping setting) on OWC/GOC with a TVDSS badge, and the same convention as the registry surfaces |
| Testability | No dev harness; only the risking panel has one | Every wave verified end to end on the harness like the other four apps |
| Links | Arrives from Mapping and Earth Modeling | Leaves too: open the surface in Mapping or Earth Modeling, open a well in Well Data Manager |

## Program

| Wave | Theme | One line |
|---|---|---|
| RC0 Harness | `/dev/reservoircalc-pro` | The whole app on injected in-memory project, registry and prospects backends, seeded with the Mapping harness surfaces and wells; e2e of the core flow (surface, contacts, deterministic, Monte Carlo, save) |
| RC1 Registry door | wells, zones, surfaces, polygons | A Wells tab: registry zone picker pulling petrophysics from the published zone averages (registryInputs), area from a registry surface, a Mapping boundary polygon as an AOI; provenance recorded in the project |
| RC2 Depth unit | contacts in the account unit | OWC/GOC in the account's depth unit with the TVDSS elevation convention stated; stored canonical unchanged |
| RC3 Links and status | launchers out, docs | Open the surface in Mapping or Earth Modeling, open a well in Well Data Manager; DocumentationHub gains the registry chapter; STATUS |

## Recorded decisions (v1 defaults, 2026-09-06)

- The engines and the canonical input model are untouched; every wave
  converts at the UI boundary (the unitsCatalog pattern).
- The harness injects backends the way the other apps do; the real page
  keeps calling ProjectService, the surface registry and the prospects
  service through one `backend` object created at the page.
- Registry pulls never overwrite silently: the Wells tab shows what it
  would set, the user applies, and the audit trail records the source.

## Wave log

- **RC0 (2026-09-06), branch `feat/rc0-harness-backend`.** One backend
  object (`services/rcpBackend.js`): the registry backend wraps
  ProjectService, the surface registry and Seismolord exports, the well
  registry, culture layers and the prospects table; the in-memory
  backend keeps projects in a list with the registry row shape, reuses
  the Mapping harness backend for surfaces, wells (with published zone
  averages) and culture, seeds a depth dome, and carries a dev user so
  Save works. `ReservoirCalcProvider` takes `backend` and exposes it;
  the header, ProjectManager, WorkspaceToolsHub and SurfaceImportDialog
  read it instead of static services. `/dev/reservoircalc-pro` mounts
  the whole app on it; e2e: registry surface in through the Surface
  import, hybrid method with a contact gives a positive STOOIP, save
  names the project. Test ids `rcp-*` on the flow.
  Found by the harness: the Surface import dialog was taller than a
  720 px laptop viewport with no scrolling, so its Import Surface button
  was unreachable once the registry lists were populated (fixed: the
  dialog body scrolls within 92vh). Noted for RC2: the map and 3D
  viewers label depth in the unit system's unit ("DEPTH (FT)") for a
  surface imported in metres.
