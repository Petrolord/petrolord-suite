// In-memory QI Studio backend for the dev harness and tests: three wells
// with different gaps (one complete, one with no shear log or checkshots,
// one with no elevation and a digitized density), one seismic volume, and a
// job client that runs the real QC runner on a small synthetic volume (a
// 30 Hz signal with a stripe every 4 crosslines) so the harness shows results.
import { runSeismicQc, qcIssues } from './qcRun';
import { readDepthSurface } from '@/lib/readDepthSurface';

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
      well: { id: 'qi-w1', name: 'KETA-1', checkshots_derived: tieRecord(0.82, 0, 30), kb_m: 30, depth_ref_elev_m: 30, depth_ref_kind: 'KB', checkshots: [{ tvdss_m: 1500, twt_ms: 1300 }, { tvdss_m: 2400, twt_ms: 1950 }], deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 3000, inc: 0, azi: 0 }], surface_x: 200, surface_y: 125, is_own: true },
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
    // the inversion inputs: a 16 x 32 survey at 4 ms on a 25 m grid, two horizons, synthetic curves
    async loadVolumeFrame() { return { dtMs: 4, nIl: 16, nXl: 32, ns: 600, affine: { origin: { x: 0, y: 0 }, ilVec: { x: 0, y: 25 }, xlVec: { x: 25, y: 0 } } }; },
    async listHorizons() { return [{ id: 'qi-h1', name: 'Top Sand A', is_own: true }, { id: 'qi-h2', name: 'Base Sand B', is_own: true }]; },
    async downloadCurve(l) {
      const n = Math.round((l.stop_md_m - l.start_md_m) / l.step_m) + 1;
      const dt = /^DT/.test(l.mnemonic);
      if (/^PHI/.test(l.mnemonic)) return Float32Array.from({ length: n }, (_, i) => 0.2 + 0.05 * Math.sin(i / 55));
      if (/FACIES/.test(l.mnemonic)) return Float32Array.from({ length: n }, (_, i) => (Math.sin(i / 55) > 0 ? 1 : 2));
      return Float32Array.from({ length: n }, (_, i) => (dt ? 330 - 0.03 * i * l.step_m + 15 * Math.sin(i / 40) : 2.3 + 0.0001 * i * l.step_m + 0.04 * Math.sin(i / 55)));
    },
    async registerInversionVolume({ volume, name }) { return { id: `mem-inv-${volume.id}`, name, status: 'ingesting' }; },
    async registerPrestackVolume({ volume, name, summary }) { return { id: `mem-sim-${volume.id}-${summary.product}`, name, status: 'ingesting' }; },
    async registerAvoVolume({ volume, name, summary }) { return { id: `mem-avo-${volume.id}-${summary.product}`, name, status: 'ingesting' }; },
    async registerPropertyVolume({ aiVolumeId, name, summary }) { return { id: `mem-prop-${aiVolumeId}-${summary.product}`, name, status: 'ingesting' }; },
    async removeVolume() {},
    // worker files: one uploaded prestack file, one gather store, one angle stack
    async listDatasets() {
      return [
        { id: 'qi-d1', name: 'Keta CDP gathers', kind: 'segy_upload', status: 'uploaded', bytes: 12 * 1024 ** 3, meta: {} },
        { id: 'qi-d2', name: 'Keta CDP gathers gathers', kind: 'gathers_offset', status: 'uploaded', bytes: 9 * 1024 ** 3, meta: { traces: 2400000, bins: 60, bin_width_m: 50 } },
        { id: 'qi-d3', name: 'Keta near', kind: 'segy_upload', status: 'uploaded', bytes: 2 * 1024 ** 3, meta: { partial_stack: { name: 'near', from: 0, to: 15 } } },
      ];
    },
    // a published Rock Physics gather at every well with logs: Sand A top at 2000 m, a class III gas response in situ
    async loadRockPhysicsGather(well) {
      if (!/KETA/.test(well.name)) return { ok: false, reason: 'No Rock Physics gather published for this well.' };
      return { ok: true, gather: { zone: { name: 'SAND A', top_md_m: 2000 }, cases: [{ key: 'in-situ', intercept: -0.05, gradient: -0.12 }, { key: 'substituted', intercept: -0.02, gradient: -0.03 }] } };
    },
    async convertStack() { return { jobId: 'mem-convert', volumeId: 'mem-vol' }; },
    // a dome (Top Sand A) and an RMS amplitude map bright above a flat contact at 2100 m
    async listSurfaces() {
      return [
        { id: 'qi-s1', name: 'Top Sand A depth', z_domain: 'elevation', z_unit: 'm', xy_unit: 'm', nx: 81, ny: 81, dx: 25, dy: 25, origin_x: 0, origin_y: 0 },
        { id: 'qi-s2', name: 'Top Sand A RMS amplitude', z_domain: 'attribute', z_unit: null, xy_unit: 'm', nx: 81, ny: 81, dx: 25, dy: 25, origin_x: 0, origin_y: 0 },
      ];
    },
    async loadSurface(row, { attribute = false } = {}) {
      const elev = Float32Array.from({ length: 81 * 81 }, (_, i) => { const x = (i % 81) * 25 - 1000; const y = Math.floor(i / 81) * 25 - 1000; return -2000 - 0.0004 * (x * x + y * y); });
      const grid = row.id === 'qi-s2' ? Float32Array.from(elev, (v) => (v >= -2100 ? 1 : 0.1)) : elev;
      return readDepthSurface(row, grid, attribute ? { accept: ['attribute'], xy: 'm' } : { accept: ['elevation', 'depth'], as: 'elevation', xy: 'm' });
    },
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
      if (kind === 'prestack_qc') {
        const times = [{ t_ms: 900, rmoMedian: 2.1, rmoQ90: 5.6, rmoShareOver4: 0.22, stretchMuteM: 2450 }, { t_ms: 1650, rmoMedian: 1.2, rmoQ90: 2.9, rmoShareOver4: 0.04, stretchMuteM: 3900 }];
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { dataset_id: params.dataset_id, cdps: 1480, stride: 4, maxStretch: 0.3, fold: { median: 58, lowShare: 0.06, farMedianM: 3000 }, times, issues: [{ key: 'prestack-qc:mem:rmo:900', area: 'Prestack QC', severity: 'medium', title: 'Residual moveout at 900 ms', detail: 'up to 5.6 ms', remedy: 'Flatten the gathers.' }] } });
        return id;
      }
      if (kind === 'prestack_inversion') {
        const blind = params.inversion.wells.map((w, i) => ({ name: w.name, blind: { ai: { rmsPct: 4.1 + i, corr: 0.9 }, si: { rmsPct: 5.2 + i, corr: 0.86 }, rho: { rmsPct: 3.3 + i, corr: 0.62 } }, withWell: { ai: { rmsPct: 2.5 }, si: { rmsPct: 3 }, rho: { rmsPct: 2 } } }));
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { mode: params.mode, settings: { method: 'Fatti three-term simultaneous inversion', vs_vp: 0.52, wavelet_scale: 1.1 }, blind, ...(params.volume_ids ? { volume_ids: params.volume_ids } : {}) } });
        return id;
      }
      if (kind === 'sample_volumes' && params.traces) {
        // stack traces at the wells: a band-limited wiggle per stack
        const tr = (k) => Array.from({ length: 600 }, (_, i) => Number((0.05 * Math.sin(i / (3 + k)) * Math.cos(i / 17)).toPrecision(6)));
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { dt_ms: 4, ns: 600, points: params.points.map((q) => ({ name: q.name, traces: params.volume_ids.map((_, k) => tr(k)) })) } });
        return id;
      }
      if (kind === 'sample_volumes') {
        // the seismic at twice the model's scale, as a calibration would find
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { points: params.points.map((q) => ({ name: q.name, t_ms: q.t_ms, values: [-0.1, -0.24] })) } });
        return id;
      }
      if (kind === 'avo_volumes') {
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { volume_ids: params.products, stacks: params.stacks, vs_vp: params.vs_vp } });
        return id;
      }
      if (kind === 'ingest_gathers') {
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { dataset_id: 'mem-gathers', traces: 2400000, blocks: 900, bins: { width: params.bin_width_m, count: 60 } } });
        return id;
      }
      if (kind === 'angle_stacks') {
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { source_dataset_id: params.dataset_id, stacks: params.ranges.map((r, k) => ({ ...r, dataset_id: `mem-stack-${k}`, traces: 40000 })), usable_angle: { q10: 31.5, q50: 38.2, q90: 42.9, cdps: 40000 } } });
        return id;
      }
      if (kind === 'export_segy') {
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), engine_commit: 'suite-harness+engines-harness', result_refs: { volume_id: params.volume_id, file_name: 'export.sgy', bytes: 1024, traces: 512, url: 'https://storage.petrolord.com/harness/export.sgy', expires_at: new Date(Date.now() + 864e5).toISOString() } });
        return id;
      }
      if (kind === 'property_prediction') {
        // an illustrative result in the worker's shape (the maths is gated in the worker and engine tests)
        const pr = params.property;
        const rows = pr.wells.map((w, i) => (pr.kind === 'facies' ? { name: w.name, n: 150, accuracy: 0.86 - 0.05 * i } : { name: w.name, n: 150, rms: 0.021 + 0.004 * i, corr: 0.82 - 0.05 * i, coverage: 0.78 + 0.03 * i }));
        const summary = pr.kind === 'facies'
          ? { classes: Object.values(pr.names).map((n, i) => ({ name: n, n: 200 - 40 * i, prior: 0.5 - 0.1 * i, mean: 6200 + 900 * i, sd: 450 })), density: pr.density || 'gaussian' }
          : { a: 0.41, b: -3.4e-5, r2: 0.74, n: 600, s: 0.018 };
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { mode: params.mode, settings: { kind: pr.kind }, summary, rows, ...(params.volume_ids ? { volume_ids: params.volume_ids } : {}) } });
        return id;
      }
      if (kind === 'poststack_inversion') {
        // an illustrative result in the worker's shape (the maths is gated in the worker and engine tests)
        const blind = params.inversion.wells.map((w, i) => ({ name: w.name, blind: { corr: 0.9 - 0.04 * i, rmsPct: 4 + 2.5 * i, n: 120 }, withWell: { corr: 0.96, rmsPct: 2.5, n: 120 } }));
        const sens = params.inversion.sensitivity;
        const sensitivity = sens ? {
          scenarios: ['scenario 1', 'scenario 2', 'scenario 3'],
          rows: params.inversion.wells.map((w, i) => ({ name: w.name, q10: 3 + i, q50: 5 + i, q90: 8 + i })),
          byScenario: [{ label: 'scenario 1', meanRmsPct: 4.5 }, { label: 'scenario 2', meanRmsPct: 6.1 }, { label: 'scenario 3', meanRmsPct: 9.8 }],
        } : null;
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { mode: params.mode, volume_id: params.volume_id, ...(params.volume_ids ? { volume_ids: params.volume_ids } : {}), settings: { method: params.inversion.method, qi_class: 'elastic_estimate', wavelet_scale: 1.2 }, blind, ...(sensitivity ? { sensitivity } : {}) } });
        return id;
      }
      const qc = await runSeismicQc({ getBrick, geom: { nIl, nXl, ns, brickSize: b, grid }, dtMs: 2, inlines: 6 });
      results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { volume_id: params.volume_id, volume_name: 'Keta 3D full stack', qc, issues: qcIssues(qc, 'Keta 3D full stack') } });
      return id;
    },
    watchJob(id, onUpdate) { onUpdate(results.get(id), null); return () => {}; },
    async getJob(id) { const r = results.get(id); return r ? { kind: r.kind || null, params: r.params || null, engine_commit: r.engine_commit || 'suite-harness+engines-harness', ...r } : null; },
  };
}
