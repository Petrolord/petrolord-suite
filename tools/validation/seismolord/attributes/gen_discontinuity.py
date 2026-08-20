#!/usr/bin/env python3
"""Golden generator for the W2.3 discontinuity engine
(engines/seismolord/discontinuity.js): windowed semblance variance over
a lateral trace neighborhood, on a synthetic faulted layer cube.

Recipe pinned by the goldens (the JS engine mirrors it EXACTLY):
- neighborhood = the (2r+1)^2 traces centred on (il, xl), clipped to the
  survey; dead traces (all-null) are excluded entirely;
- per output sample t, over lags w in [t-hw, t+hw] clamped to the trace:
  with n_w live values x_i at lag w,
      num += (sum_i x_i)^2 / n_w ;  den += sum_i x_i^2
- semblance = num/den (den == 0 counts as perfectly coherent -> var 0);
  variance = 1 - semblance clamped to [0, 1];
- output NULL where the center sample is null, or when fewer than 2
  live traces cover the neighborhood.

The synthetic cube is a layered reflectivity model with a vertical
fault at XL index FAULT_XL (all layers shift down by FAULT_SHIFT
samples), a dead trace, and a nulled trace top. Self-asserts that the
fault lights up and the coherent interior stays dark before writing.

Usage: gen_discontinuity.py [output.json]
"""

import json
import sys

import numpy as np

NULL = 1.0e30
NULL_LIM = 1.0e29
NIL, NXL, NS = 12, 16, 48
DT_US = 4000
FAULT_XL = 8          # xl >= FAULT_XL is the downthrown side
FAULT_SHIFT = 3       # samples
LAYERS = [(10, 1.0), (20, -0.8), (30, 0.6), (40, -0.9)]
HW = 5                # 40 ms window at 4 ms
RADIUS = 1


def ricker(f_hz, dt_s, half_len):
    t = np.arange(-half_len, half_len + 1) * dt_s
    a = (np.pi * f_hz * t) ** 2
    return (1 - 2 * a) * np.exp(-a)


def build_cube():
    rng = np.random.default_rng(7)
    wav = ricker(35.0, DT_US * 1e-6, 6)
    cube = np.zeros((NIL, NXL, NS))
    for il in range(NIL):
        for xl in range(NXL):
            rc = np.zeros(NS)
            shift = FAULT_SHIFT if xl >= FAULT_XL else 0
            for (t0, amp) in LAYERS:
                t = t0 + shift
                if 0 <= t < NS:
                    # gentle lateral amplitude ramp keeps traces similar,
                    # not identical
                    rc[t] = amp * (1 + 0.02 * il + 0.01 * xl)
            tr = np.convolve(rc, wav, mode="same")
            tr += 0.01 * rng.standard_normal(NS)
            cube[il, xl] = tr
    cube[0, 0, :] = NULL                 # dead trace
    cube[2, 3, :6] = NULL                # nulled top of one trace
    return cube


def variance_volume(cube, hw, radius):
    out = np.full((NIL, NXL, NS), NULL)
    live = ~np.all(np.abs(cube) > NULL_LIM, axis=2)
    for il in range(NIL):
        for xl in range(NXL):
            if not live[il, xl]:
                continue
            hood = []
            for di in range(-radius, radius + 1):
                for dj in range(-radius, radius + 1):
                    i2, j2 = il + di, xl + dj
                    if 0 <= i2 < NIL and 0 <= j2 < NXL and live[i2, j2]:
                        hood.append(cube[i2, j2])
            center = cube[il, xl]
            if len(hood) < 2:
                continue                  # stays NULL
            hood = np.array(hood)
            ok = np.abs(hood) <= NULL_LIM
            vals = np.where(ok, hood, 0.0)
            row_sum = vals.sum(axis=0)
            row_sum2 = (vals * vals).sum(axis=0)
            row_n = ok.sum(axis=0)
            for t in range(NS):
                if abs(center[t]) > NULL_LIM:
                    continue              # center null -> output NULL
                w0, w1 = max(0, t - hw), min(NS - 1, t + hw)
                num = 0.0
                den = 0.0
                for w in range(w0, w1 + 1):
                    n = row_n[w]
                    if n == 0:
                        continue
                    num += row_sum[w] ** 2 / n
                    den += row_sum2[w]
                if den == 0:
                    out[il, xl, t] = 0.0
                else:
                    out[il, xl, t] = min(1.0, max(0.0, 1 - num / den))
    return out


def self_assert(cube, var):
    # fault columns light up at reflector depth, coherent interior stays dark
    layer_t = LAYERS[1][0]
    fault_zone = var[5, FAULT_XL - 1:FAULT_XL + 1, layer_t - 2:layer_t + 2]
    interior = var[5, 3, layer_t - 2:layer_t + 2]
    assert fault_zone.max() > 0.25, f"fault too dark: {fault_zone.max()}"
    assert interior.max() < 0.1, f"interior too bright: {interior.max()}"

    # dead trace stays null; its neighbours still compute
    assert np.all(np.abs(var[0, 0]) > NULL_LIM), "dead trace must stay null"
    assert np.any(np.abs(var[0, 1]) <= NULL_LIM), "dead-trace neighbour must compute"

    # center-null propagation
    assert np.all(np.abs(var[2, 3, :6]) > NULL_LIM), "null top must propagate"
    assert np.any(np.abs(var[2, 3, 6:]) <= NULL_LIM), "live part must compute"

    print("self-asserts OK")


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "discontinuity_golden.json"
    cube = build_cube()
    var = variance_volume(cube, HW, RADIUS)
    self_assert(cube, var)
    doc = {
        "generator": "tools/validation/seismolord/attributes/gen_discontinuity.py",
        "dt_us": DT_US,
        "shape": [NIL, NXL, NS],
        "null_value": NULL,
        "params": {"window_ms": 40, "radius": RADIUS, "half_window_samples": HW},
        "fault_xl": FAULT_XL,
        "cube": cube.tolist(),
        "variance": var.tolist(),
    }
    with open(out_path, "w") as f:
        json.dump(doc, f)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
