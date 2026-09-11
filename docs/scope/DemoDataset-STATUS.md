# Ekene Demonstration Dataset — STATUS

Plan of record: `DemoDataset-PLAN.md` (owner decisions 2026-09-11).
Generator: `tools/demo-dataset/`. Gates: `npx jest tools/demo-dataset`.

## Wave status

| Wave | Status | Landed |
|---|---|---|
| D0 Spine, structure, trajectories | **BUILT 2026-09-11** | `spine.mjs`, `geology.mjs`, `rbf.mjs` |
| D1 Wells: LAS, surveys, tops, checkshots | **BUILT 2026-09-11** | `rockmodel.mjs`, `writers/las.mjs` |
| D2 Surfaces and culture | **BUILT 2026-09-11** | engines' grid writers, GeoJSON |
| D3 Seismic | **BUILT 2026-09-11** | `seismic.mjs`, `writers/segy.mjs` |
| D4 Pressure and well design | **BUILT 2026-09-11** | generator §11, §13 |
| D5 Stratigraphy | **BUILT 2026-09-11** | generator §12 |
| D6 Kit assembly and episode notes | **BUILT 2026-09-11** | generator §14, §15 |
| D7 The rest of the Suite | **BUILT 2026-09-11** | generator §16, repackaging `ekene-dynamic` |
| Release | **NOT DONE** | needs the owner to cut `ekene-demo-v1` on the Petrolord org |

## What the kit is

`dist-demo/ekene-demo-v1/`, 91 files, 58.6 MB (41.3 MB of that is the full
SEG-Y). Deterministic: reruns are byte-identical.

| Folder | Contents |
|---|---|
| `01-wells` | 10 LAS files, 12 deviation surveys, 12 top sets, 10 checkshot tables, headers, one definitive survey as XLSX |
| `02-surfaces` | Ekene Sand top and base, Oboro Sand top, in ZMAP+, CPS-3 and XYZ |
| `03-culture` | licence boundary and growth fault as GeoJSON |
| `04-seismic` | `EKENE3D-small.sgy` (32x32, IEEE, 2.6 MB) and `EKENE3D-full.sgy` (128x128, IBM, 41.3 MB), 601 samples at 4 ms |
| `05-pressure` | 12 MDT pretests, 3 shoe tests, mud weight history, the designed prognosis |
| `06-stratigraphy` | dated column with the Oboro hiatus, biozones, cored intervals |
| `07-well-design` | Ekene Alpha site card, Ekene-11 targets |
| `08-production` | 345 well-months, 36-month voidage ledger, per-well decline files |
| `09-reservoir` | 7 pressure surveys, PVT lab table, Corey relative permeability, 3 capillary plugs |
| `episodes` | one note per episode naming exactly which files to load |

## Gates (20, all green 2026-09-11)

| Gate | Result |
|---|---|
| six-well grid reproduces NG5 | 169 oil cells, 20.2818603515625 m max column, exact |
| Ekene Sand net to gross and net porosity | 0.8003 and 0.200000, against locked 0.80 and 0.20 |
| crest saturation | 0.3506 on the field's own J curve |
| contact temperature | exactly 180 degF |
| LAS round trip | all 10 files parse back through `lasParse` to the values written |
| Pickett on Ekene-1's water leg | m 1.876 against 2; a*Rw 0.0914 against a true Rw of 0.0782 |
| density-neutron crossover | present in the Oboro gas leg, absent in the Ekene oil leg |
| pore pressure at the contact | 3200.000000 psia = the locked Pi, 12.024 ppg EMW |
| Eaton at exponent 3 | reproduces the designed pressure to 1.6e-12 psi |
| pressure regime | normal above 1290 m, overpressured below |
| Ekene-9 | sonic, no density |
| SEG-Y headers and scan | clean through `readFileHeaders` and `scanGeometry` |
| the tie | top Ekene Sand peak within one sample of the well's integrated time |
| correlation | the same nine surfaces in the same order in every logged well |
| fault blocks | four west, three east |
| fault throw | zero at the Ekene Sand, 38 m at the Oboro Sand |
| surveillance rows | are daily rates; a month of them reproduces the ledger's Np |
| material balance | returns 12139208 stb against a volumetric 12139208 stb, R squared 1 |
| capillary plugs | carry the same J curve the log saturations came from |

## Decisions taken while building

**Two surfaces, deliberately.** The gridding engine masks to the control
hull, which is right for a map and useless for a seismic cube — and it
also returns null at Ekene-2, which is a hull vertex. So the kit carries
the grid as the map (the thing whose volumetrics are locked) and a
multiquadric RBF, exact at all seven locked picks, as the structural
truth the logs and seismic are generated from. They agree at the wells
and differ slightly between them, which is what real seismic and well
grids do.

**The growth fault dies out below the reservoir.** Throw is zero at and
above the Ekene Sand base and grows downward to 90 m. That reconciles
three things at once: the Ekene tank is unfaulted in the base case, the
DC22 sealing-fault case stays a what-if, and Seismolord still has a
clearly pickable fault at the Oboro and Akata levels, which is where a
growth fault is pickable anyway.

**Ekene-7 is not idempotent, and that is the point.** Adding the
appraisal well's real pick (1549 m, against the six-well map's prediction
of 1543.33 m) moves the map to 171 oil cells and a 19.24 m column. That
is the NG7 blind test, and it gives Episode 4's re-grid beat a number.
The Ekene Sand map the series is built on is gridded from the six
development wells.

**The clay bias on the Pickett fit is kept.** a*Rw reads 17 percent high
because clay conducts. Suppressing it would have meant a shale term that
no real log has. The episode note states the number a presenter will
actually read.

## Release assets

Built by the two `zip` commands in `tools/demo-dataset/README.md`:

| Asset | Size | Contents |
|---|---|---|
| `ekene-demo-v1-kit.zip` | 5.5 MB | everything except the full SEG-Y — 109 files |
| `ekene-demo-v1-seismic-full.zip` | 35 MB | `EKENE3D-full.sgy` on its own |

The kit stays small enough to hand to anyone; only the volume needs the
release.

## Open

- Cut the `ekene-demo-v1` release on the Petrolord org and attach both
  assets.
- Add a "data for this episode" block to each of the ten scripts, from
  `dist-demo/ekene-demo-v1/episodes/`. The scripts are currently artifacts
  from the 2026-09-10 session, not files in this repo.
- Core photographs: the kit ships cored intervals and plug properties, not
  images. A synthetic field has no core.
- Not yet covered: drilling (beyond the well design site card), facilities,
  midstream, HSE, wellsite. Those are a D8 when their episodes are written.
