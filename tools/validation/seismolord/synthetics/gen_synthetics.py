"""Generate the LAS-driven synthetics goldens (Seismolord, Geoscience G5
deferred item: synthetic seismograms + wavelet extraction).

The JS engine (src/pages/apps/Seismolord/engine/synthetics.js) is held to
these goldens by src/pages/apps/Seismolord/__tests__/synthetics.test.js.
Every algorithm below is specified EXACTLY (sample placement, gap policy,
taper, FFT length, smoothing) so the plain-JS implementation can match it
bit-closely (<= 1e-5 relative); where the two sides share upstream math
(minimum curvature, checkshot interpolation) the oracle reuses the
already-validated wells reference (wells/mincurve.py) and mirrors
engine/wellSection.js makeTvdssToTwt's checkshot branch exactly.

Cases (all self-asserted here before any golden is written):

(a) ricker      analytic Ricker r(t) = (1 - 2 pi^2 f^2 t^2) exp(-pi^2 f^2 t^2):
                peak 1.0 at t = 0, zero crossings at t = +/- 1/(pi f sqrt(2)).
(b) wedge       3-layer wedge: impedance Z = v * rho, hand-checked
                RC = (Z2 - Z1)/(Z2 + Z1), interfaces placed in TWT through a
                known constant-per-layer checkshot function, RC spikes put on
                the seismic dt grid (nearest sample), convolved with a 25 Hz
                Ricker ('same', zero-fill outside).
(c) las_pipeline  realistic full pipeline: synthetic DT (US/M slowness, with a
                -999.25 gap AND a 1.0E+30 gap) + RHOB (g/cc) on a uniform MD
                grid down a deviated path -> MD -> TVDSS (minimum curvature)
                -> TWT (piecewise-linear checkshots, end-extrapolating, the
                makeTvdssToTwt convention) -> impedance resampled onto the
                uniform TWT grid (linear, gap-preserving) -> reflectivity ->
                Ricker convolution with validity mask.
(d) wavelet_extract  statistical wavelet extraction reference. Exact recipe:
                per trace zero-fill gaps + demean over valid samples; biased
                autocorrelation to lag nlag = round(lenMs/2/dt), averaged over
                traces; Hann half-taper h[k] = 0.5*(1 + cos(pi k/(nlag+1)));
                wrap into nfft = nextpow2(8*(2*nlag+1)); FFT -> power (real
                part clamped >= 0); amplitude = sqrt; circular boxcar smoothing
                of half-width round(smoothHz/df) bins; zero-phase wavelet =
                inverse FFT of the amplitude spectrum, unwrapped to +/- nlag,
                Hann-tapered again, peak-normalized to 1.
(e) bulk_shift  normalized cross-correlation bulk shift: positive lag means
                the synthetic must move DOWN (later) by lag*dt ms to match the
                seismic; correlation normalized per-lag over the overlapping
                mutually-valid samples.

Gap policy (mirrors the JS engine): a sample is a gap when it is not finite
(the LAS parser maps NULL -> NaN), when |v| >= 9.0e29 (seismic null 1.0E+30),
or when it equals a common raw LAS null (-999.25, -999, -9999, -9999.25).
Gaps are carried as JSON null in the goldens and NaN in the JS engine.

Convolution: numpy convolve 'same' with the gap samples zero-filled;
the validity mask is the INPUT sample's validity (a convolved value whose
own RC sample was a gap is display-only smear -> pen-break in the UI).

Run:  .venv/bin/python synthetics/gen_synthetics.py   (from tools/validation/seismolord)
Outputs: test-data/seismolord/synthetics/*.json (committed).
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from wells import mincurve  # noqa: E402

OUT = Path(__file__).resolve().parents[4] / 'test-data' / 'seismolord' / 'synthetics'

RAW_LAS_NULLS = (-999.25, -999.0, -9999.0, -9999.25)
BIG_NULL = 9.0e29


def is_gap(v: float) -> bool:
    if not math.isfinite(v):
        return True
    if abs(v) >= BIG_NULL:
        return True
    return v in RAW_LAS_NULLS


def arr(a) -> list:
    """float64 array -> JSON list, NaN/Inf -> null."""
    return [None if not math.isfinite(float(x)) else float(x) for x in a]


# ---------------------------------------------------------------------------
# Shared reference implementations (the exact spec the JS engine mirrors)
# ---------------------------------------------------------------------------

def ricker(freq_hz: float, dt_ms: float, half_length_ms: float) -> np.ndarray:
    n = round(half_length_ms / dt_ms)
    t = (np.arange(2 * n + 1) - n) * dt_ms / 1000.0
    x = (math.pi * freq_hz * t) ** 2
    return (1.0 - 2.0 * x) * np.exp(-x)


def convolve_same(signal: np.ndarray, wavelet: np.ndarray):
    """Zero-fill gaps, convolve 'same'; validity = input-sample validity."""
    valid = np.array([0 if is_gap(v) else 1 for v in signal], dtype=np.int64)
    s0 = np.where(valid == 1, signal, 0.0)
    out = np.convolve(s0, wavelet, mode='same')
    return out, valid


def checkshot_to_twt(cs: list, z: float) -> float:
    """EXACTLY engine/wellSection.js makeTvdssToTwt checkshots branch:
    segment scan with linear extrapolation off both ends."""
    i = 1
    while i < len(cs) - 1 and cs[i]['tvdss_m'] < z:
        i += 1
    a, b = cs[i - 1], cs[i]
    f = (z - a['tvdss_m']) / (b['tvdss_m'] - a['tvdss_m'])
    return a['twt_ms'] + f * (b['twt_ms'] - a['twt_ms'])


def resample_to_dt(twt_ms: np.ndarray, values: np.ndarray, dt_ms: float, ns: int) -> np.ndarray:
    """Linear interpolation onto the uniform TWT grid, gap-preserving.

    Samples whose TWT is a gap are dropped first; the remaining TWTs must be
    strictly increasing. An output sample is a gap (NaN) outside the covered
    range or when either bracketing input VALUE is a gap.
    """
    keep = [k for k in range(len(twt_ms)) if not is_gap(twt_ms[k])]
    t = np.array([twt_ms[k] for k in keep])
    v = np.array([values[k] for k in keep])
    out = np.full(ns, np.nan)
    if len(t) < 2:
        return out
    if np.any(np.diff(t) <= 0):
        raise ValueError('time-depth relationship is not strictly increasing')
    j = 0
    for i in range(ns):
        ti = i * dt_ms
        if ti < t[0] or ti > t[-1]:
            continue
        while j < len(t) - 2 and t[j + 1] < ti:
            j += 1
        if is_gap(v[j]) or is_gap(v[j + 1]):
            continue
        f = (ti - t[j]) / (t[j + 1] - t[j])
        out[i] = v[j] + f * (v[j + 1] - v[j])
    return out


def reflectivity(imp: np.ndarray) -> np.ndarray:
    """rc[i] from (imp[i-1], imp[i]); rc[0] is a gap (no interface above)."""
    rc = np.full(len(imp), np.nan)
    for i in range(1, len(imp)):
        a, b = imp[i - 1], imp[i]
        if is_gap(a) or is_gap(b) or (a + b) == 0:
            continue
        rc[i] = (b - a) / (b + a)
    return rc


def extract_statistical_wavelet(traces, dt_ms, wavelet_length_ms=120.0, smooth_hz=5.0):
    nlag = round(wavelet_length_ms / 2.0 / dt_ms)
    nw = 2 * nlag + 1
    r = np.zeros(nlag + 1)
    for tr in traces:
        x = np.array(tr, dtype=float)
        valid = np.array([not is_gap(v) for v in x])
        mean = x[valid].mean() if valid.any() else 0.0
        x = np.where(valid, x - mean, 0.0)
        for k in range(nlag + 1):
            r[k] += float(np.dot(x[:len(x) - k], x[k:])) / len(x)
    r /= len(traces)
    h = 0.5 * (1.0 + np.cos(math.pi * np.arange(nlag + 1) / (nlag + 1)))
    rt = r * h
    nfft = 1
    while nfft < 8 * nw:
        nfft *= 2
    buf = np.zeros(nfft)
    buf[0] = rt[0]
    for k in range(1, nlag + 1):
        buf[k] = rt[k]
        buf[nfft - k] = rt[k]
    power = np.maximum(np.real(np.fft.fft(buf)), 0.0)
    amp = np.sqrt(power)
    df = 1000.0 / (nfft * dt_ms)
    bs = round(smooth_hz / df)
    if bs > 0:
        sm = np.empty(nfft)
        for i in range(nfft):
            acc = 0.0
            for k in range(-bs, bs + 1):
                acc += amp[(i + k) % nfft]
            sm[i] = acc / (2 * bs + 1)
        amp = sm
    wt = np.real(np.fft.ifft(amp))
    wav = np.zeros(nw)
    wav[nlag] = wt[0]
    for k in range(1, nlag + 1):
        wav[nlag + k] = wt[k]
        wav[nlag - k] = wt[nfft - k]
    wav *= np.concatenate([h[::-1], h[1:]])
    peak = np.max(np.abs(wav))
    if peak > 0:
        wav /= peak
    return wav


def suggest_bulk_shift(synthetic, seismic, dt_ms, max_lag_ms, min_overlap=8):
    L = round(max_lag_ms / dt_ms)
    n = len(synthetic)
    best = None
    series = []
    for lag in range(-L, L + 1):
        num = ss = tt = 0.0
        count = 0
        for i in range(n):
            j = i + lag
            if j < 0 or j >= len(seismic):
                continue
            a, b = synthetic[i], seismic[j]
            if is_gap(a) or is_gap(b):
                continue
            num += a * b
            ss += a * a
            tt += b * b
            count += 1
        if count < min_overlap or ss == 0 or tt == 0:
            continue
        corr = num / math.sqrt(ss * tt)
        series.append({'lag_ms': lag * dt_ms, 'corr': corr})
        if best is None or corr > best['corr']:
            best = {'lag_ms': lag * dt_ms, 'corr': corr}
    return best, series


# ---------------------------------------------------------------------------
# (a) analytic Ricker
# ---------------------------------------------------------------------------

def case_ricker():
    freq, dt_ms, half_ms = 25.0, 2.0, 60.0
    w = ricker(freq, dt_ms, half_ms)
    n = round(half_ms / dt_ms)

    # self-assert: symmetric, peak 1.0 at t = 0
    assert w[n] == 1.0
    assert np.allclose(w, w[::-1], atol=0, rtol=0)
    # analytic zero crossing t0 = 1/(pi f sqrt(2)): r(t0) == 0 exactly
    t0 = 1.0 / (math.pi * freq * math.sqrt(2.0))
    x = (math.pi * freq * t0) ** 2
    assert abs((1 - 2 * x) * math.exp(-x)) < 1e-15
    # the sampled wavelet changes sign across the analytic crossing
    k = int(t0 * 1000.0 / dt_ms)   # sample just inside the crossing
    assert w[n + k] > 0 > w[n + k + 1], 'discrete samples must straddle the analytic zero'
    # side lobes are negative and symmetric
    assert w[n + k + 1] == w[n - k - 1] < 0

    return {
        'description': 'analytic Ricker wavelet, r(t) = (1-2pi^2f^2t^2)exp(-pi^2f^2t^2)',
        'freq_hz': freq, 'dt_ms': dt_ms, 'half_length_ms': half_ms,
        'zero_crossing_ms': t0 * 1000.0,
        'samples': arr(w),
    }


# ---------------------------------------------------------------------------
# (b) 3-layer wedge, hand-checked RCs, spikes placed in TWT
# ---------------------------------------------------------------------------

def case_wedge():
    layers = [
        {'v_mps': 2000.0, 'rho_gcc': 2.0},   # Z = 4000
        {'v_mps': 2500.0, 'rho_gcc': 2.2},   # Z = 5500
        {'v_mps': 3000.0, 'rho_gcc': 2.4},   # Z = 7200
    ]
    interfaces_m = [150.0, 300.0]            # TVDSS of layer bases 1 and 2
    z = [l['v_mps'] * l['rho_gcc'] for l in layers]

    # self-assert the RC values BY HAND: R = (Z2-Z1)/(Z2+Z1)
    rc1 = (z[1] - z[0]) / (z[1] + z[0])
    rc2 = (z[2] - z[1]) / (z[2] + z[1])
    assert abs(rc1 - 1500.0 / 9500.0) < 1e-15 and abs(rc1 - 0.15789473684) < 1e-10
    assert abs(rc2 - 1700.0 / 12700.0) < 1e-15 and abs(rc2 - 0.13385826771) < 1e-10

    # known checkshot function: constant velocity per layer
    # t(150 m) = 2*150/2000 = 150 ms; t(300 m) = 150 + 2*150/2500 = 270 ms
    t1 = 2000.0 * interfaces_m[0] / layers[0]['v_mps']
    t2 = t1 + 2000.0 * (interfaces_m[1] - interfaces_m[0]) / layers[1]['v_mps']
    assert t1 == 150.0 and t2 == 270.0
    checkshots = [
        {'tvdss_m': 0.0, 'twt_ms': 0.0},
        {'tvdss_m': 150.0, 'twt_ms': t1},
        {'tvdss_m': 300.0, 'twt_ms': t2},
        {'tvdss_m': 600.0, 'twt_ms': t2 + 2000.0 * 300.0 / layers[2]['v_mps']},
    ]
    assert abs(checkshot_to_twt(checkshots, 150.0) - 150.0) < 1e-12
    assert abs(checkshot_to_twt(checkshots, 300.0) - 270.0) < 1e-12
    # extrapolation checks (the makeTvdssToTwt convention)
    assert abs(checkshot_to_twt(checkshots, 700.0) - (470.0 + 2000.0 * 100.0 / 3000.0)) < 1e-9

    # RC spikes on the seismic grid: nearest sample (dt = 2 ms)
    dt_ms, ns = 2.0, 251
    rc = np.zeros(ns)
    spikes = []
    for rc_val, z_if in ((rc1, interfaces_m[0]), (rc2, interfaces_m[1])):
        t = checkshot_to_twt(checkshots, z_if)
        k = round(t / dt_ms)
        rc[k] += rc_val
        spikes.append({'tvdss_m': z_if, 'twt_ms': t, 'sample': k, 'rc': rc_val})
    assert spikes[0]['sample'] == 75 and spikes[1]['sample'] == 135

    wav = ricker(25.0, dt_ms, 60.0)
    syn, valid = convolve_same(rc, wav)
    assert valid.min() == 1                       # no gaps in this case
    # peaks of the synthetic sit AT the spike samples (zero-phase wavelet),
    # SEG normal polarity: impedance increase -> positive amplitude
    assert syn[75] == np.max(syn[70:81]) and syn[75] > 0
    assert syn[135] == np.max(syn[130:141]) and syn[135] > 0
    # far from both interfaces (wavelet half-length 60 ms) the trace is 0
    assert np.max(np.abs(syn[0:30])) == 0.0

    return {
        'description': '3-layer wedge: hand-checked RCs placed in TWT, 25 Hz Ricker',
        'layers': layers, 'interfaces_tvdss_m': interfaces_m,
        'impedances': z, 'checkshots': checkshots,
        'dt_ms': dt_ms, 'ns': ns,
        'wavelet': {'freq_hz': 25.0, 'half_length_ms': 60.0},
        'spikes': spikes,
        'rc': arr(rc),
        'synthetic': arr(syn),
    }


# ---------------------------------------------------------------------------
# (c) realistic LAS pipeline down a deviated path
# ---------------------------------------------------------------------------

def make_md_to_tvdss(stations, kb_m):
    """MD -> TVDSS via the validated minimum-curvature reference,
    interpolating along the exact arc (mirrors engine positionAtMd)."""
    sts = [(s['md'], s['inc'], s['azi']) for s in stations]
    pos = mincurve.positions(sts)

    def md_to_tvdss(md):
        if md < sts[0][0] or md > sts[-1][0]:
            return None
        i = 1
        while i < len(sts) - 1 and sts[i][0] < md:
            i += 1
        (md1, i1, a1), (md2, i2, a2) = sts[i - 1], sts[i]
        dmd = md2 - md1
        f = (md - md1) / dmd
        t1 = mincurve.tangent(i1, a1)
        t2 = mincurve.tangent(i2, a2)
        beta = mincurve.dogleg_rad(i1, a1, i2, a2)
        p1 = (pos[i - 1][1], pos[i - 1][2], pos[i - 1][3])
        p = mincurve.arc_point(p1, t1, t2, dmd, beta, f)
        return p[2] - kb_m       # tvd below KB -> tvdss below datum
    return md_to_tvdss


def case_las_pipeline():
    # deviated well: vertical to 200 m, build to 30 deg by 500 m, hold
    stations = [
        {'md': 0.0, 'inc': 0.0, 'azi': 45.0},
        {'md': 200.0, 'inc': 0.0, 'azi': 45.0},
        {'md': 500.0, 'inc': 30.0, 'azi': 45.0},
        {'md': 1200.0, 'inc': 30.0, 'azi': 45.0},
    ]
    kb_m = 25.0
    md_to_tvdss = make_md_to_tvdss(stations, kb_m)
    # sanity: vertical part is exact, hold part shallower than MD
    assert abs(md_to_tvdss(100.0) - (100.0 - kb_m)) < 1e-9
    assert md_to_tvdss(1200.0) < 1200.0 - kb_m

    # checkshots: increasing-velocity piecewise table over the well's range
    checkshots = [
        {'tvdss_m': 0.0, 'twt_ms': 0.0},
        {'tvdss_m': 200.0, 'twt_ms': 210.0},
        {'tvdss_m': 500.0, 'twt_ms': 480.0},
        {'tvdss_m': 900.0, 'twt_ms': 790.0},
        {'tvdss_m': 1200.0, 'twt_ms': 1000.0},
    ]

    # DT (US/M) + RHOB (g/cc) on MD 400..1000 step 1 m: three rock
    # packages with steps at MD 600 and 800 plus a gentle compaction trend
    n = 601
    md0, step = 400.0, 1.0
    md = md0 + step * np.arange(n)
    dt_us = np.where(md < 600.0, 500.0 - 0.02 * (md - 400.0),
                     np.where(md < 800.0, 400.0 - 0.01 * (md - 600.0), 330.0))
    rhob = np.where(md < 600.0, 2.10, np.where(md < 800.0, 2.30, 2.45))
    # gaps: a washed-out zone as raw -999.25 and a second zone as 1.0E+30
    dt_curve = dt_us.copy()
    dt_curve[250:260] = -999.25
    dt_curve[400:405] = 1.0e30

    velocity = np.array([np.nan if is_gap(v) else 1e6 / v for v in dt_curve])
    imp = np.array([np.nan if (is_gap(v) or is_gap(r)) else v * r
                    for v, r in zip(velocity, rhob)])
    # self-assert impedance by hand at a clean sample: md=400 -> dt=500 us/m
    # -> v = 2000 m/s, rho 2.10 -> Z = 4200
    assert abs(imp[0] - 4200.0) < 1e-9

    twt = np.array([checkshot_to_twt(checkshots, md_to_tvdss(m)) for m in md])
    assert np.all(np.diff(twt) > 0)

    dt_ms, ns = 2.0, 501
    imp_time = resample_to_dt(twt, imp, dt_ms, ns)
    # gap zones survive resampling as gaps
    gap_t0 = twt[249]     # last valid sample before the -999.25 zone
    gap_t1 = twt[260]     # first valid sample after it
    k_in_gap = int(math.ceil(gap_t0 / dt_ms)) + 1
    assert k_in_gap * dt_ms < gap_t1 and math.isnan(imp_time[k_in_gap])

    rc = reflectivity(imp_time)
    wav = ricker(25.0, dt_ms, 60.0)
    syn, valid = convolve_same(rc, wav)
    # the interface at MD 600 (a dt AND rho step) must be the strongest
    # positive reflector: find its TWT
    t_if = checkshot_to_twt(checkshots, md_to_tvdss(600.0))
    k_if = round(t_if / dt_ms)
    k_max = int(np.nanargmax(np.where(valid == 1, syn, -np.inf)))
    assert abs(k_max - k_if) <= 1, (k_max, k_if)

    return {
        'description': 'full LAS pipeline: DT+RHOB down a deviated path, gaps, checkshots',
        'stations': stations, 'kb_m': kb_m, 'checkshots': checkshots,
        'md_start_m': md0, 'md_step_m': step, 'n_samples': n,
        'dt_curve_us_per_m': arr(dt_curve),
        'rhob_curve_gcc': arr(rhob),
        'dt_ms': dt_ms, 'ns': ns,
        'wavelet': {'freq_hz': 25.0, 'half_length_ms': 60.0},
        'expected': {
            'twt_ms': arr(twt),
            'impedance_time': arr(imp_time),
            'rc': arr(rc),
            'synthetic': arr(syn),
            'validity': [int(v) for v in valid],
        },
    }


# ---------------------------------------------------------------------------
# (d) statistical wavelet extraction
# ---------------------------------------------------------------------------

def case_wavelet_extract():
    dt_ms, ns = 2.0, 501
    rng = np.random.default_rng(20260713)
    true_freq = 30.0
    wav_true = ricker(true_freq, dt_ms, 60.0)
    traces = []
    for _ in range(3):
        refl = rng.normal(0.0, 0.1, ns)
        traces.append(np.convolve(refl, wav_true, mode='same'))
    # a gap in one trace exercises the zero-fill + valid-mean path
    traces[2][100:110] = np.nan

    opts = {'wavelet_length_ms': 120.0, 'smooth_hz': 5.0}
    wav = extract_statistical_wavelet(traces, dt_ms, **{
        'wavelet_length_ms': opts['wavelet_length_ms'], 'smooth_hz': opts['smooth_hz']})
    nlag = round(opts['wavelet_length_ms'] / 2.0 / dt_ms)

    # self-asserts: zero-phase (symmetric), peak 1.0 at centre
    assert np.allclose(wav, wav[::-1], rtol=0, atol=1e-12)
    assert wav[nlag] == np.max(np.abs(wav)) == 1.0
    # dominant frequency of the extraction ~ the true wavelet's spectral
    # peak (statistical method: within a smoothing bandwidth)
    nfft = 4096
    spec = np.abs(np.fft.rfft(wav, nfft))
    f_peak = np.argmax(spec) / (nfft * dt_ms / 1000.0)
    assert abs(f_peak - true_freq) < 6.0, f_peak

    return {
        'description': 'statistical wavelet extraction from 3 synthetic traces (one with a gap)',
        'dt_ms': dt_ms,
        'opts': opts,
        'traces': [arr(t) for t in traces],
        'true_freq_hz': true_freq,
        'expected_wavelet': arr(wav),
    }


# ---------------------------------------------------------------------------
# (e) cross-correlation bulk shift
# ---------------------------------------------------------------------------

def case_bulk_shift():
    dt_ms, ns = 2.0, 401
    rng = np.random.default_rng(42)
    refl = rng.normal(0.0, 0.1, ns)
    wav = ricker(25.0, dt_ms, 60.0)
    synthetic = np.convolve(refl, wav, mode='same')

    shift_samples = 4                     # seismic is 8 ms LATER
    seismic = np.zeros(ns)
    seismic[shift_samples:] = synthetic[:ns - shift_samples]
    seismic += rng.normal(0.0, 0.02, ns)  # 5%-ish noise
    seismic[10:14] = 1.0e30               # null gap in the real trace

    best, series = suggest_bulk_shift(synthetic, seismic, dt_ms, 40.0)
    assert best['lag_ms'] == shift_samples * dt_ms, best
    assert best['corr'] > 0.9, best

    return {
        'description': 'bulk shift: seismic = synthetic delayed 8 ms + noise + a null gap',
        'dt_ms': dt_ms, 'max_lag_ms': 40.0,
        'synthetic': arr(synthetic),
        'seismic': arr(seismic),
        'expected': {'lag_ms': best['lag_ms'], 'corr': best['corr']},
    }


def main():
    mincurve.self_check()                 # upstream reference stays proven
    cases = {
        'ricker': case_ricker(),
        'wedge': case_wedge(),
        'las_pipeline': case_las_pipeline(),
        'wavelet_extract': case_wavelet_extract(),
        'bulk_shift': case_bulk_shift(),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for name, payload in cases.items():
        path = OUT / f'{name}.json'
        path.write_text(json.dumps(payload, indent=1) + '\n')
        print(f'wrote {path} ({path.stat().st_size} bytes)')
    print('all self-asserts passed')


if __name__ == '__main__':
    main()
