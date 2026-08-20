#!/usr/bin/env python3
"""Golden generator for the W2.2 trace-attribute engine
(engines/seismolord/attributes.js).

Recipe pinned by the goldens (the JS engine mirrors it EXACTLY):
- nulls (|v| > 1e29) are zero-filled before any transform; output
  samples at null input positions are the literal null 1.0e30;
- analytic signal = scipy.signal.hilbert(x_zerofilled, N=nextpow2(ns))
  truncated to ns (the JS radix-2 FFT needs a power-of-two length, so
  the padding IS the recipe, not an approximation of something else);
- instantaneous frequency = np.gradient(np.unwrap(np.angle(a))) /
  (2*pi*dt_s)  [numpy defaults: central differences, one-sided edges,
  unwrap period 2*pi];
- sweetness = envelope / sqrt(inst_freq) computed from the FLOAT32-cast
  envelope and frequency (the JS engine derives it from float32 out
  buffers), null where inst_freq <= 0;
- windowed RMS: per sample over [s-hw, s+hw] clamped to the trace,
  nulls excluded, all-null window -> null; float64 prefix sums;
- AGC amplitude: v * traceRms / windowRms(float32-cast), zero-energy
  window -> 0, null in -> null out.

Self-asserts its own math against analytic expectations before writing
anything (the gen_synthetics.py doctrine).

Usage: gen_attributes.py [output.json]
"""

import json
import sys

import numpy as np
from scipy.signal import hilbert

NULL = 1.0e30
NULL_LIM = 1.0e29
NS = 251
DT_US = 4000
DT_S = DT_US * 1e-6


def nextpow2(n):
    p = 1
    while p < n:
        p *= 2
    return p


def is_null(x):
    return np.abs(x) > NULL_LIM


def analytic(x):
    xz = np.where(is_null(x), 0.0, x)
    return hilbert(xz, N=nextpow2(len(x)))[: len(x)]


def masked(x, out):
    return np.where(is_null(x), NULL, out)


def envelope(x):
    return masked(x, np.abs(analytic(x)))


def inst_phase_deg(x):
    return masked(x, np.degrees(np.angle(analytic(x))))


def inst_freq_hz(x):
    ph = np.unwrap(np.angle(analytic(x)))
    return masked(x, np.gradient(ph) / (2 * np.pi * DT_S))


def f32(x):
    return np.asarray(x, dtype=np.float32).astype(np.float64)


def sweetness(x):
    env = f32(envelope(x))
    frq = f32(inst_freq_hz(x))
    bad = is_null(env) | is_null(frq) | (frq <= 0)
    safe = np.where(bad, 1.0, frq)
    return np.where(bad, NULL, env / np.sqrt(safe))


def windowed_rms(x, hw):
    ns = len(x)
    ok = ~is_null(x)
    v = np.where(ok, x, 0.0)
    sum2 = np.concatenate([[0.0], np.cumsum(v * v)])
    cnt = np.concatenate([[0], np.cumsum(ok.astype(np.int64))])
    out = np.empty(ns)
    for s in range(ns):
        lo = max(0, s - hw)
        hi = min(ns - 1, s + hw)
        n = cnt[hi + 1] - cnt[lo]
        out[s] = NULL if n == 0 else np.sqrt((sum2[hi + 1] - sum2[lo]) / n)
    return masked(x, out)


def trace_agc(x, hw):
    wrms = f32(windowed_rms(x, hw))
    ok = ~is_null(x)
    n = int(ok.sum())
    ref = np.sqrt((x[ok] ** 2).sum() / n) if n else 0.0
    out = np.empty(len(x))
    for s in range(len(x)):
        if not ok[s]:
            out[s] = NULL
        elif is_null(wrms[s]) or wrms[s] == 0:
            out[s] = 0.0
        else:
            out[s] = x[s] * ref / wrms[s]
    return out


def ricker(f_hz, dt_s, half_len):
    t = np.arange(-half_len, half_len + 1) * dt_s
    a = (np.pi * f_hz * t) ** 2
    return (1 - 2 * a) * np.exp(-a)


def build_traces():
    t = np.arange(NS) * DT_S
    rng = np.random.default_rng(42)

    rc = np.zeros(NS)
    for pos, amp in [(40, 1.0), (95, -0.7), (150, 0.5), (200, -0.9)]:
        rc[pos] = amp
    ricker_trace = np.convolve(rc, ricker(30.0, DT_S, 25), mode="same")

    # linear chirp 10 -> 60 Hz with a Hann amplitude taper
    T = t[-1]
    phase = 2 * np.pi * (10.0 * t + 0.5 * (50.0 / T) * t**2)
    taper = np.hanning(NS)
    chirp = taper * np.sin(phase)

    noise = rng.standard_normal(NS)

    gapped = chirp.copy()
    gapped[0:10] = NULL
    gapped[120:140] = NULL
    gapped[245:] = NULL

    return {
        "ricker_reflectivity": ricker_trace,
        "chirp": chirp,
        "noise": noise,
        "gapped": gapped,
    }


def self_assert(traces):
    t = np.arange(NS) * DT_S
    T = t[-1]

    # chirp instantaneous frequency mid-trace matches the analytic ramp
    frq = inst_freq_hz(traces["chirp"])
    mid = NS // 2
    expect = 10.0 + (50.0 / T) * t[mid]
    assert abs(frq[mid] - expect) < 1.5, f"chirp f_inst {frq[mid]} vs {expect}"

    # envelope of a pure interior sinusoid is ~1
    pure = np.sin(2 * np.pi * 25.0 * t)
    env = envelope(pure)
    interior = env[40:-40]
    assert np.all(np.abs(interior - 1.0) < 0.05), "sinusoid envelope"

    # constant trace: windowed RMS == the constant, AGC == the constant
    const = np.full(NS, 3.0)
    assert np.allclose(windowed_rms(const, 10), 3.0), "const rms"
    assert np.allclose(trace_agc(const, 10), 3.0), "const agc"

    # gapped: every input null is an output null
    g = traces["gapped"]
    for fn in (envelope, inst_phase_deg, inst_freq_hz, sweetness):
        out = fn(g)
        assert np.all(is_null(out[is_null(g)])), f"null propagation in {fn.__name__}"

    print("self-asserts OK")


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "attributes_golden.json"
    traces = build_traces()
    self_assert(traces)

    golden = {}
    for name, x in traces.items():
        golden[name] = {
            "envelope": envelope(x).tolist(),
            "inst_phase": inst_phase_deg(x).tolist(),
            "inst_freq": inst_freq_hz(x).tolist(),
            "sweetness": sweetness(x).tolist(),
            "rms_w80": windowed_rms(x, 10).tolist(),  # 80 ms at dt 4 ms -> hw 10
            "agc_w400": trace_agc(x, 50).tolist(),    # 400 ms at dt 4 ms -> hw 50
        }

    doc = {
        "generator": "tools/validation/seismolord/attributes/gen_attributes.py",
        "dt_us": DT_US,
        "ns": NS,
        "null_value": NULL,
        "params": {"rms_window_ms": 80, "agc_window_ms": 400},
        "traces": {k: v.tolist() for k, v in traces.items()},
        "golden": golden,
    }
    with open(out_path, "w") as f:
        json.dump(doc, f)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
