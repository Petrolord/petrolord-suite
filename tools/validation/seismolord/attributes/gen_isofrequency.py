#!/usr/bin/env python3
"""Golden generator for the W2.5 horizon isofrequency kernel
(engines/seismolord/horizonAmplitude.js isofrequencyAt).

Recipe pinned by the goldens (the JS engine mirrors it EXACTLY):
- window = samples round(z) +/- hw clamped to the trace (edge windows
  shrink; n < 4 -> null);
- nulls (|v| > 1e29) zero-filled; an all-null window is null;
- full-window Hann taper h[m] = 0.5 - 0.5*cos(2*pi*m/(n-1))
  (np.hanning over the ACTUAL window length n);
- zero-pad to nfft = nextpow2(4*n); FFT;
- value = |X[bin]| with bin = round(freqHz * nfft * dt_s) clamped to
  [0, nfft/2].

Self-asserts a pure 30 Hz cosine reads far stronger at 30 Hz than at
60 Hz before writing anything.

Usage: gen_isofrequency.py [output.json]
"""

import json
import sys

import numpy as np

NULL = 1.0e30
NULL_LIM = 1.0e29
NS = 64
DT_US = 4000
DT_S = DT_US * 1e-6
HW = 8
FREQS = [15.0, 30.0, 60.0]
PICKS = [32.0, 31.6, 3.0, 62.0]     # interior, fractional, both edges


def nextpow2(n):
    p = 1
    while p < n:
        p *= 2
    return p


def iso_value(trace, z, freq_hz, hw):
    if not np.isfinite(z):
        return NULL
    c = int(round(z))
    if c < 0 or c >= len(trace):
        return NULL
    s0 = max(0, c - hw)
    s1 = min(len(trace) - 1, c + hw)
    n = s1 - s0 + 1
    if n < 4:
        return NULL
    win = np.array(trace[s0:s1 + 1], dtype=np.float64)
    ok = np.abs(win) <= NULL_LIM
    if not ok.any():
        return NULL
    win = np.where(ok, win, 0.0) * np.hanning(n)
    nfft = nextpow2(4 * n)
    x = np.fft.fft(win, n=nfft)
    b = min(nfft // 2, max(0, int(round(freq_hz * nfft * DT_S))))
    return float(np.abs(x[b]))


def ricker(f_hz, dt_s, half_len):
    t = np.arange(-half_len, half_len + 1) * dt_s
    a = (np.pi * f_hz * t) ** 2
    return (1 - 2 * a) * np.exp(-a)


def build_traces():
    t = np.arange(NS) * DT_S
    rng = np.random.default_rng(11)
    cos30 = np.cos(2 * np.pi * 30.0 * t)
    rc = np.zeros(NS)
    rc[32] = 1.0
    rk = np.convolve(rc, ricker(30.0, DT_S, 10), mode="same")
    noisy = rk + 0.05 * rng.standard_normal(NS)
    gapped = cos30.copy()
    gapped[28:33] = NULL
    dead = np.full(NS, NULL)
    return {"cos30": cos30, "ricker": rk, "noisy": noisy, "gapped": gapped, "dead": dead}


def self_assert(traces):
    v30 = iso_value(traces["cos30"], 32.0, 30.0, HW)
    v60 = iso_value(traces["cos30"], 32.0, 60.0, HW)
    assert v30 > 4 * v60, f"cos30: {v30} at 30Hz vs {v60} at 60Hz"
    assert np.abs(iso_value(traces["dead"], 32.0, 30.0, HW)) > NULL_LIM, "dead trace must be null"
    print("self-asserts OK")


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "isofrequency_golden.json"
    traces = build_traces()
    self_assert(traces)
    golden = []
    for name, tr in traces.items():
        for z in PICKS:
            for f in FREQS:
                golden.append({
                    "trace": name, "z": z, "freq_hz": f,
                    "value": iso_value(tr, z, f, HW),
                })
    doc = {
        "generator": "tools/validation/seismolord/attributes/gen_isofrequency.py",
        "dt_us": DT_US, "ns": NS, "hw": HW, "null_value": NULL,
        "traces": {k: v.tolist() for k, v in traces.items()},
        "golden": golden,
    }
    with open(out_path, "w") as f:
        json.dump(doc, f)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
