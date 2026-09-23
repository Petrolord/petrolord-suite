// Tops to Horizons pipeline (plan: docs/scope/Seismolord-TOPS-TO-HORIZONS-PLAN.md).
//
// The three jobs the Tops to Horizons dialog runs, as plain functions over
// an injected trace accessor, so the framework worker (workers/
// framework.worker.js) runs them on bricks and jest runs them on the
// engines' exact-truth synthetic field:
//
//   runFieldMatch     every well tied (when it has a sonic), one polarity
//                     and phase for the field, every top matched to its
//                     seismic event with explained scores
//   runFrameworkTrack the accepted tops tracked in reliability order,
//                     banded so they cannot cross, fault barriers at each
//                     horizon's own level, blocks no well reaches filled
//                     by a fault jump, thin beds as conformable horizons,
//                     misties and leave-one-well-out
//   runFaultDetect    automatic fault picking over an area of interest
//                     (the likelihood volume lives in memory, so the area
//                     is capped)
//
// No I/O here: nothing is saved (the dialog saves on Accept).

import { makeTvdssToTwt } from '../engine/wellSection';
import { autoTieWell, fieldTieConvention, tiedTimeConv } from '../engine/autoTie';
import {
  wellTopsForMatching, gatherTopTraces, matchTopsToEvents,
} from '../engine/topsToEvents';
import {
  trackingOrder, trackTop, approxLevelGrid, faultBarriersForTop, tuningMask, conformableHorizon,
  mistieTable, mistieStats, leaveOneWellOut,
} from '../engine/framework';
import { jumpAcrossFaults } from '../engine/faultJump';
import { detectFaults } from '../engine/faultDetect';
import { NULL_VALUE } from '../engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);
const isNull = (v) => !Number.isFinite(v) || Math.abs(v) > 1.0e29;

/** Largest area of interest for automatic fault picking, in samples: the
 *  likelihood, its thinned copy and the patch labels take about 12 bytes
 *  a sample, so 24 million is about 290 MB, inside an 8 GB laptop's tab. */
export const AOI_MAX_SAMPLES = 24_000_000;

/** Leave-one-well-out re-tracks each horizon once per well: on by default
 *  only below this many traces. */
export const LOWO_MAX_TRACES = 250_000;

/** The field convention's phase snapped to what expectedEventAtTop knows. */
const phaseForEvents = (deg) => {
  const snapped = Math.round(deg / 90) * 90;
  return ((snapped % 360) + 360) % 360;
};

/**
 * Tie every well and match every top to its event.
 *
 * @param {Object} p
 * @param {(il, xl) => Promise<Float32Array>} p.getTrace
 * @param {{nIl, nXl, ns}} p.geom @param {number} p.dtUs
 * @param {Object} p.affine resolved survey affine
 * @param {Array<Object>} p.wells {id, name, surfaceX, surfaceY, kbM, tdMdM,
 *   deviation, tops: [{name, md}], checkshots (effective rows),
 *   checkshotsDerived, logs?: {md, dtUsPerM, rho}}
 * @param {?Object} [p.velocity] normalized volume velocity model
 * @param {?Array} [p.boundaries] layer-cake boundary grids
 * @param {?string[]} [p.order] stratigraphic order of top names
 * @param {boolean} [p.autoTie]
 * @param {?{polarity, phaseDeg}} [p.convention] force a convention
 * @param {(stage: string, done: number, total: number) => void} [p.onProgress]
 * @returns {Promise<{ties, convention, match, wells, skipped}>}
 */
export async function runFieldMatch({
  getTrace, geom, dtUs, affine, wells, velocity = null, boundaries = null, order = null,
  autoTie = true, convention: forced = null, onProgress = () => {},
}) {
  const dtMs = dtUs / 1000;
  const maxTwtMs = geom.ns * dtMs;
  const skipped = [];
  const base = [];
  for (const w of wells) {
    const tc = makeTvdssToTwt({
      checkshots: w.checkshots, velocity, boundaries, dtUs, maxTwtMs,
    });
    if (!tc) { skipped.push({ name: w.name, reason: 'no time-depth relation (no checkshots, no velocity model)' }); continue; }
    base.push({ w, tc, source: w.checkshotsDerived ? 'tie' : tc.source });
  }

  // 1. ties
  const ties = [];
  if (autoTie) {
    let k = 0;
    for (const b of base) {
      k += 1;
      onProgress('tie', k, base.length);
      if (!b.w.logs) { ties.push(null); continue; }
      try {
        ties.push(await autoTieWell({
          well: b.w, timeConv: b.tc, affine, geom, dtUs, getTrace,
        }));
      } catch {
        ties.push(null);
      }
    }
  }
  const convention = forced || (ties.some(Boolean) ? fieldTieConvention(ties)
    : {
      polarity: 'normal', phaseDeg: 0, voters: 0, agreement: 0, outliers: [],
    });

  // 2. tops placed through the best time relation each well has
  const prepared = [];
  let k = 0;
  for (let i = 0; i < base.length; i++) {
    k += 1;
    onProgress('tops', k, base.length);
    const { w, tc, source } = base[i];
    const tie = ties[i];
    const useTie = tie && tie.quality !== 'poor';
    const timeConv = useTie ? tiedTimeConv(tc, tie) : tc;
    const tops = wellTopsForMatching(w, {
      affine,
      geom,
      dtUs,
      timeConv,
      source: useTie ? 'tie' : source,
      polarity: convention.polarity,
      phaseDeg: phaseForEvents(convention.phaseDeg || 0),
    });
    if (!tops.length) { skipped.push({ name: w.name, reason: 'no top falls inside the survey and its time window' }); continue; }
    const traces = await gatherTopTraces(getTrace, geom, tops);
    prepared.push({
      name: w.name, id: w.id, tops, traces, tie: tie || null,
    });
  }
  const match = matchTopsToEvents({ wells: prepared, dtMs, order });
  return {
    ties: ties.filter(Boolean).map(tieSummary),
    convention,
    match,
    wells: prepared.map((p) => ({
      name: p.name,
      id: p.id,
      tops: p.tops,
      // thumbnails for the review board: +-24 samples around every top
      thumbs: Object.fromEntries(p.tops.map((t) => [t.name, thumb(p.traces.get(t.name)?.trace, t.predSample)])),
    })),
    skipped,
  };
}

function tieSummary(t) {
  return {
    name: t.name,
    shiftMs: t.shiftMs,
    polarity: t.polarity,
    phaseDeg: t.phaseDeg,
    corr: t.corr,
    quality: t.quality,
  };
}

function thumb(trace, center, half = 24) {
  if (!trace) return null;
  const c = Math.round(center);
  const s0 = Math.max(0, c - half);
  const s1 = Math.min(trace.length, c + half + 1);
  return { s0, values: Array.from(trace.subarray(s0, s1)) };
}

/**
 * Apply the interpreter's choices to a match: excluded tops dropped,
 * per-well event overrides (a sample from the alternatives), a forced
 * event kind per top.
 *
 * @param {Object} match
 * @param {{exclude?: string[], events?: Object<string, Object<string, number>>}} [choices]
 *   events[topName][wellName] = sample of the chosen alternative
 */
export function applyChoices(match, choices = {}) {
  const exclude = new Set(choices.exclude || []);
  const tops = match.tops.filter((t) => !exclude.has(t.name)).map((t) => {
    const over = choices.events?.[t.name];
    if (!over) return t;
    const atWells = { ...t.atWells };
    for (const [wName, sample] of Object.entries(over)) {
      const at = atWells[wName];
      if (!at) continue;
      const alt = (at.alternatives || []).find((a) => Math.abs(a.sample - sample) < 1e-6)
        || { kind: t.kind, sample, amp: 0, score: 1 };
      atWells[wName] = { ...at, choice: { ...alt, score: Math.max(alt.score || 0, 0.99), override: true } };
    }
    return { ...t, atWells };
  });
  return { ...match, tops };
}

/**
 * Track the accepted framework.
 *
 * @param {Object} p
 * @param {(il, xl) => Promise<Float32Array>} p.getTrace
 * @param {{nIl, nXl, ns}} p.geom @param {number} p.dtUs
 * @param {Object} p.match matchTopsToEvents result (after applyChoices)
 * @param {Array} p.wells the prepared wells (runFieldMatch().wells)
 * @param {Array<{name, sticks}>} [p.faults] lattice sticks
 * @param {boolean} [p.jump] fill fault blocks no well reaches
 * @param {?boolean} [p.lowo] leave-one-well-out (default: small surveys)
 * @param {(stage, done, total) => void} [p.onProgress]
 * @param {() => boolean} [p.shouldCancel]
 * @returns {Promise<{horizons: Array, misties: Array, mistieStats: Object, order: string[]}>}
 */
export async function runFrameworkTrack({
  getTrace, geom, dtUs, match, wells, faults = [], jump = true, lowo = null,
  onProgress = () => {}, shouldCancel = () => false,
}) {
  const dtMs = dtUs / 1000;
  const order = match.order;
  const plan = trackingOrder(match, wells);
  const tracked = new Map();
  const meta = new Map();
  const doLowo = lowo ?? geom.nIl * geom.nXl <= LOWO_MAX_TRACES;
  const faultList = (faults || []).filter((f) => f.sticks && f.sticks.length);

  let i = 0;
  for (const t of plan) {
    i += 1;
    if (shouldCancel()) throw new Error('Tracking cancelled');
    onProgress(`track:${t.name}`, i, plan.length);
    const barriers = faultList.length ? faultBarriersForTop(faultList, approxLevelGrid(t.seeds, geom), geom) : null;
    const r = await trackTop({
      getTrace, geom, seeds: t.seeds, kind: t.kind, name: t.name, order, tracked, barriers,
      opts: { shouldCancel },
    });
    let picks = r.picks;
    let jumped = null;
    let jumps = [];
    if (barriers && jump) {
      const j = await jumpAcrossFaults({
        getTrace, geom, picks, barriers, faults: faultList, kind: t.kind,
      });
      picks = j.picks;
      jumped = j.jumped;
      jumps = j.jumps;
    }
    tracked.set(t.name, picks);
    meta.set(t.name, {
      kind: t.kind, seeds: t.seeds, jumped, jumps, barriers, meanScore: t.meanScore,
    });
  }

  // confidence per horizon: 1 where well-seeded tracking reached, the
  // jump's correlation where carried across a fault, halved where tuned
  const tuneS = match.tuningMs / dtMs;
  const horizons = [];
  for (const [name, picks] of tracked) {
    const m = meta.get(name);
    const tuned = tuningMask(name, order, tracked, geom, tuneS);
    const conf = new Float32Array(picks.length).fill(NULL_F32);
    const jumpNcc = new Map((m.jumps || []).filter((j) => !j.skipped).map((j) => [j.block, j.ncc]));
    const jumpConf = jumpNcc.size ? Math.max(...jumpNcc.values()) : 0.5;
    let nTuned = 0;
    let nJumped = 0;
    for (let c = 0; c < picks.length; c++) {
      if (isNull(picks[c])) continue;
      let v = m.jumped && m.jumped[c] ? jumpConf : 1;
      if (m.jumped && m.jumped[c]) nJumped += 1;
      if (tuned[c]) { v *= 0.5; nTuned += 1; }
      conf[c] = v;
    }
    horizons.push({
      name,
      role: 'mapped',
      kind: m.kind,
      picks,
      confidence: conf,
      seeds: m.seeds.map((s) => ({
        well: s.well, il: s.ilIdx, xl: s.xlIdx, sample: s.sample, score: s.score,
      })),
      jumps: (m.jumps || []).map((j) => ({ ...j, choice: undefined })),
      stats: {
        tuned: nTuned, jumped: nJumped, meanSeedScore: m.meanScore,
      },
    });
  }

  // thin beds riding on their representative
  for (const t of match.tops.filter((x) => x.role === 'conformable')) {
    const rep = tracked.get(t.representative);
    if (!rep) continue;
    const offs = Object.entries(t.offsetsMs || {}).map(([wName, ms]) => {
      const top = wells.find((w) => w.name === wName)?.tops.find((q) => q.name === t.representative);
      return top ? { il: top.cell.il, xl: top.cell.xl, offsetMs: ms } : null;
    }).filter(Boolean);
    if (!offs.length) continue;
    const { picks, isochronMs } = conformableHorizon(rep, offs, geom, dtMs);
    const conf = new Float32Array(picks.length).fill(NULL_F32);
    for (let c = 0; c < picks.length; c++) if (!isNull(picks[c])) conf[c] = 0.5;
    let iMin = Infinity;
    let iMax = -Infinity;
    for (const v of isochronMs) { if (v < iMin) iMin = v; if (v > iMax) iMax = v; }
    horizons.push({
      name: t.name,
      role: 'conformable',
      representative: t.representative,
      kind: null,
      picks,
      confidence: conf,
      seeds: [],
      jumps: [],
      stats: { isochronMinMs: iMin, isochronMaxMs: iMax, wells: offs.length },
    });
  }

  // misties at every well, for every horizon made
  const all = new Map(horizons.map((h) => [h.name, h.picks]));
  const misties = mistieTable(all, wells, geom, dtMs);

  // leave-one-well-out on the mapped horizons with at least two wells
  if (doLowo) {
    let n = 0;
    for (const h of horizons.filter((x) => x.role === 'mapped')) {
      n += 1;
      onProgress(`lowo:${h.name}`, n, horizons.length);
      const m = meta.get(h.name);
      if (m.seeds.length < 2) continue;
      const others = new Map([...tracked].filter(([k]) => k !== h.name));
      h.lowo = await leaveOneWellOut({
        seeds: m.seeds,
        geom,
        dtMs,
        track: async (s) => (await trackTop({
          getTrace, geom, seeds: s, kind: m.kind, name: h.name, order, tracked: others, barriers: m.barriers,
          opts: { shouldCancel },
        })).picks,
      });
    }
  }

  return {
    horizons,
    misties,
    mistieStats: mistieStats(misties),
    order,
  };
}

/**
 * Automatic fault picking over an area of interest.
 *
 * @param {Object} p
 * @param {(il, xl) => Promise<Float32Array>} p.getTrace full-survey accessor
 * @param {{nIl, nXl, ns}} p.geom full survey
 * @param {number} p.dtMs
 * @param {{il0, il1, xl0, xl1, s0, s1}} p.aoi inclusive lattice bounds
 * @param {Object} [p.params] faultDetect parameters
 * @returns {Promise<{faults: Array, aoi: Object, samples: number}>}
 *   sticks in full-survey lattice coordinates
 */
export async function runFaultDetect({
  getTrace, geom, dtMs, aoi, params = {}, onProgress = () => {}, shouldCancel = () => false,
}) {
  const a = clampAoi(aoi, geom);
  const sub = { nIl: a.il1 - a.il0 + 1, nXl: a.xl1 - a.xl0 + 1, ns: a.s1 - a.s0 + 1 };
  const samples = sub.nIl * sub.nXl * sub.ns;
  if (samples > AOI_MAX_SAMPLES) {
    throw new Error(`The area of interest has ${(samples / 1e6).toFixed(1)} million samples; `
      + `automatic fault picking takes up to ${(AOI_MAX_SAMPLES / 1e6).toFixed(1)} million at a time. `
      + 'Narrow the inline, crossline or time range.');
  }
  const subTrace = async (i, x) => (await getTrace(i + a.il0, x + a.xl0)).subarray(a.s0, a.s1 + 1);
  const det = await detectFaults({
    getTrace: subTrace,
    geom: sub,
    dtMs,
    params,
    onProgress: (done, total, phase) => onProgress(phase || 'faults', done, total),
    shouldCancel,
  });
  const faults = det.faults.map((f) => ({
    name: f.name,
    confidence: f.confidence,
    stats: f.stats,
    sticks: f.sticks.map((st) => ({
      points: st.points.map((p) => ({ il: p.il + a.il0, xl: p.xl + a.xl0, s: p.s + a.s0 })),
    })),
  }));
  return { faults, aoi: a, samples };
}

/** An area of interest clamped to the survey (inclusive bounds). */
export function clampAoi(aoi, geom) {
  const c = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
  const a = {
    il0: c(aoi.il0, 0, geom.nIl - 1),
    il1: c(aoi.il1, 0, geom.nIl - 1),
    xl0: c(aoi.xl0, 0, geom.nXl - 1),
    xl1: c(aoi.xl1, 0, geom.nXl - 1),
    s0: c(aoi.s0, 0, geom.ns - 1),
    s1: c(aoi.s1, 0, geom.ns - 1),
  };
  if (a.il1 < a.il0) [a.il0, a.il1] = [a.il1, a.il0];
  if (a.xl1 < a.xl0) [a.xl0, a.xl1] = [a.xl1, a.xl0];
  if (a.s1 < a.s0) [a.s0, a.s1] = [a.s1, a.s0];
  return a;
}

/**
 * A default area of interest: the wells' bounding box grown by a margin
 * and the time window of their tops (plus a margin), shrunk evenly until
 * it fits AOI_MAX_SAMPLES.
 */
export function defaultAoi(wellsTops, geom, { marginCells = 30, marginSamples = 60 } = {}) {
  let il0 = Infinity; let il1 = -Infinity; let xl0 = Infinity; let xl1 = -Infinity;
  let s0 = Infinity; let s1 = -Infinity;
  for (const w of wellsTops) {
    for (const t of w.tops) {
      il0 = Math.min(il0, t.cell.il); il1 = Math.max(il1, t.cell.il);
      xl0 = Math.min(xl0, t.cell.xl); xl1 = Math.max(xl1, t.cell.xl);
      s0 = Math.min(s0, t.predSample); s1 = Math.max(s1, t.predSample);
    }
  }
  if (!Number.isFinite(il0)) {
    il0 = 0; il1 = geom.nIl - 1; xl0 = 0; xl1 = geom.nXl - 1; s0 = 0; s1 = geom.ns - 1;
  }
  let a = clampAoi({
    il0: il0 - marginCells, il1: il1 + marginCells, xl0: xl0 - marginCells, xl1: xl1 + marginCells,
    s0: s0 - marginSamples, s1: s1 + marginSamples,
  }, geom);
  const size = (b) => (b.il1 - b.il0 + 1) * (b.xl1 - b.xl0 + 1) * (b.s1 - b.s0 + 1);
  while (size(a) > AOI_MAX_SAMPLES) {
    const f = Math.cbrt(AOI_MAX_SAMPLES / size(a)) * 0.98;
    const mid = (lo, hi) => (lo + hi) / 2;
    const half = (lo, hi) => ((hi - lo) / 2) * f;
    a = clampAoi({
      il0: mid(a.il0, a.il1) - half(a.il0, a.il1),
      il1: mid(a.il0, a.il1) + half(a.il0, a.il1),
      xl0: mid(a.xl0, a.xl1) - half(a.xl0, a.xl1),
      xl1: mid(a.xl0, a.xl1) + half(a.xl0, a.xl1),
      s0: mid(a.s0, a.s1) - half(a.s0, a.s1),
      s1: mid(a.s0, a.s1) + half(a.s0, a.s1),
    }, geom);
  }
  return a;
}

/**
 * An area of interest centred on a lattice position (the line on screen):
 * the full time range when the survey allows, the lateral box as large as
 * AOI_MAX_SAMPLES leaves (square in cells), clamped to the survey. When the
 * time range alone would leave less than 40 by 40 cells, the time window
 * shrinks around `center.s` (default mid-survey) instead.
 */
export function aoiAround(center, geom, { minSide = 40 } = {}) {
  const ci = Math.round(center?.il ?? (geom.nIl - 1) / 2);
  const cx = Math.round(center?.xl ?? (geom.nXl - 1) / 2);
  let ns = geom.ns;
  let side = Math.floor(Math.sqrt(AOI_MAX_SAMPLES / ns));
  if (side < minSide) {
    side = minSide;
    ns = Math.max(1, Math.floor(AOI_MAX_SAMPLES / (side * side)));
  }
  const span = (c, n, len) => {
    const w = Math.min(len, n);
    const lo = Math.max(0, Math.min(n - w, c - Math.floor(w / 2)));
    return [lo, lo + w - 1];
  };
  const [il0, il1] = span(ci, geom.nIl, side);
  const [xl0, xl1] = span(cx, geom.nXl, side);
  const cs = Math.round(center?.s ?? (geom.ns - 1) / 2);
  const [s0, s1] = span(cs, geom.ns, ns);
  return {
    il0, il1, xl0, xl1, s0, s1,
  };
}
