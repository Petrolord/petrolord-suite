# Ekene demonstration dataset — generator

Builds the field dataset the YouTube tutorial series records against.

```
npx tsx tools/demo-dataset/generate.mjs      # -> dist-demo/ekene-demo-v1/
npx jest tools/demo-dataset                  # the gates
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

## Adding a domain

`generate.mjs` is a sequence of numbered sections. Add one, write into
`OUT` through `write()`, add a gate to `__tests__/demoDataset.test.js`,
and add an episode note if a script needs it. Wave D7 (production,
material balance, decline, economics) is mostly a repackaging of
`packages/engines/test-data/ekene-dynamic/`, which is already generated
and already carries the goldens.
