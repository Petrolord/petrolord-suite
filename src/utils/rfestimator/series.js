/**
 * The series of the Recovery Factor Estimator charts, in the display unit:
 * one function for the screen chart and the report figure, so they draw the
 * same bars (RL12; the report test holds the point counts against these).
 *
 * Pure.
 */
import { toDisplay, unitLabel } from './units';

/** Bars of the reserves chart: analog range low edge, estimate, high edge. */
export function reservesBars(result, phase, system = 'oilfield') {
  const kind = phase === 'gas' ? 'gasVolumeB' : 'oilVolumeMM';
  const scale = phase === 'gas' ? 1e9 : 1e6;
  const show = (v) => (Number.isFinite(v) ? toDisplay(kind, v / scale, system) : null);
  const rows = [];
  const add = (key, name, v) => { const s = show(v); if (s != null) rows.push({ key, name, value: s }); };
  add('low', 'Range low edge', result?.reservesLow);
  add('est', 'Estimate', result?.reserves);
  add('high', 'Range high edge', result?.reservesHigh);
  const note = Number.isFinite(result?.reserves) ? '' : 'No estimate bar: the method gave no recovery factor.';
  return { rows, unit: unitLabel(kind, system), note };
}

/** The analog ranges of every drive of the phase with this case's estimate marked. */
export function analogRangeRows(drives, result) {
  return (drives || []).map((d) => ({
    code: d.code, label: d.label, low: d.low * 100, typical: d.typical * 100, high: d.high * 100,
    selected: d.code === result?.analog?.code,
  }));
}
