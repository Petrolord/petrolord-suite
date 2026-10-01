// Pseudo-sonic for wells with no sonic log (U2-007, RP-U1-019, 2026-10-01).
// Ten of the twelve registry wells carried no DT when this was built, so
// Rock Physics could not open them. Two published transforms give an
// ESTIMATED Vp (engines pseudoSonic.js): the Gardner inverse from bulk
// density, and Faust from deep resistivity and depth. Either can be
// calibrated on a well that does have a sonic, and the misfit is reported.
//
// An estimate is not a log. Everything downstream says so: the ribbon
// badge, the status line, the basis line, the CSV and PDF header, the
// published curves' descriptions and provenance.
//
// The check against the registry's own sonic wells (2026-10-01, read only;
// tools/validation/rockphysics-pseudo-sonic-live.mjs reruns it) is quoted
// in LIVE_CHECK so the screen can state it: the estimates carry the level
// of the velocity but little of its sample-to-sample detail.

import {
  gardnerVp, faustVp, fitGardnerA, fitFaustGamma, velocityMisfit, GARDNER_A, FAUST_GAMMA,
} from '../engine/pseudoSonic';

export const DEFAULT_PSEUDO = Object.freeze({ method: 'gardner', gardnerA: GARDNER_A, faustGamma: FAUST_GAMMA, calibratedOn: null });

export const PSEUDO_METHODS = Object.freeze([
  { key: 'gardner', label: 'Gardner inverse (from density)', needs: 'RHOB' },
  { key: 'faust', label: 'Faust (from resistivity and depth)', needs: 'RT' },
]);

/**
 * The published transforms against the two registry wells that have a
 * sonic, 2026-10-01 (percent of the measured Vp; corr = sample correlation).
 * Calibrating on one well and applying to the other made both worse, so
 * the constants do not transfer between these two wells.
 */
export const LIVE_CHECK = Object.freeze({
  date: '2026-10-01',
  wells: [
    { name: 'Alaoma-2', samples: 17268, gardner: { biasPct: -11.3, rmsPct: 25.3, medianAbsPct: 19.8, corr: 0.04 }, faust: { biasPct: 59.1, rmsPct: 69.5, medianAbsPct: 58.6, corr: -0.03 } },
    { name: 'W-3', samples: 8582, gardner: { biasPct: 1.5, rmsPct: 15.8, medianAbsPct: 14.0, corr: 0.53 }, faust: { biasPct: 2.1, rmsPct: 17.2, medianAbsPct: 3.1, corr: 0.26 } },
  ],
  sentence: 'On the two registry wells with a sonic (checked 2026-10-01) the Gardner inverse missed the measured Vp by 16 and 25 percent RMS, and Faust by 17 and 70 percent, with little sample-to-sample correlation. Treat every result on an estimated sonic as indicative.',
});

const pos = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);

/** The four fields that are saved with the project (rock.pseudoSonic). */
export const savedPseudo = (c) => ({ method: c.method, gardnerA: c.gardnerA, faustGamma: c.faustGamma, calibratedOn: c.calibratedOn || null });

/** A saved or half-typed setting, resolved against what the well has. */
export function pseudoConfig(cfg = {}, has = { rhob: true, rt: false }) {
  const c = { ...DEFAULT_PSEUDO, ...(cfg || {}) };
  let method = c.method === 'faust' ? 'faust' : 'gardner';
  let fellBack = null;
  if (method === 'faust' && !has.rt) { method = 'gardner'; fellBack = 'This well has no resistivity curve, so Faust cannot run; the Gardner inverse is used.'; }
  return {
    method,
    gardnerA: pos(c.gardnerA, GARDNER_A),
    faustGamma: pos(c.faustGamma, FAUST_GAMMA),
    calibratedOn: c.calibratedOn || null,
    available: PSEUDO_METHODS.filter((m) => (m.key === 'gardner' ? has.rhob : has.rt)).map((m) => m.key),
    fellBack,
  };
}

/** The estimate in words (one sentence, no trailing stop). */
export function pseudoNote(c) {
  const cal = c.calibratedOn?.name ? `, calibrated on ${c.calibratedOn.name}` : ', published constant';
  return c.method === 'faust'
    ? `Faust (1953) from resistivity and depth, V = ${Number(c.faustGamma.toFixed(0))} (Z R)^(1/6) ft/s${cal}`
    : `Gardner (1974) inverse from density, rho = ${Number(c.gardnerA.toFixed(4))} V^0.25${cal}`;
}

/**
 * The estimated P velocity (m/s) per sample.
 * @param {{depth: ArrayLike<number>, rho: ArrayLike<number>, rt?: ?ArrayLike<number>}} inputs depth m, rho kg/m3, rt ohm m
 * @param {Object} cfg pseudoConfig output
 * @returns {{vp: number[], estimated: number}}
 */
export function pseudoVp({ depth, rho, rt = null }, cfg) {
  const n = depth.length;
  const vp = new Array(n);
  let estimated = 0;
  for (let i = 0; i < n; i++) {
    const v = cfg.method === 'faust' ? faustVp(depth[i], rt ? rt[i] : NaN, { gamma: cfg.faustGamma }) : gardnerVp(rho[i], { a: cfg.gardnerA });
    vp[i] = Number.isFinite(v) && v > 0 ? v : NaN;
    if (Number.isFinite(vp[i])) estimated += 1;
  }
  return { vp, estimated };
}

/**
 * Calibrate both transforms on a well that has a sonic, and say how well
 * each does there with the published constant and with the fitted one.
 * @param {{depth, vp, rho, rt?: ?ArrayLike<number>, vpSource?: string}} model a model with MEASURED Vp
 * @returns {{gardner: ?{a, n, published, calibrated}, faust: ?{gamma, n, published, calibrated}, errors: string[]}}
 */
export function calibrateOn(model) {
  const out = { gardner: null, faust: null, errors: [] };
  if (!model || model.vpSource === 'estimated') { out.errors.push('The calibration well has no sonic log.'); return out; }
  try {
    const { a, n } = fitGardnerA(model.rho, model.vp);
    out.gardner = {
      a,
      n,
      published: velocityMisfit(Array.from(model.rho, (r) => gardnerVp(r)), model.vp),
      calibrated: velocityMisfit(Array.from(model.rho, (r) => gardnerVp(r, { a })), model.vp),
    };
  } catch (e) { out.errors.push(`Gardner: ${e.message}`); }
  if (model.rt) {
    try {
      const { gamma, n } = fitFaustGamma(model.depth, model.rt, model.vp);
      out.faust = {
        gamma,
        n,
        published: velocityMisfit(Array.from(model.depth, (z, i) => faustVp(z, model.rt[i])), model.vp),
        calibrated: velocityMisfit(Array.from(model.depth, (z, i) => faustVp(z, model.rt[i], { gamma })), model.vp),
      };
    } catch (e) { out.errors.push(`Faust: ${e.message}`); }
  } else out.errors.push('Faust: the calibration well has no resistivity curve.');
  return out;
}

/** "bias -11.3%, RMS 25.3%, correlation 0.04 over 17268 samples" */
export const misfitText = (m) => (m && m.n ? `bias ${m.biasPct.toFixed(1)}%, RMS ${m.rmsPct.toFixed(1)}%, correlation ${Number.isFinite(m.corr) ? m.corr.toFixed(2) : 'n/a'} over ${m.n} samples` : 'no samples with both');

/** The setting to save after a calibration (the fitted constants and where they came from). */
export function calibratedConfig(cfg, cal, well) {
  const m = cfg.method === 'faust' && cal.faust ? cal.faust.calibrated : cal.gardner?.calibrated;
  return {
    method: cfg.method,
    gardnerA: cal.gardner ? cal.gardner.a : cfg.gardnerA,
    faustGamma: cal.faust ? cal.faust.gamma : cfg.faustGamma,
    calibratedOn: {
      wellId: well?.id || null,
      name: well?.name || 'another well',
      rmsPct: m ? Number(m.rmsPct.toFixed(1)) : null,
      biasPct: m ? Number(m.biasPct.toFixed(1)) : null,
      corr: m && Number.isFinite(m.corr) ? Number(m.corr.toFixed(2)) : null,
      n: m ? m.n : 0,
    },
  };
}
