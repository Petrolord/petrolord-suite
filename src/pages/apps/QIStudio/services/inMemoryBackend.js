// In-memory QI Studio backend for the dev harness and tests: three wells
// with different gaps (one complete, one with no shear log or checkshots,
// one with no elevation and a digitized density), one seismic volume, and a
// job client that runs the real QC runner on a small synthetic volume (a
// 30 Hz signal with a stripe every 4 crosslines) so the harness shows results.
import { runSeismicQc, qcIssues } from './qcRun';

const log = (mnemonic, start, stop, extra = {}) => ({ id: `${mnemonic}-${start}`, mnemonic, start_md_m: start, stop_md_m: stop, step_m: 0.5, ...extra });
const zones = (wellId) => [
  { id: `${wellId}-a`, name: 'SAND A', top_md_m: 2000, base_md_m: 2080 },
  { id: `${wellId}-b`, name: 'SAND B', top_md_m: 2300, base_md_m: 2360 },
];

// a committed tie with its stored wavelet (a phase-rotated Ricker)
function tieRecord(meanCorr, phaseDeg, peakHz) {
  const dt = 2; const half = 30;
  const samples = Array.from({ length: 2 * half + 1 }, (_, i) => {
    const t = ((i - half) * dt) / 1000; const a = (Math.PI * peakHz * t) ** 2;
    const r = (1 - 2 * a) * Math.exp(-a);
    const q = -Math.PI * peakHz * t * (3 - 2 * a) * Math.exp(-a);
    const p = (phaseDeg * Math.PI) / 180;
    return Number((Math.cos(p) * r + Math.sin(p) * q).toPrecision(5));
  });
  return { rows: [], provenance: { qc: { mean_corr: meanCorr, min_corr: meanCorr - 0.2, bulk_shift_ms: 4, anchors: 2, measured_at: '2026-10-01T10:00:00Z', wavelet: { kind: 'well', peak_hz: peakHz, phase_deg: phaseDeg, dt_ms: dt, samples } } } };
}

export function makeInMemoryBackend() {
  const wells = [
    {
      well: { id: 'qi-w1', name: 'KETA-1', checkshots_derived: tieRecord(0.82, 0, 30), kb_m: 30, depth_ref_elev_m: 30, depth_ref_kind: 'KB', checkshots: [{ tvdss_m: 1500, twt_ms: 1300 }, { tvdss_m: 2400, twt_ms: 1950 }], deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 3000, inc: 0, azi: 0 }], is_own: true },
      logs: [log('GR', 1500, 2800), log('DT', 1500, 2800), log('DTSM', 1500, 2800), log('RHOB', 1500, 2800), log('PHIE', 1500, 2800), log('VSH', 1500, 2800), log('SW', 1500, 2800)],
    },
    {
      well: { id: 'qi-w2', name: 'AKOMA-2', checkshots_derived: tieRecord(0.58, 45, 26), kb_m: 28, depth_ref_elev_m: 28, depth_ref_kind: 'KB', checkshots: [], deviation: [], is_own: true },
      logs: [log('GR', 1800, 2500), log('DTCO', 1800, 2500), log('RHOZ', 1800, 2500), log('PHIT', 1800, 2500), log('VSH', 1800, 2500), log('SW', 1800, 2500)],
    },
    {
      well: { id: 'qi-w3', name: 'BONSU-3', depth_ref_kind: 'KB', depth_ref_elev_m: null, ground_elev_m: null, checkshots: [{ tvdss_m: 1900, twt_ms: 1600 }, { tvdss_m: 2300, twt_ms: 1880 }], deviation: [], is_own: true },
      logs: [log('GR', 1900, 2340), log('DT', 1900, 2340), log('RHOB_DIG', 1900, 2340, { provenance: { digitized: true } })],
    },
  ];
  return {
    async listWells() { return wells.map((w) => w.well); },
    async loadWell(well) {
      const w = wells.find((x) => x.well.id === well.id);
      return { well: w.well, logs: w.logs, zones: zones(w.well.id), tops: [] };
    },
    async listVolumes() { return [{ id: 'qi-v1', name: 'Keta 3D full stack', kind: 'seismic', status: 'ready' }]; },
    async countSurfaces() { return 2; },
    jobs: makeInMemoryJobs(),
  };
}

function makeInMemoryJobs() {
  const nIl = 16; const nXl = 32; const ns = 192; const b = 16;
  const grid = [1, 2, 12];
  const value = (il, xl, s) => Math.sin(s * 0.37 + il * 0.2) * Math.cos(s * 0.11) * (xl % 4 === 0 ? 1.5 : 1) + 0.2 * Math.sin(il * 13.1 + xl * 7.7 + s * 3.3);
  const getBrick = async (bi, bj, bk) => {
    const out = new Float32Array(b * b * b);
    for (let li = 0; li < b; li++) for (let lj = 0; lj < b; lj++) for (let lk = 0; lk < b; lk++) {
      const il = bi * b + li; const xl = bj * b + lj; const s = bk * b + lk;
      if (il < nIl && xl < nXl && s < ns) out[(li * b + lj) * b + lk] = value(il, xl, s);
    }
    return out;
  };
  const results = new Map();
  let n = 0;
  return {
    async enqueueJob(kind, params) {
      n += 1;
      const id = `mem-job-${n}`;
      const qc = await runSeismicQc({ getBrick, geom: { nIl, nXl, ns, brickSize: b, grid }, dtMs: 2, inlines: 6 });
      results.set(id, { id, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { volume_id: params.volume_id, volume_name: 'Keta 3D full stack', qc, issues: qcIssues(qc, 'Keta 3D full stack') } });
      return id;
    },
    watchJob(id, onUpdate) { onUpdate(results.get(id), null); return () => {}; },
  };
}
