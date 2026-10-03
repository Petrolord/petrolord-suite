/**
 * The series of SCAL Studio's charts (SCAL-U1, RL6 and RL12): one builder
 * for the screen and the PDF, so a figure in the report is the screen
 * chart's own points. Values come out in the display unit of the project
 * (Pc, height); saturations, kr and J are fractions or dimensionless.
 *
 * Pure.
 */
import {
  buildCoreyOilWater, normalizeKrTable, makeJFunction, pcFromJ, heightFromPc, LEVERETT_C,
} from '@/utils/scalCalculations';
import { coreyKr } from '@/utils/fractionalFlowCalculations';
import { scalUnits } from './units.js';

/** Colours on the white chart standard (screen hex and report RGB). */
export const SERIES_COLORS = Object.freeze({
  water: { hex: '#2563eb', rgb: [37, 99, 235] },
  oil: { hex: '#059669', rgb: [5, 150, 105] },
  gas: { hex: '#dc2626', rgb: [220, 38, 38] },
  j: { hex: '#7c3aed', rgb: [124, 58, 237] },
  pc: { hex: '#0891b2', rgb: [8, 145, 178] },
  fwl: { hex: '#d97706', rgb: [217, 119, 6] },
});
export const SAMPLE_COLORS = Object.freeze([
  { hex: '#2563eb', rgb: [37, 99, 235] }, { hex: '#059669', rgb: [5, 150, 105] }, { hex: '#7c3aed', rgb: [124, 58, 237] },
  { hex: '#d97706', rgb: [217, 119, 6] }, { hex: '#dc2626', rgb: [220, 38, 38] }, { hex: '#0891b2', rgb: [8, 145, 178] },
]);

/** The working oil-water or gas-oil curves, as drawn on the Curves tab (101 intervals). */
export function workingKrSeries({ owCurves, goCurves, phase = 'oilwater' }) {
  if (phase === 'gasoil') {
    const rows = goCurves?.rows || [];
    return {
      x: 'Sg',
      xTitle: 'Gas saturation Sg',
      lines: [
        { key: 'krg', name: 'krg', color: SERIES_COLORS.gas, points: rows.map((r) => ({ x: r.Sg, y: r.krg })) },
        { key: 'krog', name: 'krog', color: SERIES_COLORS.oil, points: rows.map((r) => ({ x: r.Sg, y: r.krog })) },
      ],
    };
  }
  const rows = owCurves?.rows || [];
  return {
    x: 'Sw',
    xTitle: 'Water saturation Sw',
    lines: [
      { key: 'krw', name: 'krw', color: SERIES_COLORS.water, points: rows.map((r) => ({ x: r.Sw, y: r.krw })) },
      { key: 'kro', name: 'kro', color: SERIES_COLORS.oil, points: rows.map((r) => ({ x: r.Sw, y: r.kro })) },
    ],
  };
}

/** A sample's lab kr points and its Corey fit line (Lab Data tab, 80 intervals). */
export function labFitSeries(sample) {
  const lab = sample?.krRows || [];
  const fit = sample?.krFit?.params ? buildCoreyOilWater(sample.krFit.params, { n: 80 }).rows : [];
  return {
    labW: lab.map((r) => ({ x: r.Sw, y: r.krw })),
    labO: lab.map((r) => ({ x: r.Sw, y: r.kro })),
    fitW: fit.map((r) => ({ x: r.Sw, y: r.krw })),
    fitO: fit.map((r) => ({ x: r.Sw, y: r.kro })),
  };
}

/** End-point normalised lab curves of every sample with a usable kr table. */
export function normalisedSeries(samples) {
  return (samples || [])
    .map((s) => ({ s, norm: (s.krRows?.length ?? 0) >= 3 ? normalizeKrTable(s.krRows) : null }))
    .filter((x) => x.norm?.ok)
    .map(({ s, norm }, i) => ({
      id: s.id,
      name: s.name,
      color: SAMPLE_COLORS[i % SAMPLE_COLORS.length],
      w: norm.rows.map((r) => ({ x: r.Swn, y: r.krwN })),
      o: norm.rows.map((r) => ({ x: r.Swn, y: r.kroN })),
    }));
}

/** The working J curve on true Sw (81 points) and the J points of the included samples. */
export function jSeries({ jSpec, samples = [], includedIds = [] }) {
  const curve = [];
  if (jSpec) {
    const { j, domain } = makeJFunction(jSpec);
    const lo = Math.max(domain.SwMin + 0.005, 0.01);
    const hi = Math.min(domain.SwMax, 0.999);
    for (let i = 0; i <= 80; i++) {
      const Sw = lo + ((hi - lo) * i) / 80;
      const J = j(Sw);
      if (Number.isFinite(J) && J > 0) curve.push({ x: Sw, y: J });
    }
  }
  const points = (samples || [])
    .filter((s) => includedIds.includes(s.id) && (s.jRows?.length ?? 0) >= 3)
    .map((s, i) => ({ id: s.id, name: s.name, color: SAMPLE_COLORS[i % SAMPLE_COLORS.length], points: s.jRows.map((r) => ({ x: r.Sw, y: r.J })) }));
  return { curve, samples: points };
}

/**
 * The reservoir Pc curve in the display unit, and the lab Pc of the included
 * samples converted to reservoir conditions through their own J (the
 * J-function overlay of the report: lab points that collapse onto the
 * working curve support it).
 */
export function pcSeries({ reservoirPc, reservoir, samples = [], includedIds = [], system = 'oilfield' }) {
  const u = scalUnits(system);
  const curve = (reservoirPc || []).map((r) => ({ x: r.Sw, y: u.show('pc', r.Pc_psi) }));
  let overlay = [];
  if (reservoir?.props) {
    // Pc = J sigma cos(theta) / (C sqrt(k / phi)) at reservoir rock and fluids, as pcFromJ scales the working curve
    const rp = reservoir.props;
    const factor = (rp.sigma_dyncm * Math.cos((rp.thetaDeg * Math.PI) / 180)) / (LEVERETT_C * Math.sqrt(rp.k_md / rp.phi));
    overlay = (samples || [])
      .filter((s) => includedIds.includes(s.id) && (s.jRows?.length ?? 0) >= 3)
      .map((s, i) => ({
        id: s.id,
        name: `${s.name} (lab J scaled)`,
        color: SAMPLE_COLORS[i % SAMPLE_COLORS.length],
        points: s.jRows.map((r) => ({ x: r.Sw, y: u.show('pc', r.J * factor) })).filter((p) => Number.isFinite(p.y)),
      }));
  }
  return { curve, overlay, yTitle: u.head('Pc', 'pc') };
}

/** The saturation-height profile in the display unit, with the FWL as height zero and its TVDSS. */
export function heightSeries({ heightProfile, height, system = 'oilfield' }) {
  const u = scalUnits(system);
  const fwlFt = Number(height?.fwl_tvdss);
  const hasFwl = height?.fwl_tvdss !== '' && height?.fwl_tvdss != null && Number.isFinite(fwlFt);
  const points = (heightProfile || []).map((r) => ({ x: r.Sw, y: u.show('length', r.h_ft) }));
  return {
    points,
    hasFwl,
    fwl: hasFwl ? u.show('length', fwlFt) : null,
    tvdss: hasFwl ? (heightProfile || []).map((r) => ({ x: r.Sw, y: u.show('length', fwlFt - r.h_ft) })) : [],
    yTitle: u.head('Height above FWL', 'length'),
    unit: u.label('length'),
  };
}

/** Height above the FWL at Sw = 0.5, by the engine at that Sw (the T1 fix), in ft. */
export function heightAtSwFt({ jSpec, reservoir, height, Sw = 0.5 }) {
  if (!jSpec || !reservoir?.props) return null;
  try {
    const one = pcFromJ(jSpec, reservoir.props, { n: 1, SwMin: Sw, SwMax: Sw });
    const pc = one.ok ? one.rows[0]?.Pc_psi : null;
    return Number.isFinite(pc) ? heightFromPc(pc, { gammaW: parseFloat(height?.gammaW), gammaHc: parseFloat(height?.gammaHc) }) : null;
  } catch {
    return null;
  }
}

/**
 * The water saturation where krw equals kro on the working Corey set, by
 * bisection on the engine's own curve (SCAL-U1-006). The card took the
 * first row of the 101-interval chart grid past the crossing, up to one
 * grid step high. Null when the curves do not cross inside the mobile range.
 */
export function crossoverSw(params) {
  if (!params) return null;
  const f = (Sw) => { const { krw, kro } = coreyKr(Sw, params); return krw - kro; };
  let lo = params.Swc;
  let hi = 1 - params.Sor;
  if (!(hi > lo) || f(lo) > 0 || f(hi) < 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
