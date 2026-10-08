# Ekene demonstration dataset — generator

Builds the field dataset the YouTube tutorial series records against.

```
npx tsx tools/demo-dataset/generate.mjs      # -> dist-demo/ekene-demo-v2/
npx jest tools/demo-dataset                  # the gates (kitImports reads the generated kit)
```

To package for the release (two assets: the kit stays small enough to
hand to anyone, the full volume travels on its own):

```
cd dist-demo
zip -qr ekene-demo-v2-kit.zip ekene-demo-v2 \
    -x "ekene-demo-v2/04-seismic/EKENE3D-full.sgy"      # 5.5 MB
zip -qj ekene-demo-v2-seismic-full.zip \
    ekene-demo-v2/04-seismic/EKENE3D-full.sgy           # 35 MB
```

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
| `geology.mjs` | the structural model, the growth fault, trajectories, tops |
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

