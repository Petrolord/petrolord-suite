import React, { useCallback } from 'react';
import SyntheticsPanel from './components/SyntheticsPanel';
import { surveyAffine } from './engine/surveyGeometry';
import { makeTvdssToTwt } from './engine/wellSection';
import { computeWellPath, positionAtMd } from './engine/wellPath';
import { buildSynthetic, rickerWavelet, convolveSame } from './engine/synthetics';

// Dev-only harness route (/dev/seismolord-synthetics, DEV builds only):
// the REAL SyntheticsPanel on the KNOWN 3-layer wedge from the oracle
// goldens — DT 500/400/333.33 US/M and RHOB 2.0/2.2/2.4 with interfaces
// at 150 m and 300 m TVDSS, checkshots putting them at exactly 150 ms
// and 270 ms TWT. The "real seismic" corridor is the ideal wedge
// synthetic delayed by +8 ms, so driving well -> Synthesize -> Suggest
// must recover +8 ms; a -999.25 washout in DT exercises the validity
// pen-breaks. synthesize() runs the engine directly (no worker), so the
// whole flow is drivable without auth or Supabase.

const GEOM = { nIl: 16, nXl: 16, ns: 251 };
const DT_US = 2000;
const DT_MS = DT_US / 1000;

const AFFINE = surveyAffine({
  affine: {
    origin: { x: 0, y: 0 },
    il_vec: { x: 0, y: 25 },
    xl_vec: { x: 25, y: 0 },
  },
});

const CHECKSHOTS = [
  { tvdss_m: 0, twt_ms: 0 },
  { tvdss_m: 150, twt_ms: 150 },
  { tvdss_m: 300, twt_ms: 270 },
  { tvdss_m: 600, twt_ms: 470 },
];

const WELL = {
  id: 'w-syn',
  name: 'W-SYN',
  surface_x: 200,
  surface_y: 200,
  kb_m: 0,
  td_md_m: 600,
  deviation: [],
  checkshots: CHECKSHOTS,
  tops: [{ name: 'TopA', md: 150 }, { name: 'TopB', md: 300 }],
};

// DT (US/M) and RHOB (g/cc) on MD 0..600 step 1 — the wedge layers,
// plus a raw-LAS-null washout in DT at 350..359 m
const N = 601;
const DT_CURVE = new Float32Array(N);
const RHOB_CURVE = new Float32Array(N);
for (let i = 0; i < N; i++) {
  DT_CURVE[i] = i < 150 ? 500 : i < 300 ? 400 : 1e6 / 3000;
  RHOB_CURVE[i] = i < 150 ? 2.0 : i < 300 ? 2.2 : 2.4;
}
for (let i = 350; i < 360; i++) DT_CURVE[i] = -999.25;

const LOGS = [
  {
    id: 'log-dt', well_id: 'w-syn', mnemonic: 'DT', unit: 'US/M',
    start_md_m: 0, stop_md_m: 600, step_m: 1, n_samples: N,
  },
  {
    id: 'log-rhob', well_id: 'w-syn', mnemonic: 'RHOB', unit: 'G/CC',
    start_md_m: 0, stop_md_m: 600, step_m: 1, n_samples: N,
  },
];
const CURVES = { 'log-dt': DT_CURVE, 'log-rhob': RHOB_CURVE };

// "real seismic": the ideal wedge reflectivity (hand RCs at 150/270 ms)
// convolved with the same 25 Hz Ricker, delayed by +8 ms (4 samples)
const SHIFT_SAMPLES = 4;
const SEISMIC = (() => {
  const rc = new Float32Array(GEOM.ns);
  rc[75 + SHIFT_SAMPLES] = 1500 / 9500;
  rc[135 + SHIFT_SAMPLES] = 1700 / 12700;
  return convolveSame(rc, rickerWavelet(25, DT_MS, 60)).data;
})();

const HORIZONS = [{ id: 'hz1', name: 'Horizon 1' }];
const GRID_HZ1 = new Float32Array(GEOM.nIl * GEOM.nXl).fill(75 + SHIFT_SAMPLES);

export default function SeismolordSyntheticsHarness() {
  // the worker's pipeline, run inline (engine is pure and jest-tested)
  const synthesize = useCallback(async (params) => {
    const path = computeWellPath(params.stations, {
      surfaceX: params.surfaceX, surfaceY: params.surfaceY, kb: params.kbM,
    });
    const conv = makeTvdssToTwt({
      checkshots: params.checkshots,
      velocity: params.velocity,
      boundaries: params.boundaries,
      dtUs: params.dtUs,
      maxTwtMs: params.maxTwtMs,
    });
    if (!conv) throw new Error('No time-depth relationship for this well.');
    const r = buildSynthetic({
      dtCurve: params.dtCurve,
      rhobCurve: params.rhobCurve,
      constantRhoGcc: params.constantRhoGcc,
      mdArray: params.mdArray,
      mdStartM: params.mdStartM,
      mdStepM: params.mdStepM,
      mdToTvdss: (md) => {
        const p = positionAtMd(params.stations, path, md);
        return p ? p.tvdss : null;
      },
      tvdssToTwt: (z) => conv.toTwtMs(z),
      dtMs: params.dtUs / 1000,
      ns: params.ns,
      wavelet: params.wavelet,
    });
    return { ...r, timeSource: conv.source };
  }, []);

  const getTraces = useCallback(async (ilIdx, xlIdx, half) => {
    const traces = [];
    for (let d = -half; d <= half; d++) {
      const t = Float32Array.from(SEISMIC);
      if (d !== 0) for (let i = 0; i < t.length; i++) t[i] *= 0.9;
      traces.push(t);
    }
    return traces;
  }, []);

  return (
    <div style={{ background: '#0b1220', minHeight: '100vh', color: '#cbd5e1', padding: 16 }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>
        Seismolord synthetics harness (known wedge, seismic delayed +8 ms)
      </h1>
      <div style={{ width: 900, height: 760 }}>
        <SyntheticsPanel
          wells={[WELL]}
          listLogs={async (wellId) => (wellId === 'w-syn' ? LOGS : [])}
          downloadCurve={async (log) => Float32Array.from(CURVES[log.id])}
          synthesize={synthesize}
          getTraces={getTraces}
          horizons={HORIZONS}
          loadGrid={async () => GRID_HZ1}
          affine={AFFINE}
          geom={GEOM}
          dtUs={DT_US}
          velocity={null}
          boundaries={null}
        />
      </div>
    </div>
  );
}
