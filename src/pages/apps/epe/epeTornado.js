// Reading the Sensitivity (Tornado) panel without hovering (video programme,
// 2026-10-14). The chart had uneven ticks (-3.3M, -1.3M, 704K, 3.3M), a base
// NPV to two figures ("2.0M" beside a $1.98M headline) and no numbers on the
// bars. These helpers format the batch engine's sweep rows
// (supabase/functions/epe-cash-flow-engine-batch: variable, low/base/high
// value, factors, base/low/high NPV, deltas) for the readout table, the
// ticks and one sentence naming the two biggest drivers. Nothing is
// recomputed: NPV at low and high are the engine's own (base + delta when an
// older row lacks low_npv / high_npv).

/** Money to three significant figures, like the Results Viewer headline. */
export function usd3(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'n/a';
  const x = Math.abs(v) < 0.5 ? 0 : v;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumSignificantDigits: 3 }).format(x);
}

const sig3 = (v) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 }).format(v);
const fixedSmart = (v) => (Math.abs(v) < 10 ? v.toFixed(2) : Math.abs(v) < 100 ? v.toFixed(1) : sig3(v));

/** NPV at the low and high input, the swing between them. */
export function npvPair(row, baseNpv) {
  const base = Number(row?.base_npv ?? baseNpv) || 0;
  const low = Number.isFinite(Number(row?.low_npv)) ? Number(row.low_npv) : base + (Number(row?.delta_low_npv) || 0);
  const high = Number.isFinite(Number(row?.high_npv)) ? Number(row.high_npv) : base + (Number(row?.delta_high_npv) || 0);
  return { low, high, swing: Math.abs(high - low) };
}

/** One input value of a sweep row, in the variable's own unit. */
export function formatInput(row, side) {
  const v = Number(side === 'low' ? row?.low_value : row?.high_value);
  if (!Number.isFinite(v)) return 'n/a';
  const key = String(row?.variable || '');
  const factor = Number(side === 'low' ? row?.low_factor : row?.high_factor);
  const fx = Number.isFinite(factor) ? ` (x${factor.toFixed(2)})` : '';
  if (key === 'schedule_shift_years') return v === 0 ? 'on time' : `+${v} yr`;
  if (key === '__production_multiplier') return `${sig3(v / 1e6)} MMboe${fx}`;
  if (key === '__capex_multiplier' || key === '__opex_multiplier') return `${usd3(v)}${fx}`;
  if (key === 'oil_price_usd_bbl') return `$${fixedSmart(v)}/bbl`;
  if (key === 'gas_price_usd_mscf') return `$${fixedSmart(v)}/Mscf`;
  if (key.endsWith('_per_bbl_converted') || key.endsWith('_per_bbl')) return `$${fixedSmart(v)}/bbl`;
  if (key.endsWith('_pct')) return `${fixedSmart(v)}%`;
  return sig3(v);
}

/** Evenly spaced, symmetric ticks around zero covering maxAbs. */
export function niceTicks(maxAbs, target = 4) {
  const m = Math.abs(Number(maxAbs)) || 1;
  const raw = m / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw);
  const n = Math.ceil(m / step);
  const ticks = [];
  for (let i = -n; i <= n; i += 1) ticks.push(Math.round(i * step * 1e6) / 1e6);
  return { ticks, domain: [-n * step, n * step], step };
}

/** Readout rows in the panel's order (the engine's impact order). */
export function tornadoTable(rows, baseNpv) {
  return (rows || []).map((r) => {
    const n = npvPair(r, baseNpv);
    return {
      key: r.variable || r.variable_label,
      label: r.variable_label,
      lowInput: formatInput(r, 'low'),
      highInput: formatInput(r, 'high'),
      npvLow: n.low,
      npvHigh: n.high,
      swing: n.swing,
    };
  });
}

/** One sentence naming the two biggest drivers and their NPV ranges, or null. */
export function tornadoSentence(rows, baseNpv) {
  const t = tornadoTable(rows, baseNpv).filter((r) => r.swing > 0).sort((a, b) => b.swing - a.swing);
  if (t.length === 0) return null;
  const range = (r) => `${usd3(Math.min(r.npvLow, r.npvHigh))} to ${usd3(Math.max(r.npvLow, r.npvHigh))}`;
  if (t.length === 1) return `${t[0].label} moves NPV the most, from ${range(t[0])}.`;
  return `${t[0].label} and ${t[1].label} move NPV the most: ${t[0].label} from ${range(t[0])}, ${t[1].label} from ${range(t[1])}.`;
}

/**
 * The engine's First Oil Delay (schedule_shift_years) moves every production
 * file and its opex a year later. On a case whose wells were producing before
 * its first capex (a brownfield such as Ekene, producing from 2020 with
 * Ekene-11's capex in 2027) that delays the wells already on stream and the
 * history too, so the bar does not read as a delay of the new development.
 * Returns the note to print, or null on a case that spends before it produces.
 */
export function scheduleShiftNote(rows, cashFlowData) {
  const hasBar = (rows || []).some((r) => r.variable === 'schedule_shift_years' || /First Oil Delay/i.test(r.variable_label || ''));
  if (!hasBar || !Array.isArray(cashFlowData)) return null;
  const years = (pred) => cashFlowData.filter(pred).map((r) => r.year).filter((y) => Number.isFinite(y));
  const firstProd = Math.min(...years((r) => (r.oil_bbl || 0) + (r.gas_mscf || 0) + (r.condensate_bbl || 0) > 0));
  const firstCapex = Math.min(...years((r) => (r.capex || 0) > 0));
  if (!Number.isFinite(firstProd)) return null;
  if (Number.isFinite(firstCapex) && firstProd >= firstCapex) return null;
  const capexText = Number.isFinite(firstCapex) ? ` with its first capex in ${firstCapex}` : ' with no capex';
  return `First Oil Delay moves every production file and its opex a year later. This case produces from ${firstProd}${capexText}, so the bar also delays the wells already on stream; read it on a new development.`;
}
