# Ekene demonstration dataset — generator

Builds the field dataset the YouTube tutorial series records against.

```
npx tsx tools/demo-dataset/generate.mjs      # -> dist-demo/ekene-demo-v4/
npx jest tools/demo-dataset                  # the gates (several read the generated kit)
```

To package for a release (the kit stays small enough to hand to anyone;
the heavy seismic travels as separate assets). Since v4 the volumes are
named `EKENE3D-v4-*.sgy`, so they load beside the v3 ones in one project:

```
cd dist-demo
zip -qr ekene-demo-v4-kit.zip ekene-demo-v4 \
    -x "ekene-demo-v4/04-seismic/EKENE3D-v4-full.sgy" \
       "ekene-demo-v4/04-seismic/EKENE3D-v4-near.sgy" \
       "ekene-demo-v4/04-seismic/EKENE3D-v4-mid.sgy" \
       "ekene-demo-v4/04-seismic/EKENE3D-v4-far.sgy" \
       "ekene-demo-v4/04-seismic/gathers/*"
zip -qj ekene-demo-v4-seismic-full.zip ekene-demo-v4/04-seismic/EKENE3D-v4-full.sgy
zip -qj ekene-demo-v4-angle-stacks.zip ekene-demo-v4/04-seismic/EKENE3D-v4-{near,mid,far}.sgy
zip -qj ekene-demo-v4-gathers.zip ekene-demo-v4/04-seismic/gathers/*
```

The v3 release (`ekene-demo-v3`) stays as it is: the QI videos link to it.

Deterministic: reruns are byte-identical. Plan of record:
`docs/scope/DemoDataset-PLAN.md`.

## The rule this generator exists to keep

Ekene is the teaching field ten NextGen courses already use, and its
volumetrics, PVT, rock curves and production history are values those
courses teach. This generator **derives** everything else from them
rather than inventing it, and asserts the derivation on the way through.
If a change here contradicts the Academy, the run fails instead of
writing a kit.

What is asserted, every run:

| | |
|---|---|
| the six-well grid | 169 oil cells, 20.2818603515625 m maximum oil column |
| the Ekene Sand | net to gross 0.80, net porosity 0.20 |
| the crest | drains to Sw 0.3506 on the field's own J curve |
| the contact | 180 °F, and a pore pressure of exactly 3200 psia |
| the shale sonic | Eaton at exponent 3 returns the designed pressure |

## Modules

| File | What it holds |
|---|---|
| `spine.mjs` | every constant, split into LOCKED and DESIGN |
| `geology.mjs` | the v3 well control (every well's survey and tops), trajectories, tops |
| `structure.mjs` | the v4 structure: the listric growth fault, rollover, secondary faults, fault blocks |
| `structureTruth.mjs` | the structure measured: fault dip by depth, throw by horizon, the Ekene Sand closure |
| `rbf.mjs` | the smooth exact interpolant the seismic and logs are built on |
| `rockmodel.mjs` | facies, porosity, saturation, pressure and every curve |
| `seismic.mjs` | reflectivity, wavelet, noise, survey geometry |
| `build.mjs` | the shared build the generator and the gate test both use |
| `generate.mjs` | writes the kit |
| `writers/` | LAS 2.0 and SEG-Y rev 1; grids and culture reuse the engines |

## Two surfaces, on purpose

The gridding engine masks a surface to the hull of its control points,
which is right for a map and useless for a seismic cube. So the kit
carries both: the **grid** is the map (and the thing whose volumetrics
are locked), and an **RBF interpolant** exact at every well pick is the
structural truth the logs and the seismic are generated from. They agree
at the wells, which is what makes the tie tie, and differ slightly
between them, which is what real seismic and well grids do.

## Domains beyond the first sixteen episodes (Wave D8)

`domains/<name>.mjs` modules are loaded automatically (generate.mjs section
17): each exports `build(ctx)`, writes its kit folder through `ctx.write` and
returns its episodes and folders. Helpers live in `domains/<name>/`. Values two
domains must agree on (Ekene-11's cost and forecast, the facilities design
basis) are in `d8spine.mjs`. Apps that only take typed inputs get an input
sheet (`section,field,value,unit,source`, in the app's own labels); each
domain's gate (`__tests__/domain.<name>.test.js`) feeds the sheet through the
app's own mapping into its engine and checks the numbers the note quotes.

## Adding a domain

`generate.mjs` is a sequence of numbered sections. Add one, write into
`OUT` through `write()`, add a gate to `__tests__/demoDataset.test.js`,
and add an episode note if a script needs it. Wave D7 (production,
material balance, decline, economics) is mostly a repackaging of
`packages/engines/test-data/ekene-dynamic/`, which is already generated
and already carries the goldens.

## Kit v2 (2026-10-08): measured logs

The generated rows are the truth: every gate and every locked number is
computed from them. Since v2 the LAS files carry what logging tools would
measure from that truth (`measure.mjs`): each tool's vertical resolution
(PEF 0.2 m, density 0.45 m, GR, neutron and sonic 0.6 m, deep resistivity
0.9 m on conductivity), seeded measurement noise at tool precision, a
washed-out stretch in the Ogbia Shale where the density reads low and the new
`DRHO` correction curve flags it, and lamina-scale porosity variation in the
two reservoir sands. v1 logs were smooth functions of a few bed properties,
so every crossplot showed thin streaks.

What a presenter will read changes with it: on Ekene-1's water leg the clean
samples (Vsh <= 0.12) give a least-squares Pickett line of m about 1.6 and
a*Rw about 0.13, against the truth of m 2 and Rw 0.078. Noise in porosity
biases a least-squares slope shallow, which is itself a lesson.


## Kit v3 (2026-10-09): the QI pack

`elastic.mjs` adds a dipole shear sonic (DTS) to every well with a sonic,
without changing any v2 log value (DTS is appended last in `measure.mjs`, so
every earlier curve keeps its noise). Brine-filled rock lies on a local
shear trend (`ELASTIC` in `spine.mjs`, a few per cent above
Greenberg-Castagna in sand); hydrocarbon-bearing rock is the fixed point of
the engine's `iterativeVs` at Batzle-Wang fluids for each reservoir.

`seismic.mjs` now models every product from one elastic model (per-layer
Vp, Vs and density from Ekene-1, split at the fluid contacts, exact
Zoeppritz at the layer tops and contacts; inside each layer Ekene-1's own
brine-equivalent logs in 1.5 m blocks, carried conformably, with Shuey
three-term reflectivity; the whole timed by the checkshots): the full stack (0 to 30 degrees), near, mid and far angle stacks
on the same lattice, and NMO-corrected offset gathers whose angles are
Walden's straight-ray angles from the published RMS velocity, the way QI
Studio computes them. `10-qi/` holds the truth the QI videos quote, and
`__tests__/qi.test.js` gates it through the engines.


## Kit v4 (2026-10-11): a Niger Delta growth fault

v3's growth fault was a vertical step on a straight trace that appeared only in
the lower part of the section. v4 (`structure.mjs`) models it the way the delta
is drawn: a basinward-dipping listric normal fault, about 78 degrees near its
tip at roughly 100 ms, flattening into an Akata detachment at 2750 m (about
2.45 s); an asymmetric rollover anticline in its hanging wall (vertical-shear
kinematics plus syn-depositional thickening), growth packages that thicken
toward it with throw growing with the age of the horizon; a buried synthetic
fault (Ekene East, the deep east-side throw the wells always had) and crestal
synthetic and antithetic faults that die out above the reservoir.

Every column is cut into fault blocks, each with its own horizons, and the
seismic carries every layer's fine structure inside each block, so reflectors
end at a fault and resume offset across it, tapered over about two traces with
a narrow, dimmed damage zone. Each column is timed on a laterally smoothed
time-depth (no fault-shadow seams). Reflectors brighten, fade and pinch out,
thin sand lenses tune, the detachment is weak and patchy over chaotic mobile
shale, and band-limited noise sits 17 dB under the signal. All the lateral
variation fades to nothing within about two traces of each logged well, so the
ties and the QI truth stand. The record is 3500 ms, and the survey reaches 40
crosslines further landward (1960-2127) on the v3 lattice so the footwall
shows.

**The wells did not move.** `makeWellControl()` is the v3 model, unchanged,
and builds every survey and top; `structure.mjs` is fitted to those picks with
a residual that is exact at each pick and fades away from the wells. The
gates (`__tests__/structure.test.js`) check that 01-wells is byte-identical to
the v3 release by SHA-256 (`__tests__/fixtures/ekene-v3-wells.sha256.json`),
that no well path crosses a fault, that the structure honours every top, that
the fault is listric and soles out inside the record, that throw grows with
age and the hanging-wall isopachs thicken toward the fault, and that the Ekene
Sand closes inside the survey with its spill below the contact.
`04-seismic/truth/` holds the answer key: the structure measured and the
fault sticks.
