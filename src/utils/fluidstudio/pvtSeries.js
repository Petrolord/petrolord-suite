/**
 * One series builder for the PVT plots of Fluid Systems Studio (FLUID-U1,
 * RL6 and RL12): the screen charts and the figures of the PDF report both
 * draw what this returns, in the display units, so the two cannot differ.
 *
 * Pure. Rows are the engine's table rows (oilfield units, any order).
 */
import { fluidUnits } from './units.js';

/** The property plots, in the order the screen and the report show them. */
export const PVT_PLOTS = Object.freeze([
  { id: 'bo', title: 'Oil formation volume factor Bo', short: 'Bo', key: 'Bo', kind: 'fvfOil', rgb: [5, 150, 105], hex: '#059669', digits: 3 },
  { id: 'rs', title: 'Solution GOR Rs', short: 'Rs', key: 'Rs', kind: 'gor', rgb: [37, 99, 235], hex: '#2563eb', digits: 0 },
  { id: 'muo', title: 'Oil viscosity', short: 'Oil viscosity', key: 'mu_o', kind: 'viscosity', rgb: [124, 58, 237], hex: '#7c3aed', digits: 3 },
  { id: 'z', title: 'Gas deviation factor Z', short: 'Z', key: 'Z', kind: 'dimensionless', rgb: [8, 145, 178], hex: '#0891b2', digits: 3 },
  { id: 'bg', title: 'Gas formation volume factor Bg', short: 'Bg', key: 'Bg', kind: 'fvfGas', rgb: [217, 119, 6], hex: '#d97706', digits: 3, yLog: true },
]);
export const PB_HEX = '#dc2626';
export const PB_RGB = Object.freeze([220, 38, 38]);
export const LAB_HEX = '#111827';
export const LAB_RGB = Object.freeze([17, 24, 39]);

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {{rows: object[], pb: ?number, system?: string, satKind?: string}} a
 * @returns {{xTitle: string, pb: ?number, pbLabel: string, plots: Array<{id: string, title: string,
 *   short: string, yTitle: string, yLog: boolean, hex: string, rgb: number[], digits: number,
 *   points: Array<{x: number, y: number}>}>}}
 */
export function buildPvtSeries({ rows, pb, system = 'oilfield', satKind = 'bubble' }) {
  const u = fluidUnits(system);
  const sorted = [...(rows || [])].filter((r) => finite(r?.pressure)).sort((a, b) => a.pressure - b.pressure);
  const pbShown = finite(pb) ? u.show('pressure', pb) : null;
  const word = satKind === 'dew' ? 'Dew point' : 'Pb';
  return {
    xTitle: u.head('Pressure', 'pressure'),
    pb: pbShown,
    pbLabel: pbShown == null ? '' : `${word} ${Math.round(pbShown).toLocaleString('en-US')} ${u.label('pressure')}`,
    plots: PVT_PLOTS.map((p) => ({
      id: p.id,
      title: p.title,
      short: p.short,
      yTitle: u.head(p.short, p.kind),
      yLog: !!p.yLog,
      hex: p.hex,
      rgb: p.rgb,
      digits: p.digits,
      points: sorted
        .filter((r) => finite(r[p.key]) && (!p.yLog || r[p.key] > 0))
        .map((r) => ({ x: u.show('pressure', r.pressure), y: u.show(p.kind, r[p.key]) })),
    })),
  };
}

/**
 * The laboratory values that can be set against the model curves: the
 * measured saturation pressure (a line, only when it was measured at the
 * model temperature), the separator-test Bo at the reservoir pressure and
 * the total GOR (points on the Bo and Rs curves).
 * @returns {?{psat: ?{x: number, label: string}, points: {bo: Array, rs: Array}, notes: string[]}}
 *   null when no laboratory value is entered
 */
export function buildLabOverlay({ lab, flashPressure, flashTempF, modelPb, system = 'oilfield' }) {
  const u = fluidUnits(system);
  const n = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const psat = n(lab?.psatPsia);
  const psatT = n(lab?.psatTF) ?? flashTempF;
  const gor = n(lab?.totalGor);
  const bo = n(lab?.bo);
  const api = n(lab?.stoApi);
  if (psat == null && gor == null && bo == null && api == null) return null;
  const notes = [];
  const out = { psat: null, points: { bo: [], rs: [] }, notes };
  if (psat != null) {
    if (finite(flashTempF) && Math.abs(psatT - flashTempF) < 0.5) {
      out.psat = { x: u.show('pressure', psat), label: `Lab Psat ${Math.round(u.show('pressure', psat)).toLocaleString('en-US')} ${u.label('pressure')}` };
    } else {
      notes.push(`The measured saturation pressure is at ${Number(u.show('temperature', psatT).toFixed(1))} ${u.label('temperature')}, another temperature than the table, so it is not drawn.`);
    }
  }
  const xRes = finite(flashPressure) ? flashPressure : null;
  if (bo != null && xRes != null) out.points.bo.push({ x: u.show('pressure', xRes), y: u.show('fvfOil', bo) });
  // the separator-test GOR is the solution GOR at and above the saturation pressure
  if (gor != null) {
    const x = Math.max(xRes ?? 0, finite(modelPb) ? modelPb : 0);
    if (x > 0) out.points.rs.push({ x: u.show('pressure', x), y: u.show('gor', gor) });
  }
  if (api != null) notes.push('The measured stock-tank API gravity is compared in the tuning table; it is not a pressure curve.');
  return out;
}

/**
 * The property plots a laboratory overlay can be drawn on: the ones with a
 * measured point, or Bo and Rs both when only the measured saturation
 * pressure (a line) is there. One rule for the screen and the report.
 */
export const labPlotIds = (lab) => {
  if (!lab) return [];
  const withPoints = ['bo', 'rs'].filter((k) => lab.points[k].length);
  return withPoints.length ? withPoints : (lab.psat ? ['bo', 'rs'] : []);
};

/**
 * The phase envelope series in display units, from the envelope worker's
 * result ({ bubble, dew, satAtRes } with tF and pPsia).
 */
export function buildEnvelopeSeries({ result, flashTempF, flashPressure, system = 'oilfield' }) {
  if (!result) return null;
  const u = fluidUnits(system);
  const pts = (list) => (list || []).filter((p) => finite(p?.tF) && finite(p?.pPsia)).map((p) => ({ x: u.show('temperature', p.tF), y: u.show('pressure', p.pPsia) }));
  return {
    xTitle: u.head('Temperature', 'temperature'),
    yTitle: u.head('Pressure', 'pressure'),
    bubble: pts(result.bubble),
    dew: pts(result.dew),
    flash: finite(flashTempF) && finite(flashPressure) ? [{ x: u.show('temperature', flashTempF), y: u.show('pressure', flashPressure) }] : [],
    saturation: result.satAtRes && finite(flashTempF) ? [{ x: u.show('temperature', flashTempF), y: u.show('pressure', result.satAtRes.pPsia) }] : [],
    satKind: result.satAtRes?.kind ?? null,
  };
}
