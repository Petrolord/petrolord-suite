# Seismolord validation oracle (development-time only)

Python + segyio here are an **oracle, not infrastructure** (see
`docs/scope/Seismolord-PLAN.md`, locked decision #2). Nothing in this
directory ships or runs in production. The committed outputs in
`test-data/seismolord/` are what the app's jest tests consume.

## Layout

- `model.py` — single source of truth: analytic dome (seismic TWT + depth
  surface), volume specs, GRV truth. Deterministic; no RNG anywhere.
- `generate_segy.py` — hand-rolled SEG-Y writer (own IBM 360 float
  encoder, EBCDIC textual header, big-endian everything) →
  `test-data/seismolord/segy/*.sgy`.
- `extract_goldens.py` — reads those files back with **segyio** (an
  independent implementation, so generator bugs can't self-certify) →
  `test-data/seismolord/goldens/*.json` and spec-correct surface exports
  in `test-data/seismolord/surfaces/` (XYZ, CPS-3, ZMAP+, meta + GRV).

## Fixture volumes

| file | format | il/xl bytes | trap |
|---|---|---|---|
| `dome_ibm.sgy` | 1 (IBM float) | 189/193 | IBM encoding, coord scalar −100 |
| `dome_ieee.sgy` | 5 (IEEE float) | 189/193 | same values, IEEE — differs from IBM by quantization only |
| `dome_oddbytes.sgy` | 5 | **9/21** | bytes 189/193 poisoned with 9999; textual header lies and claims 189/193 |

Crosslines number 101+ while inlines number 1+ so an il/xl swap fails
loudly. Sample 0 of every trace is exactly 0.0 (IBM zero case).

## Wells oracle (`wells/`, Phase W0 of Seismolord-WELLS-PLAN.md)

- `wells/mincurve.py` — minimum-curvature reference, self-validated on
  the published drillingformulas.com worked example ((3500 ft, 15°,
  20°) → (3600 ft, 25°, 45°) ⇒ ΔN 27.22 / ΔE 19.45 / ΔTVD 94.01 ft)
  and on analytic circular arcs (planar build/drop and horizontal turn
  are exact by construction, asserted to ~1e-9 m at uneven spacings).
- `wells/gen_wells.py` — three synthetic wells through the dome_ieee
  area (vertical at the crest; planar S-shape; horizontal landing with
  a genuine 3D build-and-turn segment), checkshots from the declared
  truth V(z) = 1800 + 0.5·z, and each well's "Dome" top root-found
  where the exact-arc path crosses the analytic dome surface →
  `test-data/seismolord/wells/wells.json`. Self-checks (published
  example, S-shape closed form, vertical exactness, checkshot round
  trip) run before anything is written.

```sh
.venv/bin/python wells/gen_wells.py
```

## Running

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python generate_segy.py
.venv/bin/python extract_goldens.py
```

Outputs are committed; re-run only when `model.py` changes, and expect
`git diff` on every golden when you do.

## Guarantees the goldens carry

- `traces[].samples` are exact float32 values: JS asserts
  `Math.fround(x) === x`, then bit-compares its own decode.
- Slice/dome arrays are base64 float32-LE blobs with sha256, shape-tagged.
- Surface exports follow the playbook conventions: Z negative-down in
  feet, null 1.0E+30, CPS-3/ZMAP+ bodies column-major north→south.
- `dome_surface_meta.json.grv` holds analytic AND numerically-integrated
  GRV (they agree to <0.001%) for Phase 4's assertions.
