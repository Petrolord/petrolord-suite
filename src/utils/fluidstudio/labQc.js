/**
 * Quality checks of laboratory PVT tables (FLUID-U2-018; RL8). The checks
 * flag; they never change a row.
 *
 *  - Monotonic trends: in a constant composition expansion the relative
 *    volume falls as pressure rises; in a differential liberation Rsd and
 *    Bod rise with pressure, the relative total volume, Bg and the oil
 *    density fall; the oil viscosity falls with pressure below the bubble
 *    point and rises above it.
 *  - Y function of the expansion: linear in pressure below the saturation
 *    pressure; a point far from the straight line is flagged.
 *  - Mass balance of the differential liberation (the material-balance
 *    check of a differential test, as McCain and Whitson describe it): the
 *    mass of oil at each stage, density x Bod per barrel of residual oil,
 *    equals the mass at the next lower stage plus the mass of the gas
 *    liberated between them, 0.0764 lb/scf x incremental gas gravity x the
 *    drop in Rsd. A stage whose two masses differ by more than 1 percent is
 *    flagged.
 *
 * Pure.
 */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
/** Mass of a standard cubic foot of air, lb (14.7 psia, 60 degF). */
export const AIR_LB_PER_SCF = 0.0764;
/** lb per (g/cm3 x barrel): 62.42796 lb/ft3 per g/cm3 times 5.614583 ft3/bbl. */
const LB_PER_GCC_BBL = 62.42796 * 5.614583;
const LB_PER_FT3_PER_GCC = 62.42796;
export const MASS_BALANCE_TOLERANCE = 0.01;

const trend = (rows, key, sign, label, kind) => {
  // sign +1: rises with pressure; -1: falls
  const pts = rows.filter((r) => finite(r[key])).sort((a, b) => a.pressure - b.pressure);
  const out = [];
  for (let i = 1; i < pts.length; i += 1) {
    const d = pts[i][key] - pts[i - 1][key];
    if (sign * d < 0) out.push({ kind, check: 'trend', key, pressure: pts[i].pressure, text: `${label} ${sign > 0 ? 'falls' : 'rises'} from ${pts[i - 1][key]} at ${Math.round(pts[i - 1].pressure)} psia to ${pts[i][key]} at ${Math.round(pts[i].pressure)} psia, where it should ${sign > 0 ? 'rise' : 'fall'} with pressure.` });
  }
  return out;
};

/** The straight line through the Y function of an expansion, and the points far from it. */
export function yFunctionCheck(cceRows, { tolerance = 0.03 } = {}) {
  const pts = (cceRows || []).filter((r) => finite(r.yFunction)).sort((a, b) => a.pressure - b.pressure);
  if (pts.length < 4) return { line: null, flags: [] };
  const n = pts.length;
  const mx = pts.reduce((s, r) => s + r.pressure, 0) / n;
  const my = pts.reduce((s, r) => s + r.yFunction, 0) / n;
  const sxx = pts.reduce((s, r) => s + (r.pressure - mx) ** 2, 0);
  const slope = pts.reduce((s, r) => s + (r.pressure - mx) * (r.yFunction - my), 0) / sxx;
  const intercept = my - slope * mx;
  const flags = [];
  for (const r of pts) {
    const fit = intercept + slope * r.pressure;
    const dev = (r.yFunction - fit) / fit;
    if (Math.abs(dev) > tolerance) flags.push({ kind: 'cce', check: 'y-function', key: 'yFunction', pressure: r.pressure, text: `The Y function ${r.yFunction} at ${Math.round(r.pressure)} psia is ${(100 * dev).toFixed(1)} percent off the straight line through the others (${fit.toFixed(3)}); near the saturation pressure a small error in the relative volume does this.` });
  }
  return { line: { slope, intercept }, flags };
}

/**
 * The mass balance of a differential liberation, stage by stage from the residual oil up.
 * @returns {Array<{pressure: number, measured: number, fromBelow: number, deviation: number}>} lb per residual barrel
 */
export function dlMassBalance(dlRows) {
  const pts = (dlRows || []).filter((r) => finite(r.Bo) && finite(r.density) && finite(r.Rs)).sort((a, b) => a.pressure - b.pressure);
  const out = [];
  for (let i = 1; i < pts.length; i += 1) {
    const lo = pts[i - 1];
    const hi = pts[i];
    if (!finite(lo.gasGravity) && !finite(hi.gasGravity)) continue;
    // the gas liberated between the two stages is the gas of the lower one (the incremental gas of that step)
    const g = finite(lo.gasGravity) ? lo.gasGravity : hi.gasGravity;
    const mLo = (lo.density / LB_PER_FT3_PER_GCC) * lo.Bo * LB_PER_GCC_BBL;
    const mHi = (hi.density / LB_PER_FT3_PER_GCC) * hi.Bo * LB_PER_GCC_BBL;
    const gas = AIR_LB_PER_SCF * g * (hi.Rs - lo.Rs);
    const fromBelow = mLo + gas;
    out.push({ pressure: hi.pressure, measured: mHi, fromBelow, deviation: (mHi - fromBelow) / mHi });
  }
  return out;
}

/**
 * Every check on the loaded tables.
 * @param {object} labData labDataOf(inputs)
 * @returns {{flags: object[], massBalance: object[], yLine: ?object, checked: string[]}}
 */
export function labQc(labData) {
  const flags = [];
  const checked = [];
  const d = labData || {};
  if (d.cce) {
    checked.push('constant composition expansion: relative volume falls with pressure; the Y function is a straight line');
    flags.push(...trend(d.cce.rows, 'relVol', -1, 'The relative volume', 'cce'));
    const y = yFunctionCheck(d.cce.rows);
    flags.push(...y.flags);
  }
  let massBalance = [];
  if (d.dl) {
    checked.push('differential liberation: Rsd and Bod rise with pressure; the relative total volume, Bg and the oil density fall; the mass balance of each stage');
    const rows = d.dl.rows;
    flags.push(...trend(rows, 'Rs', +1, 'Rsd', 'dl'), ...trend(rows, 'Bo', +1, 'Bod', 'dl'), ...trend(rows, 'Bt', -1, 'The relative total volume', 'dl'),
      ...trend(rows, 'Bg', -1, 'Bg', 'dl'), ...trend(rows, 'density', -1, 'The oil density', 'dl'));
    for (const r of rows) if (finite(r.Z) && (r.Z < 0.2 || r.Z > 1.2)) flags.push({ kind: 'dl', check: 'range', key: 'Z', pressure: r.pressure, text: `Z ${r.Z} at ${Math.round(r.pressure)} psia is outside 0.2 to 1.2.` });
    massBalance = dlMassBalance(rows);
    for (const m of massBalance) {
      if (Math.abs(m.deviation) > MASS_BALANCE_TOLERANCE) flags.push({ kind: 'dl', check: 'mass-balance', key: 'mass', pressure: m.pressure, text: `Mass balance at ${Math.round(m.pressure)} psia: the oil holds ${m.measured.toFixed(1)} lb per residual barrel from its density and Bod, and ${m.fromBelow.toFixed(1)} lb from the stage below plus the gas liberated (${(100 * m.deviation).toFixed(1)} percent apart).` });
    }
  }
  const visc = d.viscosity?.rows || (d.dl?.rows || []).filter((r) => finite(r.mu_o));
  if (visc.length) {
    checked.push('oil viscosity: falls with pressure below the bubble point and rises above it');
    const top = Math.max(...((d.dl?.rows || []).map((r) => r.pressure)), 0);
    const pb = d.cce?.rows?.find((r) => finite(r.relVol) && Math.abs(r.relVol - 1) < 5e-5)?.pressure ?? (top || null);
    if (pb) {
      flags.push(...trend(visc.filter((r) => r.pressure <= pb + 0.5), 'mu_o', -1, 'The oil viscosity below the bubble point', 'viscosity'));
      flags.push(...trend(visc.filter((r) => r.pressure >= pb - 0.5), 'mu_o', +1, 'The oil viscosity above the bubble point', 'viscosity'));
    }
  }
  return { flags, massBalance, checked };
}
