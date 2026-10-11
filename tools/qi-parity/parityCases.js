/**
 * The QI Studio calls the E2 parity gate pins (QI course gate E2,
 * 2026-10-11). Both the capture (captureEkeneParity.js, run once on the tree
 * before the move) and the parity test (qiEngineParity.test.js, on every run
 * after it) call the SERVICE paths below, so the same code path the app, the
 * worker and the course take is what is compared. Outputs are reduced to plain
 * JSON (typed arrays to arrays, NaN to null) so they compare exactly.
 */
import { compareAtWells, wellPoints } from '../../src/pages/apps/QIStudio/services/avoWells';
import {
  waveletScale, lfmWells, makeTraceInverter, blindWellTable, colouredFromWells, halfWindowFor, lowPassFinite, INVERSION_DEFAULTS,
} from '../../src/pages/apps/QIStudio/services/inversionRun';
import { extractAngleWavelets, angleReflectivity } from '../../src/pages/apps/QIStudio/services/angleWavelets';
import { calibrateProperty, predictTrace, upscaleWells, modeFilter } from '../../src/pages/apps/QIStudio/services/propertyRun';
import { analyseProspect, climbToCrest, nearestNode, anomalyMaskOn, keepTouching } from '../../src/pages/apps/QIStudio/services/prospects';
import { extractWellWavelet } from '../../src/pages/apps/Seismolord/lib/wellWavelet';
import { readDepthSurface } from '../../src/lib/readDepthSurface';

const ARRAY_KEYS = new Set(['ln_ai', 'ln_si', 'ln_rho', 'phit', 'vpvs', 'facies']);

/** Ten significant figures for every input number (the inputs only need to be fixed, not exact). */
export function roundInputs(x) {
  if (typeof x === 'number') return Number.isFinite(x) ? Number(x.toPrecision(10)) : x;
  if (Array.isArray(x)) return x.map(roundInputs);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, roundInputs(v)]));
  return x;
}

/** JSON inputs back to what the services take: log and trace arrays carry NaN where JSON carries null. */
export function hydrate(inputs) {
  const nan = (a) => a.map((v) => (v == null ? NaN : v));
  return {
    ...inputs,
    wells: inputs.wells.map((w) => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, ARRAY_KEYS.has(k) ? nan(v) : v]))),
    fullTraces: inputs.fullTraces.map(nan),
    tracesByWell: inputs.tracesByWell.map((t) => t.map(nan)),
    aiTraces: inputs.aiTraces.map(nan),
    vpvsTraces: inputs.vpvsTraces.map(nan),
  };
}

/** Plain JSON: typed arrays to arrays, NaN and infinities to null, functions dropped. */
export const plain = (x) => JSON.parse(JSON.stringify(x, (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v)));

export function runParityCases(inp) {
  const { dtMs, ns, wells } = inp;
  const out = {};

  // AVO at the wells
  out.wellPoints = wellPoints(wells.map((w, k) => ({ ok: k !== 4, name: w.name, il: w.il, xl: w.xl, topTwt: w.topTwt })));
  out.compareAtWells = compareAtWells(inp.avoRows);

  // the wavelet scale, the LFM wells and the blind-well tables (absolute and coloured)
  const byIlXl = new Map(wells.map((w) => [`${w.il}/${w.xl}`, w]));
  const posOf = (il, xl) => { const w = byIlXl.get(`${il}/${xl}`); return { x: w.x, y: w.y }; };
  const horizonsAt = (il, xl) => [byIlXl.get(`${il}/${xl}`).topTwt];
  const pairs = wells.map((w, k) => ({ trace: inp.fullTraces[k], lnAi: w.ln_ai }));
  out.waveletScale = waveletScale(pairs, inp.wavelet);
  out.halfWindow = [8, 50, 60].map((hz) => halfWindowFor(hz, dtMs));
  out.lowPass = lowPassFinite(wells[1].ln_ai, halfWindowFor(50, dtMs));
  const lfm = lfmWells(wells, { dtMs, lfmHz: INVERSION_DEFAULTS.lfmHz, posOf, horizonsAt });
  const scaled = inp.wavelet.map((v) => v * out.waveletScale.scale);
  const inv = { method: 'model_based', iters: 40 };
  const invert = makeTraceInverter({ inv, wavelet: scaled, wells: lfm, posOf, horizonsAt, ns, dtMs });
  out.blindAbsolute = blindWellTable({ invert, wells, traces: inp.fullTraces, dtMs, truthHz: INVERSION_DEFAULTS.truthHz, absolute: true });
  const col = colouredFromWells({ wellTraces: inp.fullTraces, wellLogs: wells.map((w) => w.ln_ai), dtMs, ns, band: INVERSION_DEFAULTS.band });
  const invertC = makeTraceInverter({ inv: { method: 'coloured' }, wavelet: scaled, wells: lfm, posOf, horizonsAt, ns, dtMs, coloured: col.operator });
  out.blindColoured = blindWellTable({ invert: invertC, wells, traces: inp.fullTraces, dtMs, truthHz: INVERSION_DEFAULTS.truthHz, absolute: false, lowCutHz: INVERSION_DEFAULTS.band[0] });
  out.blindColouredDefaultCut = blindWellTable({ invert: invertC, wells: wells.slice(0, 3), traces: inp.fullTraces, dtMs, truthHz: 40, absolute: false });

  // angle-dependent wavelets and the well wavelet under them
  out.angleReflectivity = angleReflectivity(wells[0], 20, inp.vsVp);
  out.wellWavelet = extractWellWavelet(out.angleReflectivity, inp.tracesByWell[0][1], { halfLength: 15 });
  out.angleWavelets = extractAngleWavelets({ wells, tracesByWell: inp.tracesByWell, thetaDeg: inp.thetaDeg, vsVp: inp.vsVp });
  out.angleWaveletsOneWell = extractAngleWavelets({ wells: wells.slice(0, 1), tracesByWell: inp.tracesByWell.slice(0, 1), thetaDeg: [20], vsVp: inp.vsVp, halfLength: 10 });

  // property calibration: porosity (the widened band of #987) and facies (1D, 2D, KDE)
  const window = [inp.wells[0].topTwt - 60, inp.wells[0].topTwt + 120];
  const propWells = wells.map((w) => ({ name: w.name, il: w.il, xl: w.xl, ln_ai: w.ln_ai, target: w.phit, vpvs: w.vpvs }));
  const prPor = { kind: 'porosity', wells: propWells, window_ms: window };
  const por = calibrateProperty({ pr: prPor, aiTraces: inp.aiTraces, dtMs });
  out.porosity = { summary: por.summary, rows: por.rows, model: { a: por.model.a, b: por.model.b, s: por.model.s, n: por.model.n, sExtra: por.model.sExtra, xMean: por.model.xMean, sxx: por.model.sxx } };
  out.porosityTrace = predictTrace(por.model, prPor, inp.aiTraces[2]);
  out.upscaled = upscaleWells(prPor, dtMs)[0];
  const facWells = wells.map((w) => ({ name: w.name, il: w.il, xl: w.xl, ln_ai: w.ln_ai, target: w.facies, vpvs: w.vpvs }));
  const names = { 1: 'shale', 2: 'brine sand', 3: 'oil sand' };
  out.modeFilter = modeFilter(wells[0].facies, 3);
  for (const [key, extra] of [['facies1d', {}], ['facies2d', { attributes: 'ai_vpvs' }], ['faciesKde', { density: 'kde', priors: 'equal' }]]) {
    const pr = { kind: 'facies', wells: facWells, names, window_ms: window, ...extra };
    const r = calibrateProperty({ pr, aiTraces: inp.aiTraces, vpvsTraces: extra.attributes ? inp.vpvsTraces : null, dtMs });
    out[key] = { summary: r.summary, rows: r.rows, trace: predictTrace(r.model, pr, inp.aiTraces[1], extra.attributes ? inp.vpvsTraces[1] : null) };
  }

  // the prospect on the Ekene top-sand structure
  const s = inp.surface;
  const row = (over) => ({ name: 'Ekene top sand', nx: s.nx, ny: s.ny, dx: s.dx, dy: s.dx, origin_x: s.origin_x, origin_y: s.origin_y, z_domain: 'elevation', z_unit: 'm', xy_unit: 'm', ...over });
  const depth = readDepthSurface(row({}), Float32Array.from(s.elev), { accept: ['elevation', 'depth'], as: 'elevation', xy: 'm' });
  const attr = readDepthSurface(row({ name: 'Ekene RMS amplitude', z_domain: 'attribute', z_unit: null }), Float32Array.from(s.bright), { accept: ['attribute'], xy: 'm' });
  const seed = nearestNode(depth, s.crestX, s.crestY);
  out.nearestNode = seed;
  out.climbToCrest = climbToCrest(Float64Array.from(depth.grid), depth.spec, seed);
  const mask = anomalyMaskOn(depth, attr, { threshold: 0.5, sense: 'high' });
  out.maskCount = mask.reduce((a, v) => a + v, 0);
  const inClosure = new Uint8Array(mask.length).fill(0);
  inClosure[out.climbToCrest] = 1;
  out.keepTouchingCount = keepTouching(mask, depth.spec, inClosure).reduce((a, v) => a + v, 0);
  const prospect = {
    crestX: s.crestX, crestY: s.crestY, anomaly: { threshold: 0.5, sense: 'high' },
    evidence: [{ name: 'RMS amplitude', source: 'full_stack' }, { name: 'AVO class II', source: 'avo' }],
    competing: [{ name: 'Tuning', status: 'ruled-out' }],
  };
  out.prospect = analyseProspect({ depth, attr, prospect, feasibility: 'feasible' });
  out.prospectLow = analyseProspect({ depth, attr, prospect: { ...prospect, anomaly: { threshold: 0.3, sense: 'low' } }, feasibility: 'feasible' });
  out.prospectNoPick = analyseProspect({ depth, attr: null, prospect: {}, feasibility: 'not-feasible' });
  return plain(out);
}
