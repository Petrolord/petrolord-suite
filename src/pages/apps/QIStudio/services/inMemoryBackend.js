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
  const removedDatasets = new Set(); // remove_dataset jobs take files off the list
  const wells = [
    {
      well: { id: 'qi-w1', crs: 'EPSG:32630', name: 'KETA-1', checkshots_derived: tieRecord(0.82, 0, 30), kb_m: 30, depth_ref_elev_m: 30, depth_ref_kind: 'KB', checkshots: [{ tvdss_m: 1500, twt_ms: 1300 }, { tvdss_m: 2400, twt_ms: 1950 }], deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 3000, inc: 0, azi: 0 }], surface_x: 200, surface_y: 125, is_own: true },
      logs: [log('GR', 1500, 2800), log('DT', 1500, 2800), log('DTSM', 1500, 2800), log('RHOB', 1500, 2800), log('PHIE', 1500, 2800), log('VSH', 1500, 2800), log('SW', 1500, 2800)],
    },
    {
      well: { id: 'qi-w2', crs: 'EPSG:32630', name: 'AKOMA-2', checkshots_derived: tieRecord(0.58, 45, 26), kb_m: 28, depth_ref_elev_m: 28, depth_ref_kind: 'KB', checkshots: [], deviation: [], is_own: true },
      logs: [log('GR', 1800, 2500), log('DTCO', 1800, 2500), log('RHOZ', 1800, 2500), log('PHIT', 1800, 2500), log('VSH', 1800, 2500), log('SW', 1800, 2500)],
    },
    {
      well: { id: 'qi-w3', crs: 'EPSG:32630', name: 'BONSU-3', depth_ref_kind: 'KB', depth_ref_elev_m: null, ground_elev_m: null, checkshots: [{ tvdss_m: 1900, twt_ms: 1600 }, { tvdss_m: 2300, twt_ms: 1880 }], deviation: [], is_own: true },
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
    // the Project Data Inventory's seismic read: the full stack with its
    // survey metadata (16 x 32 bins of 25 m, 4 ms, 2.4 s, 16-bit integer so
    // the bit-depth note shows), its horizons and the mapped surfaces
    async inventorySeismic() {
      const meta = {
        il: { min: 100, max: 115, step: 1, count: 16 }, xl: { min: 200, max: 231, step: 1, count: 32 }, ns: 601, dt_us: 4000, sample_format: 3,
        affine: { origin: { x: 0, y: 0 }, il_vec: { x: 0, y: 25 }, xl_vec: { x: 25, y: 0 } }, storage_bytes: 1232896,
      };
      return {
        volumes: [{ id: 'qi-v1', name: 'Keta 3D full stack', kind: 'seismic', status: 'ready', crs: 'EPSG:32630', survey_meta: meta }],
        datasets: [],
        horizons: [{ id: 'qi-h1', name: 'Top Sand A', domain: 'twt_ms' }, { id: 'qi-h2', name: 'Base Sand B', domain: 'twt_ms' }],
        faults: [],
        surfaces: [{ id: 'qi-s1', name: 'Top Sand A (depth ft)', kind: 'structure', z_domain: 'depth' }, { id: 'qi-s2', name: 'Top Sand A amplitude', kind: 'attribute', z_domain: 'attribute' }],
      };
    },
    async countSurfaces() { return 2; },
    // the inversion inputs: a 16 x 32 survey at 4 ms on a 25 m grid, two horizons, synthetic curves
    async loadVolumeFrame() { return { dtMs: 4, nIl: 16, nXl: 32, ns: 600, crs: 'EPSG:32630', affine: { origin: { x: 0, y: 0 }, ilVec: { x: 0, y: 25 }, xlVec: { x: 25, y: 0 } } }; },
    async listHorizons() { return [{ id: 'qi-h1', name: 'Top Sand A', is_own: true }, { id: 'qi-h2', name: 'Base Sand B', is_own: true }]; },
    // a fault crossing the survey between inline 7 and 8 (QI upgrade P2.8)
    async listFaults() { return [{ id: 'qi-f1', name: 'Keta Fault 1', is_own: true, sticks: [0, 10, 20, 31].map((xl) => ({ points: [{ il: 7.5, xl, s: 100 }, { il: 7.5, xl, s: 200 }, { il: 7.5, xl, s: 300 }] })) }]; },
    // picks in samples on the 16 x 32 lattice: flat at 400 samples (1600 ms at 4 ms), deeper to the east (QI upgrade P2.11)
    async loadHorizonGrid() { return Float32Array.from({ length: 16 * 32 }, (_, c) => 400 + 0.2 * (c % 32)); },
    async downloadCurve(l) {
      const n = Math.round((l.stop_md_m - l.start_md_m) / l.step_m) + 1;
      const dt = /^DT/.test(l.mnemonic);
      if (/^PHI/.test(l.mnemonic)) return Float32Array.from({ length: n }, (_, i) => 0.2 + 0.05 * Math.sin(i / 55));
      // QI upgrade P1.3: shale volume and water saturation for NTG and Sw
      if (/^VSH/.test(l.mnemonic)) return Float32Array.from({ length: n }, (_, i) => 0.35 - 0.2 * Math.sin(i / 55));
      if (/^SW/.test(l.mnemonic)) return Float32Array.from({ length: n }, (_, i) => 0.45 - 0.25 * Math.sin(i / 55));
      if (/FACIES/.test(l.mnemonic)) return Float32Array.from({ length: n }, (_, i) => (Math.sin(i / 55) > 0 ? 1 : 2));
      return Float32Array.from({ length: n }, (_, i) => (dt ? 330 - 0.03 * i * l.step_m + 15 * Math.sin(i / 40) : 2.3 + 0.0001 * i * l.step_m + 0.04 * Math.sin(i / 55)));
    },
    async registerInversionVolume({ volume, name }) { return { id: `mem-inv-${volume.id}`, name, status: 'ingesting' }; },
    async registerPrestackVolume({ volume, name, summary }) { return { id: `mem-sim-${volume.id}-${summary.product}`, name, status: 'ingesting' }; },
    async registerMatchedVolume({ volume, name }) { return { id: `mem-match-${volume.id}`, name, status: 'ingesting' }; },
    async registerBalancedVolume({ volume, name }) { return { id: `mem-balance-${volume.id}`, name, status: 'ingesting' }; },
    async registerAvoVolume({ volume, name, summary }) { return { id: `mem-avo-${volume.id}-${summary.product}`, name, status: 'ingesting' }; },
    async registerPropertyVolume({ aiVolumeId, name, summary }) { return { id: `mem-prop-${aiVolumeId}-${summary.product}`, name, status: 'ingesting' }; },
    async removeVolume() {},
    // worker files: one uploaded prestack file, one gather store, one angle stack
    async listDatasets() {
      return [
        { id: 'qi-d1', name: 'Keta CDP gathers', kind: 'segy_upload', status: 'uploaded', bytes: 12 * 1024 ** 3, meta: {} },
        { id: 'qi-d2', name: 'Keta CDP gathers gathers', kind: 'gathers_offset', status: 'uploaded', bytes: 9 * 1024 ** 3, meta: { traces: 2400000, bins: 60, bin_width_m: 50 } },
        { id: 'qi-d3', name: 'Keta near', kind: 'segy_upload', status: 'uploaded', bytes: 2 * 1024 ** 3, meta: { partial_stack: { name: 'near', from: 0, to: 15 } } },
      ].filter((d) => !removedDatasets.has(d.id));
    },
    // a published Rock Physics gather at every well with logs: Sand A top at 2000 m, a class III gas response in situ
    async loadRockPhysicsGather(well) {
      if (!/KETA/.test(well.name)) return { ok: false, reason: 'No Rock Physics gather published for this well.' };
      return { ok: true, gather: { zone: { name: 'SAND A', top_md_m: 2000 }, cases: [{ key: 'in-situ', intercept: -0.05, gradient: -0.12 }, { key: 'substituted', intercept: -0.02, gradient: -0.03 }] } };
    },
    async convertStack() { return { jobId: 'mem-convert', volumeId: 'mem-vol' }; },
    // maps from volumes (QI upgrade P1.5): the lattice grid the worker wrote, and a saved surface
    async downloadZoneMap() { return Float32Array.from({ length: 16 * 32 }, (_, c) => 0.18 + 0.002 * (c % 32)); },
    async saveZoneMap({ name }) { return { id: `mem-surface-${name.length}`, name }; },
    async removeZoneMapFiles() {},
    // a dome (Top Sand A) and an RMS amplitude map bright above a flat contact at 2100 m
    async listSurfaces() {
      return [
        { id: 'qi-s1', name: 'Top Sand A depth', z_domain: 'elevation', z_unit: 'm', xy_unit: 'm', nx: 81, ny: 81, dx: 25, dy: 25, origin_x: 0, origin_y: 0 },
        { id: 'qi-s2', name: 'Top Sand A RMS amplitude', z_domain: 'attribute', z_unit: null, xy_unit: 'm', nx: 81, ny: 81, dx: 25, dy: 25, origin_x: 0, origin_y: 0 },
        { id: 'qi-s3', name: 'Top Sand A TWT', z_domain: 'time', z_unit: 'ms', xy_unit: 'm', nx: 81, ny: 81, dx: 25, dy: 25, origin_x: 0, origin_y: 0 },
      ];
    },
    // a time dome for depth uncertainty (QI upgrade P2.12)
    async loadTimeSurface() {
      const grid = Float32Array.from({ length: 81 * 81 }, (_, i) => { const x = (i % 81) * 25 - 1000; const y = Math.floor(i / 81) * 25 - 1000; return 1700 + 0.0004 * (x * x + y * y); });
      return { grid, spec: { nx: 81, ny: 81, dx: 25, dy: 25, x0: 0, y0: 0 } };
    },
    async loadSurface(row, { attribute = false } = {}) {
      const elev = Float32Array.from({ length: 81 * 81 }, (_, i) => { const x = (i % 81) * 25 - 1000; const y = Math.floor(i / 81) * 25 - 1000; return -2000 - 0.0004 * (x * x + y * y); });
      const grid = row.id === 'qi-s2' ? Float32Array.from(elev, (v) => (v >= -2100 ? 1 : 0.1)) : elev;
      return readDepthSurface(row, grid, attribute ? { accept: ['attribute'], xy: 'm' } : { accept: ['elevation', 'depth'], as: 'elevation', xy: 'm' });
    },
    // the gather viewer reads its panel from the job's link; here the job keeps it
    async fetchGatherPanel(r) { return GATHER_PANELS.get(r.key); },
    jobs: makeInMemoryJobs({ removedDatasets }),
  };
}

// gather viewer panels by key: a small store (8 x 8 CDPs, 12 offset bins of
// 250 m, 2 ms, 0 to 1.6 s, NMO-corrected) with a flat class III event at 900
// ms whose amplitude grows with offset and a 3 ms residual at 1400 ms
const GATHER_PANELS = new Map();
export function inMemoryGatherPanel(params, jobId) {
  const nIl = 8; const nXl = 8; const ns = 801; const dt = 2; const nb = 12;
  const centres = Array.from({ length: nb }, (_, b) => (b + 0.5) * 250);
  const ricker = (t) => { const a = (Math.PI * 30 * t / 1000) ** 2; return (1 - 2 * a) * Math.exp(-a); };
  const geom = { il: { min: 1001, max: 1008, step: 1, count: nIl }, xl: { min: 2001, max: 2008, step: 1, count: nXl }, ns, dt_us: dt * 1000, affine: { origin: { x: 0, y: 0 }, il_vec: { x: 0, y: 25 }, xl_vec: { x: 25, y: 0 } } };
  const ci = params.il ?? 4; const cj = params.xl ?? 4;
  let cdps = [{ i: ci, j: cj }];
  if (params.mode === 'inline') cdps = Array.from({ length: nXl }, (_, j) => ({ i: ci, j })).filter((c) => c.j >= (params.from ?? 0) && c.j <= (params.to ?? nXl - 1) && (c.j - (params.from ?? 0)) % (params.step || 1) === 0);
  if (params.mode === 'crossline') cdps = Array.from({ length: nIl }, (_, i) => ({ i, j: cj })).filter((c) => c.i >= (params.from ?? 0) && c.i <= (params.to ?? nIl - 1) && (c.i - (params.from ?? 0)) % (params.step || 1) === 0);
  if (params.mode === 'points') cdps = params.points.map((q) => ({ i: Math.round(q.y / 25), j: Math.round(q.x / 25), label: q.label })).filter((c) => c.i >= 0 && c.i < nIl && c.j >= 0 && c.j < nXl);
  const s0 = params.t_ms ? Math.max(0, Math.floor(params.t_ms[0] / dt)) : 0;
  const s1 = params.t_ms ? Math.min(ns - 1, Math.ceil(params.t_ms[1] / dt)) : ns - 1;
  const nw = s1 - s0 + 1; const stores = params.compare_dataset_id ? 2 : 1;
  const data = new Float32Array(stores * cdps.length * nb * nw);
  let at = 0;
  for (let st = 0; st < stores; st++) for (const c of cdps) for (let b = 0; b < nb; b++) {
    const x = centres[b]; const far = centres[nb - 1];
    const rmo = st === 1 ? 0 : 3 * (x / far) ** 2;
    for (let s = 0; s < nw; s++) {
      const t = (s0 + s) * dt;
      data[at + s] = (-0.05 - 0.12 * (x / far) ** 2) * ricker(t - 900) + 0.08 * ricker(t - (1400 + rmo)) + 0.002 * Math.sin(0.7 * s + c.i + 3 * c.j);
    }
    at += nw;
  }
  const key = `panels/mem/${jobId}/panel.f32`;
  GATHER_PANELS.set(key, data);
  return {
    dataset_id: params.dataset_id, name: 'Keta CDP gathers gathers', ...(params.compare_dataset_id ? { compare_dataset_id: params.compare_dataset_id, compare_name: 'Keta CDP gathers trimmed' } : {}),
    mode: params.mode, geometry: geom, bins: { kind: 'offset', width: 250, centres }, nmo_corrected: true,
    window: { s0, ns: nw, t0_ms: s0 * dt, dt_ms: dt }, stores,
    gathers: cdps.map((c) => ({ i: c.i, j: c.j, il: 1001 + c.i, xl: 2001 + c.j, ...(c.label ? { label: c.label } : {}), fold: new Array(nb).fill(c.i === 7 ? 0 : 4), ...(stores === 2 ? { compareFold: new Array(nb).fill(4) } : {}) })),
    skipped: [], bucket: 'seismic-work', key, bytes: data.byteLength, url: `https://storage.petrolord.com/harness/${key}`,
  };
}

function makeInMemoryJobs({ removedDatasets = new Set() } = {}) {
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
      if (kind === 'remove_dataset') {
        removedDatasets.add(params.dataset_id);
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { dataset_id: params.dataset_id, removed_objects: 1 } });
        return id;
      }
      if (kind === 'gather_panel') {
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: inMemoryGatherPanel(params, id) });
        return id;
      }
      if (kind === 'match_stacks') {
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { reference_volume_id: params.reference_volume_id, stacks: params.stacks.map((sid, k) => ({ stack_id: sid, stack_name: `stack ${sid}`, volume_id: params.volume_ids[sid], shift_ms: -2.5 - k, phase_deg: -12 - 5 * k, scale: 1.1 + 0.2 * k, corr_before: 0.81, corr_after: 0.95 })) } });
        return id;
      }
      if (kind === 'spectral_balance') {
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { target: params.target, f_lo_hz: params.f_lo_hz, f_hi_hz: params.f_hi_hz, stacks: params.stacks.map((sid, k) => ({ stack_id: sid, stack_name: `stack ${sid}`, volume_id: params.volume_ids[sid], centroid_hz_before: 24 - 3 * k, centroid_hz_after: 31.5, centroid_hz_reference: 32, band_half_power_before: [12, 36 - 4 * k], band_half_power_after: [14, 48], operator: [[0, 0], [10, 0.9], [20, 1], [30, 1.3 + 0.2 * k], [40, 1.8 + 0.3 * k], [50, 2.2], [60, 1.1], [70, 0]] })) } });
        return id;
      }
      if (kind === 'radon_demultiple' || kind === 'fx_denoise') {
        const removed = params.keep_removed ? { removed_dataset_id: 'mem-removed' } : {};
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { dataset_id: kind === 'radon_demultiple' ? 'mem-demultipled' : 'mem-denoised', source_dataset_id: params.dataset_id, ...removed, settings: kind === 'radon_demultiple' ? { cut_ms: params.cut_ms, q_min_ms: params.q_min_ms, q_max_ms: params.q_max_ms, high_res: params.high_res, avo_terms: params.avo_terms, window_ms: params.window_ms, f_max_hz: params.f_max_hz } : { filter_length: params.filter_length, window_ms: params.window_ms, f_lo_hz: params.f_lo_hz }, ...(params.area ? { area: params.area } : {}), cdps: params.area ? 120 : 1400, failed_cdps: 0, removed_share: kind === 'radon_demultiple' ? 0.31 : 0.12, bands: [{ from_ms: 0, to_ms: 1000, removed_db: 0.4, removed_share: 0.09 }, { from_ms: 1000, to_ms: 2000, removed_db: 3.1, removed_share: 0.51 }, { from_ms: 2000, to_ms: 3000, removed_db: 2.2, removed_share: 0.4 }, { from_ms: 3000, to_ms: 4000, removed_db: 1, removed_share: 0.2 }], seconds_per_cdp: 0.82 } });
        return id;
      }
      if (kind === 'trim_gathers') {
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { dataset_id: 'mem-trimmed', cdps: 1400, corrBefore: 0.82, corrAfter: 0.95, shiftMedianMs: 1.8, shiftQ90Ms: 4.4 } });
        return id;
      }
      if (kind === 'prestack_qc') {
        const times = [{ t_ms: 900, coherentShare: 0.94, noEvent: false, rmoMedian: 2.1, rmoQ90: 5.6, rmoShareOver4: 0.22, stretchMuteM: 2450 }, { t_ms: 1650, coherentShare: 0.12, noEvent: true, rmoMedian: NaN, rmoQ90: NaN, rmoShareOver4: NaN, stretchMuteM: 3900 }];
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { dataset_id: params.dataset_id, cdps: 1480, stride: 4, maxStretch: 0.3, fold: { median: 58, lowShare: 0.06, farMedianM: 3000 }, times, issues: [{ key: 'prestack-qc:mem:rmo:900', area: 'Prestack QC', severity: 'medium', title: 'Residual moveout at 900 ms', detail: 'up to 5.6 ms', remedy: 'Flatten the gathers.' }] } });
        return id;
      }
      if (kind === 'prestack_inversion') {
        const blind = params.inversion.wells.map((w, i) => ({ name: w.name, blind: { ai: { rmsPct: 4.1 + i, corr: 0.9 }, si: { rmsPct: 5.2 + i, corr: 0.86 }, rho: { rmsPct: 3.3 + i, corr: 0.62 } }, withWell: { ai: { rmsPct: 2.5 }, si: { rmsPct: 3 }, rho: { rmsPct: 2 } } }));
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { mode: params.mode, settings: { method: 'Fatti three-term simultaneous inversion', vs_vp: 0.52, wavelet_scale: 1.1, wavelet_scale_tie: { corr: 0.86, samples: 900 } }, blind, blind_protocol: { version: 'held-back-v2', excluded_from: ['the three low-frequency models', 'the wavelet scale', 'the background Vs/Vp'] }, ...(params.volume_ids ? { volume_ids: params.volume_ids, warnings: ['6 of 245760 samples of the AI (0.0024 percent) came out as no number where the seismic had data and were written as nulls.'] } : {}) } });
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
      if (kind === 'zone_maps') {
        // an illustrative result in the worker's shape (the maths is gated in the worker and engine tests)
        const products = params.products.map((pr, k) => ({ ...pr, path: `mem/qi-zone-maps/${id}/${pr.key}.f32`, live: 480, min: 0.12 + 0.01 * k, max: 0.31 + 0.01 * k, mean: 0.21 + 0.01 * k }));
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { volume_ids: params.volume_ids, lattice: { n_il: 16, n_xl: 32, dt_ms: 4 }, traces_with_zone: 480, products } });
        return id;
      }
      if (kind === 'property_prediction') {
        // an illustrative result in the worker's shape (the maths is gated in the worker and engine tests)
        const pr = params.property;
        const rows = pr.wells.map((w, i) => (pr.kind === 'facies' ? { name: w.name, n: 150, accuracy: 0.86 - 0.05 * i } : { name: w.name, n: 150, rms: 0.021 + 0.004 * i, corr: 0.82 - 0.05 * i, coverage: 0.78 + 0.03 * i }));
        const summary = pr.kind === 'facies'
          ? { classes: Object.values(pr.names).map((n, i) => ({ name: n, n: 200 - 40 * i, prior: 0.5 - 0.1 * i, mean: 6200 + 900 * i, sd: 450 })), density: pr.density || 'gaussian' }
          : { a: 0.41, b: -3.4e-5, r2: 0.74, n: 600, s: 0.018 };
        const blindProtocol = { version: 'held-back-v2', fully_blind: true, rows: pr.wells.map((w) => ({ name: w.name, source: 'held_back' })) };
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { mode: params.mode, settings: { kind: pr.kind, ...(pr.gate ? { gate: { thresholds: pr.gate } } : {}) }, summary, rows, blind_protocol: blindProtocol, ...(params.volume_ids ? { volume_ids: params.volume_ids } : {}) } });
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
        results.set(id, { id, kind, params, status: 'succeeded', progress: 1, finished_at: new Date().toISOString(), result_refs: { mode: params.mode, volume_id: params.volume_id, ...(params.volume_ids ? { volume_ids: params.volume_ids } : {}), settings: { method: params.inversion.method, qi_class: 'elastic_estimate', wavelet_scale: 1.2 }, blind, ...(params.inversion.lfm_scenarios ? { lfm_scenarios: params.inversion.lfm_scenarios.map((sc, i) => ({ name: sc.name, meanRmsPct: 9 - 1.5 * i, rows: params.inversion.wells.map((w, j) => ({ name: w.name, corr: 0.9, rmsPct: 9 - 1.5 * i + j })), ...(sc.velocity ? { trend: { a: -1.2, b: 1.25, r2: 0.83 } } : {}) })) } : {}), blind_protocol: { version: 'held-back-v2', excluded_from: ['the low-frequency model', 'the wavelet scale', ...(params.inversion.blind_wavelets ? ['the field wavelet average'] : [])] }, ...(sensitivity ? { sensitivity } : {}) } });
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
