// Production-history import (S4): Material Balance Studio rows
// (rb_production_data — dated CUMULATIVES, field/tank level) -> the deck
// builder's history periods (interval RATES per well). Pure shaping with
// explicit unit seams: cum_gas_scf is scf (deck gas is Mscf), oil/water
// are STB. Allocation splits the field signal across the model's wells.

const isoDate = (v) => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || ''));
  return m ? m[1] : null;
};

const addDays = (iso, days) => {
  const [y, mo, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d + days));
  return t.toISOString().slice(0, 10);
};

const dayDiff = (a, b) => Math.round(
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
);

/**
 * rows: rb_production_data rows ordered by timestep_index. Rows without a
 * usable cumulative are dropped; rows without observation_date get
 * synthetic monthly dates from `fallbackStartDate` (warned — WCONHIST
 * needs real calendar boundaries).
 *
 * allocation: {
 *   producers: [{name, frac}],        fracs should sum to ~1
 *   waterInjectors?: [{name, frac}],
 *   gasInjectors?: [{name, frac}],
 * }
 *
 * Returns { startDate, endDate, periods, warnings } ready for
 * spec.schedule.history, or throws with an actionable message.
 */
export function historyFromRbRows(rows, allocation, { fallbackStartDate = '2020-01-01' } = {}) {
  const warnings = [];
  const producers = allocation?.producers || [];
  if (!producers.length) throw new Error('History import needs at least one producer well to allocate rates to.');
  const fracSum = producers.reduce((s, w) => s + Number(w.frac || 0), 0);
  if (!(fracSum > 0.99 && fracSum < 1.01)) {
    throw new Error(`Producer allocation fractions must sum to 1 (got ${fracSum.toFixed(2)}).`);
  }

  const usable = (rows || [])
    .filter((r) => Number.isFinite(Number(r?.cum_oil_stb)))
    .map((r) => ({
      date: isoDate(r.observation_date),
      oil: Number(r.cum_oil_stb),
      gas: Number.isFinite(Number(r.cum_gas_scf)) ? Number(r.cum_gas_scf) : null,
      water: Number.isFinite(Number(r.cum_water_stb)) ? Number(r.cum_water_stb) : null,
      wInj: Number.isFinite(Number(r.cum_water_inj_stb)) ? Number(r.cum_water_inj_stb) : null,
      gInj: Number.isFinite(Number(r.cum_gas_inj_scf)) ? Number(r.cum_gas_inj_scf) : null,
    }));
  if (usable.length < 2) {
    throw new Error('History import needs at least two production rows with cumulative oil.');
  }

  const dated = usable.filter((r) => r.date).length;
  if (dated < usable.length) {
    if (dated > 0) {
      throw new Error('Some production rows have observation dates and some do not — date them consistently in Material Balance Studio first.');
    }
    warnings.push(`No observation dates on the MBAL rows — synthetic monthly dates from ${fallbackStartDate} were used.`);
    usable.forEach((r, idx) => { r.date = addDays(fallbackStartDate, Math.round(idx * 30.4375)); });
  }
  usable.sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < usable.length; i += 1) {
    if (dayDiff(usable[i - 1].date, usable[i].date) <= 0) {
      throw new Error(`Production rows share or reverse dates around ${usable[i].date}.`);
    }
  }

  let clampedNeg = 0;
  const rate = (prev, curr, key, scale = 1) => {
    if (prev[key] == null || curr[key] == null) return 0;
    const days = dayDiff(prev.date, curr.date);
    const r = ((curr[key] - prev[key]) / days) * scale;
    if (r < 0) { clampedNeg += 1; return 0; }
    return Math.round(r * 1000) / 1000;
  };

  const periods = [];
  for (let i = 1; i < usable.length; i += 1) {
    const prev = usable[i - 1];
    const curr = usable[i];
    const orat = rate(prev, curr, 'oil');
    const wrat = rate(prev, curr, 'water');
    const grat = rate(prev, curr, 'gas', 1 / 1000); // scf -> Mscf
    const wInjRate = rate(prev, curr, 'wInj');
    const gInjRate = rate(prev, curr, 'gInj', 1 / 1000);

    const prod = producers.map((w) => ({
      name: w.name,
      orat: Math.round(orat * w.frac * 1000) / 1000,
      wrat: Math.round(wrat * w.frac * 1000) / 1000,
      grat: Math.round(grat * w.frac * 1000) / 1000,
    }));
    const inj = [
      ...(allocation.waterInjectors || []).map((w) => ({
        name: w.name, phase: 'WATER', rate: Math.round(wInjRate * (w.frac ?? 1) * 1000) / 1000,
      })),
      ...(allocation.gasInjectors || []).map((w) => ({
        name: w.name, phase: 'GAS', rate: Math.round(gInjRate * (w.frac ?? 1) * 1000) / 1000,
      })),
    ].filter((w) => w.rate > 0);

    periods.push({ date: prev.date, prod, inj });
  }
  if (clampedNeg > 0) {
    warnings.push(`${clampedNeg} interval rate(s) computed negative (cumulative dipped) and were clamped to zero.`);
  }

  return {
    startDate: usable[0].date,
    endDate: usable[usable.length - 1].date,
    periods,
    warnings,
  };
}

/** Compact preview rows for the UI table: one line per period. */
export function historyPreviewRows(history, maxRows = 8) {
  const periods = history?.periods || [];
  const pick = periods.length <= maxRows
    ? periods
    : periods.filter((_, i) => i % Math.ceil(periods.length / maxRows) === 0);
  return pick.map((p) => ({
    date: p.date,
    orat: p.prod.reduce((s, w) => s + w.orat, 0),
    wrat: p.prod.reduce((s, w) => s + w.wrat, 0),
    grat: p.prod.reduce((s, w) => s + w.grat, 0),
    inj: p.inj.reduce((s, w) => s + w.rate, 0),
  }));
}
