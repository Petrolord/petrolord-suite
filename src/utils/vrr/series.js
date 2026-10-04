/**
 * The chart series of the Voidage Replacement Monitor, shared by the screen
 * charts and the report figures (VRR-U1, RL6 and RL12: the report draws what
 * the screen shows, and a test holds the point counts of one against the
 * other). Values are in the display units of the system.
 *
 * Pure.
 */
import { vrrUnits } from './units.js';
import { daysInMonth } from './csvImport.js';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export const isMonthLabel = (label) => /^\d{4}-\d{2}$/.test(String(label || ''));
/** Milliseconds of the first day of a 'YYYY-MM' month (UTC). */
export const monthMs = (label) => Date.UTC(Number(label.slice(0, 4)), Number(label.slice(5, 7)) - 1, 1);
/** Milliseconds of the middle of a 'YYYY-MM' month (the 15th), where a monthly volume and an interpolated pressure sit. */
export const midMonthMs = (label) => Date.UTC(Number(label.slice(0, 4)), Number(label.slice(5, 7)) - 1, 15);
/** The calendar span a dated figure must show: the first month's start to the start of the month after the last. */
export function monthSpan(d) {
  if (!datedPeriods(d)) return [];
  const first = d.series[0].label;
  const last = d.series[d.series.length - 1].label;
  return [monthMs(first), Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 1)];
}
const r3 = (v) => (finite(v) ? Number(v.toFixed(3)) : null);

/** Whether the periods carry calendar months (a calendar X axis) or only their order. */
export const datedPeriods = (d) => d.series.length > 0 && d.series.every((s) => isMonthLabel(s.label));

/** X of each period: the middle of its month in ms on a calendar axis, else the period number. */
export const periodX = (d) => (datedPeriods(d) ? d.series.map((s) => midMonthMs(s.label)) : d.series.map((_, i) => i + 1));

/** The VRR trend: the periods with produced voidage, as the dashboard chart shows them. */
export function trendRows(d) {
  if (d.withheld) return [];
  const xs = periodX(d);
  return d.series
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.producedVoidage > 0)
    .map(({ r, i }) => ({
      x: xs[i],
      label: r.label || `P${r.index + 1}`,
      instantaneous: r3(r.instantaneousVRR),
      rolling: r3(d.rolling[i]),
      cumulative: r3(r.cumulativeVRR),
    }));
}

/** The voidage terms of each period in the display reservoir unit. */
export function termRows(d, system) {
  const u = vrrUnits(system);
  const xs = periodX(d);
  return d.ledger.rows.map((r, i) => ({
    x: xs[i],
    label: r.label || `P${i + 1}`,
    oil: u.show('reservoir', r.oilRB),
    water: u.show('reservoir', r.waterRB),
    freeGas: u.show('reservoir', r.freeGasRB),
    injWater: u.show('reservoir', r.injWaterRB),
    injGas: u.show('reservoir', r.injGasRB),
  }));
}

/** Surveys (display unit) and the pressure attached to each period. */
export function pressureRows(d, surveys, system) {
  const u = vrrUnits(system);
  const xs = periodX(d);
  const dated = datedPeriods(d);
  const survey = dated ? (surveys || [])
    .map((s) => ({ d: String(s.date || ''), p: Number(s.p_psia) }))
    .filter((s) => /^\d{4}-\d{2}/.test(s.d) && finite(s.p))
    .map((s) => ({ x: Date.UTC(Number(s.d.slice(0, 4)), Number(s.d.slice(5, 7)) - 1, s.d.length >= 10 ? Number(s.d.slice(8, 10)) : 1), p: u.show('pressure', s.p) }))
    .sort((a, b) => a.x - b.x) : [];
  const periods = d.periodsWithPressure.map((p, i) => ({
    x: xs[i], // mid-month, where the surveys were interpolated
    label: p.label,
    p: finite(p.pressure) ? u.show('pressure', p.pressure) : null,
    dpdt: finite(p.dpdt) ? u.show('dpdt', p.dpdt) : null,
  }));
  return { survey, periods };
}

/**
 * Calendar-day rates of each period (volume over the days of the month), in
 * the display units per day. Only for calendar months; null otherwise.
 */
export function rateRows(d, system) {
  if (!datedPeriods(d)) return null;
  const u = vrrUnits(system);
  const xs = periodX(d);
  return d.ledger.rows.map((r, i) => {
    const days = daysInMonth(r.label);
    return {
      x: xs[i],
      label: r.label,
      days,
      oil: u.show('oil', r.Np) / days,
      water: u.show('water', r.Wp) / days,
      gas: u.show('gas', r.Gp) / days,
      injWater: u.show('water', r.Wi) / days,
      injGas: u.show('gas', r.Gi) / days,
    };
  });
}

/** The FVF set of each period, in display units, when it varies by period. */
export function fvfRows(d, system) {
  const u = vrrUnits(system);
  const xs = periodX(d);
  return d.ledger.rows.map((r, i) => ({
    x: xs[i], label: r.label, Bo: u.show('bo', r.fvf.Bo), Bw: u.show('bw', r.fvf.Bw), Bg: u.show('bg', r.fvf.Bg), Rs: u.show('rs', r.fvf.Rs),
  }));
}
