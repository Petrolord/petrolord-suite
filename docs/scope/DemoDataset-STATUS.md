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
| D7b Episodes 11-16, the kit through the apps' importers | **BUILT 2026-09-23** | generator §14 + `__tests__/kitImports.test.js` |
| D8 Drilling, Production, Economics, Facilities, Process Safety (episodes 17-36) | **BUILT 2026-09-23** | `domains/*.mjs`, `d8spine.mjs`, 5 domain gate suites |
| Release | see Open | `ekene-demo-v1` on the Suite repo, owner-approved 2026-09-23 |

## What the kit is

`dist-demo/ekene-demo-v1/`, 98 files, 58.7 MB (41.3 MB of that is the full
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
| `episodes` | 16 notes, one per episode, naming exactly what to load and what to set first |

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

## 2026-09-23: episodes 11-16 and the import gate

The kit was re-checked against today's main before anything changed: the 20
gates still pass and a regeneration was byte-identical to the 2026-09-11 kit.

Every production and reservoir file was then run through the parser its
application actually uses (not a copy of the format):

| File | Application | Verdict |
|---|---|---|
| `decline/Ekene-N.csv` | Decline Curve Analysis | as it stands, one well at a time (Add Well first) |
| `ekene-mbal-tank-history.csv` | Material Balance Studio | as it stands, with a case at Pi 3200 psia; Save to case |
| `ekene-vrr-ledger.csv` | VRR Monitor | as it stands; set Bo 1.21584, Bw 1.02, Rs 400, Bg 0 (defaults read 0.827, field 0.85) |
| `ekene-relative-permeability.csv`, `capillary/*.csv` | SCAL Studio | as they stand; type the plug properties; EK5 needs 48 dyn/cm, not the 30 of its preset |
| `ekene-production-monthly.csv` | none | no app takes it as it stands; now labelled a reference table |
| `ekene-pvt-lab-table.csv` | Material Balance, Fluid Studio | neither imports a PVT table; typed by hand, and the tank history already carries PVT per row |

The Waterflood Surveillance tab reads only its own schema headers, so neither
existing production file loaded (both came through as zeros). **New file:
`08-production/ekene-waterflood-surveillance.csv`**, the fixture rows verbatim
in the tab's headers with injector wellhead pressure: 2 injectors, 4 producers,
VRR 1.035 with the field FVFs (the tab defaults read 1.007), both Hall plots.

New gates (`kitImports.test.js`, 12, reading the generated kit): the decline
files, the VRR ledger (0.85, 1.05, cumulative 1.035; defaults 0.827), the
surveillance file (wells, VRR, water cut, Hall plots; the monthly file reads as
nothing), the Corey fit (Swc 0.35, Sor 0.25, nw 2.5, no 2.0) and the Leverett J
collapse (EK5 at the preset's 30 dyn/cm is off by 48/30). Material Balance's
importer sits inside its component, so its answer stays covered by the
material balance gate. The generator also now fails if an episode note names
a kit file that does not exist (negative control: a misspelt file fails the
run). All 32 gates pass.

New episodes: 11 Decline Curve Analysis, 12 Material Balance Studio, 13 VRR
Monitor, 14 Waterflood Surveillance, 15 SCAL Studio, 16 Seismolord Tops to
Horizons and the new attributes.

App findings from the check, **fixed 2026-09-23** (branch
fix/import-header-matching):
- Decline Curve Analysis matched header aliases by substring, so a column
  named `injection_rate_bwpd` was read as cumulative oil (it contains `np`).
  Short aliases now match whole words only, and a file holding several wells
  is refused with the reason (the rows would all have landed on the selected
  well).
- The Waterflood Surveillance tab had no header aliases and reported nothing
  when none matched, so a file with other names imported as all zeros. It now
  maps daily-rate names (oil_rate_bopd, injection_rate_bwpd, Oil Rate (bbl/d),
  ...) onto its schema, says what it mapped and ignored, and refuses a file
  with no date, well or rate column (volume ledgers included). The kit's
  monthly file now loads there (no Hall plot: it has no pressures), and the
  gates follow.

## 2026-09-23: Wave D8, episodes 17 to 36

Five domains, each a module under `tools/demo-dataset/domains/` loaded by the
section 17 hook, with a gate suite that reads the generated kit back through
the apps' own parsers, context providers or services and engines, with a
negative control per headline. 116 gates pass; the kit is 155 files and
regenerates byte-identically.

| Episodes | Folder | What it holds (engine-checked headline) |
|---|---|---|
| 17-20 Drilling | `10-drilling` | Ekene-11 planned survey (Well Planning's own importers; T1 hit to 0.000 m), casing program and muds inside the window, Casing & Tubing (min design factor 1.16, full evacuation), Torque & Drag (pick-up 807.5 kN), Hydraulics (ECD 14.66 ppg vs 15.64 fracture), Well Control (kick tolerance 8.1 bbl), Well Cost & Time `.wct.json` (AFE 11,799,948 USD = d8spine 11.8M) |
| 21-25 Production | `11-production-engineering` | Surveillance daily production and 144 well tests, Allocation field totals (meter factors 0.970/0.980/0.950), Ekene-1 buildup gauge file (Horner k 224.7 vs 225 md, skin 4.98 vs 5), Nodal and ESP sheets (66 stages) |
| 26-29 Economics | `12-economics` | EPE production/capex/opex uploads (field NPV10 1.98 MM USD, Ekene-11 increment 2.44 MM, economic limit 2037; engines 3.12.0 PIA 2021 / NTA 2025 compliant engine, history years under the PIA and valued years under the NTA; 3.10.0 gave 0.81 and 1.66 MM), NPV Scenario Builder sheet (4.68 MM), breakeven forecast (P10/P50/P90 70.52 / 78.88 / 90.52 USD/bbl), decision tree JSON (EMV 2.482, EVPI 0.075 MM, quoted to three decimals so the difference reads true). Regenerated 2026-09-26 (EC7, branch fix/epe-pia-2021-compliance); the owner's kit zip needs a rebuild after merge |
| 30-33 Facilities | `13-facilities` | design basis, separator (3.0 x 13.8 ft), 18 km export line, produced water (16.5 ppm), corrosion (0.057 mm/yr) |
| 34-36 Process Safety | `14-process-safety` | scenario basis, consequence (0.640 kg/s, LFL 14.9 m), LOPA/SIL (SIL 1, PFDavg 1.13e-2), QRA fed by the consequence outputs (operator IRPA 2.53e-6) |

**Kit data defects the drilling build found in the original sections, fixed:**
Ekene-1's 13-3/8 in shoe (1250 m, LOT 12.29 ppg) could not carry the 12.6 ppg
the history drilled the reservoir with, the failed 11.2 ppg at 1418 m was
overbalanced, and the 9-5/8 in shoe at 1700 m left 0.02 ppg to TD. Shoes are
now 1450 and 1800 m, the mud history is rebuilt and asserted against the
designed pore and fracture profile. T1 now is 8 m below the Oboro top, as its
note says. `csv()` now quotes fields (five kit CSVs had ragged rows).

**App defects the domain builds found:**
- Economics (all four fixed in PR #600 with engines #244): EPE simple
  escalation sent 3 percent defaults; EPE breakeven null with the economic
  limit on; above-band IRR worded as a return when NPV is negative; breakeven
  analyzer years shifted west of UTC. After #600 lands, the economics domain's
  `breakeven is null with the limit on` assertion must become a value.
- Production (open): `getDailyProduction` (src/lib/productionSpine.js:225)
  reads without paging, so a ledger over 1,000 rows is cut silently; wells
  created on import default to producer, so injectors need retyping; the node
  solve reports the highest stable crossing, so `crossCheckTestsAgainstNodal`
  flags choke-held tests; Well Test uses the first gauge point when the
  flowing pressure at shut-in is blank, biasing skin.
- Facilities (open, no effect on the kit): the separator takes oil density at
  60 degF with no temperature correction; the L/D band is the same for two-
  and three-phase horizontal vessels.

## 2026-09-23: episode 37, Wellsite Studio

`domains/wellsite.mjs` (design choices in `domains/wellsite/design.mjs`)
adds folder `15-wellsite`: one report day on Ekene-11 from the Ekene Alpha
platform rig, the first 12-1/4in bit through the last of the Ogbia Shale and
the Ekene Sand top. Wellsite Studio has no import, so the folder is a setup
sheet in the app's labels and units, a time-ordered shift log with the Lag
panel readout after every entry, lag checks, samples, descriptions, shows,
observations and tops. Rig geometry and mud come from `10-drilling`
(13-3/8in shoe 1530 m, 12-1/4in hole, 13.3 ppg); lithology, oil saturation
and shale density from the rock model at Ekene-11; the prognosis is
`01-wells/tops/Ekene-11-tops.csv` and the call lands on it (1635.1 m MD,
1553.6 m TVD). Headlines: pump 0.1194 bbl/stk (18.99 L/stk), lag 5467
strokes (30 min at 180 spm) at the top, first sand and a good show in the
1638 m sample, fair across the contact at 1642.0 m. The gate
(`__tests__/domain.wellsite.test.js`, 51 tests) runs the sheets through the
app's own services (lagNow, sampleBoard, samplesToSchedule, parseField,
abbreviate, showSummary, formationBoard, buildRecord), with negative
controls. The kit is 165 files; the rest regenerates byte-identically
(only `00-START-HERE.md`, `MANIFEST.json` and `GENERATION-REPORT.txt` list
the new folder and episode).

**Wellsite findings (open, recorded in the episode note where a tester meets
them; not fixed in the app here):** Config takes hole sections and the BHA in
feet whatever the depth unit and shows them back rounded to the foot, so
re-saving a configuration typed with decimals changes the geometry; Load from
registry never loads offset wells (no control chooses them); the programme
schedules every depth from its first row, drilled or not; the Lag panel's
"cuttings not at surface yet" note hides the pumps-off note early in a record.
The brief asked for a land rig; Ekene-11 is drilled from the Ekene Alpha
platform in 35 m of water, so the kit uses the app's Platform rig (the same
lag case: no riser, no booster).

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

- Release `ekene-demo-v1`: owner-approved 2026-09-23; cut once this lands.
- Add a "data for this episode" block to each of the ten scripts, from
  `dist-demo/ekene-demo-v1/episodes/`. The scripts are currently artifacts
  from the 2026-09-10 session, not files in this repo.
- Core photographs: the kit ships cored intervals and plug properties, not
  images. A synthetic field has no core.
- Not yet covered: midstream and HSE. Drilling, facilities and wellsite
  now have their D8 episodes.
