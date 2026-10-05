/**
 * Cross-checks of the Well Spacing Optimizer (WS-U1, reviewer lens RL8: a
 * cross-check of independent methods). Each compares the stated case with
 * something another app or the registry measured. None changes a number of
 * the case.
 *
 *   in place     the field OOIP of the stated rock and fluid (7,758 A h phi
 *                (1 - Swi) / Bo) against the OOIP of a Material Balance run
 *   EUR area     the drainage area a decline EUR implies at the stated
 *                recovery factor, against the spacing range studied
 *   wells        the spacing the registry wells already have: nearest
 *                neighbour distances, and the area per well they imply on
 *                the stated layout
 *
 * Pure. Oilfield units in, oilfield units out.
 */
import { BBL_PER_ACRE_FT, FT2_PER_ACRE, eurImpliedAreaAcres, layoutOf } from './drainage';
import { M_PER_FT, M_PER_FTUS } from '@/lib/units/registry';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };

/** Field OOIP of the stated case, STB. */
export function volumetricOoipStb(form, bo) {
  const A = num(form.reservoirArea);
  const h = num(form.avgNetPayThickness);
  const phi = num(form.porosity) / 100;
  const sw = num(form.initialWaterSaturation);
  if (![A, h, phi, sw, bo].every(finite) || !(bo > 0)) return NaN;
  return (BBL_PER_ACRE_FT * A * h * phi * (1 - sw)) / bo;
}

/** Nearest-neighbour distances of registry wells, in ft, with the coordinate unit converted. */
export function nearestNeighbours(wellsIntake) {
  const ws = wellsIntake?.wells || [];
  const toFt = wellsIntake?.xyUnit === 'ft' ? 1 : wellsIntake?.xyUnit === 'ftUS' ? M_PER_FTUS / M_PER_FT : 1 / M_PER_FT;
  return ws.map((w, i) => {
    let best = Infinity;
    let to = null;
    ws.forEach((o, j) => {
      if (i === j) return;
      const d = Math.hypot(o.x - w.x, o.y - w.y) * toFt;
      if (d < best) { best = d; to = o.name; }
    });
    return { name: w.name, nearest: to, distanceFt: best };
  });
}

/** The area per well a neighbour distance implies on a layout, acres (the inverse of interWellDistanceFt). */
export const areaForDistanceAcres = (dFt, layout) => {
  const f = layoutOf(layout).distanceFactor;
  return finite(dFt) && dFt > 0 ? (dFt / f) ** 2 / FT2_PER_ACRE : NaN;
};

/**
 * @param {{form: object, context: object, intakes: object}} inputs
 * @param {{boUsed: number}} results
 */
export function crossChecks(inputs, results) {
  const form = inputs.form || {};
  const bo = results?.boUsed;
  const out = {};
  const vol = volumetricOoipStb(form, bo);
  const mb = num(inputs.context?.ooipStb);
  out.inPlace = finite(mb) && finite(vol)
    ? { volumetricStb: vol, mbalStb: mb, ratio: vol / mb, text: null }
    : { volumetricStb: vol, mbalStb: mb, ratio: NaN, text: finite(vol) ? 'Not compared: no Material Balance OOIP was taken.' : 'Not compared: the volumetric inputs are incomplete.' };
  const eur = num(inputs.context?.dcaEurStb);
  const area = eurImpliedAreaAcres({
    eurStb: eur, hFt: num(form.avgNetPayThickness), phi: num(form.porosity) / 100, swi: num(form.initialWaterSaturation), rf: num(form.recoveryFactor) / 100, bo,
  });
  const lo = num(form.minSpacing);
  const hi = num(form.maxSpacing);
  out.eurArea = finite(area)
    ? { eurStb: eur, impliedAcres: area, inRange: finite(lo) && finite(hi) ? area >= lo && area <= hi : null, well: inputs.intakes?.dca?.from?.wellName || null, text: null }
    : { eurStb: eur, impliedAcres: NaN, inRange: null, well: null, text: finite(eur) ? 'Not computed: the volumetric inputs are incomplete.' : 'Not computed: no Decline Curve Analysis EUR was taken.' };
  const nn = nearestNeighbours(inputs.intakes?.wells);
  if (nn.length >= 2) {
    const ds = nn.map((n) => n.distanceFt).filter(finite);
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
    out.wells = {
      count: nn.length, rows: nn, meanFt: mean, minFt: Math.min(...ds), maxFt: Math.max(...ds),
      impliedAcres: areaForDistanceAcres(mean, form.wellLayout), layout: layoutOf(form.wellLayout).key, text: null,
    };
  } else {
    out.wells = { count: 0, rows: [], meanFt: NaN, minFt: NaN, maxFt: NaN, impliedAcres: NaN, text: 'Not computed: no wells were taken from the registry.' };
  }
  return out;
}
