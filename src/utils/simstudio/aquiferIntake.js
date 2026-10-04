/**
 * The analytical aquifer of the Model Builder (SIM-U2-004, RL11): Fetkovich
 * (AQUFETP) or Carter-Tracy (AQUCT with its influence table AQUTAB), typed
 * or taken by id from a Material Balance case (mbal-1, src/lib/mbalCaseSource.js:
 * the aquifer numbers the case's last run used, fitted values first), joined
 * to one face of the grid (AQUANCON).
 *
 * How the Material Balance aquifer maps to OPM Flow's keywords:
 *  - Fetkovich: the engine's W (water in place, rb), J (rb/d/psi) and ct are
 *    AQUFETP's initial volume, productivity index and total compressibility:
 *    both take the aquifer pressure as pi - We / (ct W) and the influx rate
 *    as J (p_aquifer - p_reservoir).
 *  - Carter-Tracy: k, porosity, ct, r_R (AQUCT's inner radius), h and the
 *    encroachment angle as they are; the influence function is the MBAL
 *    engine's own pD(tD) (carterTracyPD, finite reD blended into pseudo
 *    steady state) written as AQUTAB, so both use one function. OPM Flow
 *    takes the water viscosity of the aquifer from PVTW, and tD scales with
 *    k / mu only, so the permeability is written as k x mu(PVTW) / mu(aquifer)
 *    and the aquifer diffuses as the MBAL one does; the deck and the report
 *    say so.
 *  - Datum: the equilibration datum; the initial pressure is left to the
 *    simulator's equilibrium there, which is the pressure at datum the form
 *    holds.
 *
 * Pure.
 */
import { carterTracyPD } from '../../../packages/engines/engines/mbal/mbalEngine.ts';

export const AQUIFER_MODELS = Object.freeze({
  fetkovich: 'Fetkovich (AQUFETP)',
  carter_tracy: 'Carter-Tracy (AQUCT, influence table AQUTAB)',
});
export const AQUIFER_FACE_WORDS = Object.freeze({
  'I-': 'west edge (I = 1)', 'I+': 'east edge (I = NX)', 'J-': 'south edge (J = 1)', 'J+': 'north edge (J = NY)', 'K+': 'bottom (K = NZ)',
});

/** The default aquifer section of the builder form (off). */
export const defaultAquiferForm = () => ({
  enabled: false,
  model: 'fetkovich',
  face: 'I-',
  fet: { W_rb: '', J_rb_d_psi: '', ct_psi: '' },
  ct: { k_md: '', phi: '', h_ft: '', theta_deg: '360', r_R_ft: '', reD: '', muw_cp: '', ct_psi: '' },
  intake: null,
});

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v) => (v == null || !Number.isFinite(Number(v)) ? '' : String(parseFloat(Number(v).toPrecision(10))));

/**
 * The aquifer of an mbal-1 record as builder form values, with the sources,
 * or the reason it cannot be used.
 * @returns {{ok: true, model: string, fet?: object, ct?: object, intake: object}|{ok: false, reason: string}}
 */
export function aquiferFromMbal(record, { at = new Date().toISOString() } = {}) {
  if (!record) return { ok: false, reason: 'No Material Balance case was read.' };
  const aq = record.aquifer;
  if (!aq || aq.model === 'none') return { ok: false, reason: `The case "${record.case?.name}" has no aquifer (a closed tank).` };
  if (aq.model === 'pot') return { ok: false, reason: `The case "${record.case?.name}" uses a pot aquifer, which has no time dependence. OPM Flow's analytical aquifers are Fetkovich and Carter-Tracy: fit one of them in Material Balance Studio, or type one here.` };
  const v = aq.values || {};
  const need = aq.model === 'fetkovich' ? ['W_rb', 'J_rb_d_psi', 'ct_psi'] : ['k_md', 'h_ft', 'phi', 'r_R_ft', 'ct_psi', 'muw_cp'];
  const missing = need.filter((k) => !finite(v[k]));
  if (missing.length) return { ok: false, reason: `The last run of "${record.case?.name}" does not give ${missing.join(', ')} for its ${aq.model === 'fetkovich' ? 'Fetkovich' : 'Carter-Tracy'} aquifer. Run the case again in Material Balance Studio.` };
  const intake = {
    contract: 'mbal-1',
    from: { app: record.app, recordId: record.case?.id, recordName: record.case?.name, runId: record.run?.id, ranAt: record.run?.ran_at, engine: record.run?.engine_version, at },
    model: aq.model,
    values: { ...v },
    sources: { ...(aq.sources || {}) },
    initialPressurePsia: record.pressure?.initial_psia ?? null,
    status: record.status,
  };
  if (aq.model === 'fetkovich') {
    return { ok: true, model: 'fetkovich', fet: { W_rb: str(v.W_rb), J_rb_d_psi: str(v.J_rb_d_psi), ct_psi: str(v.ct_psi) }, intake };
  }
  return {
    ok: true,
    model: 'carter_tracy',
    ct: { k_md: str(v.k_md), phi: str(v.phi), h_ft: str(v.h_ft), theta_deg: str(v.theta_deg ?? 360), r_R_ft: str(v.r_R_ft), reD: v.reD == null ? '' : str(v.reD), muw_cp: str(v.muw_cp), ct_psi: str(v.ct_psi) },
    intake,
  };
}

/** The values of the form that differ from what the intake gave (edited after taking). */
export function aquiferEditedKeys(aqForm) {
  const it = aqForm?.intake;
  if (!it) return [];
  const map = it.model === 'fetkovich'
    ? { W_rb: ['fet', 'W_rb'], J_rb_d_psi: ['fet', 'J_rb_d_psi'], ct_psi: ['fet', 'ct_psi'] }
    : { k_md: ['ct', 'k_md'], phi: ['ct', 'phi'], h_ft: ['ct', 'h_ft'], theta_deg: ['ct', 'theta_deg'], r_R_ft: ['ct', 'r_R_ft'], reD: ['ct', 'reD'], muw_cp: ['ct', 'muw_cp'], ct_psi: ['ct', 'ct_psi'] };
  return Object.entries(map).filter(([k, [g, f]]) => {
    const now = Number(aqForm[g]?.[f]);
    const was = it.values[k];
    if (was == null) return String(aqForm[g]?.[f] ?? '').trim() !== '';
    return !(Number.isFinite(now) && Math.abs(now - was) <= 1e-9 * Math.max(1, Math.abs(was)));
  }).map(([k]) => k);
}

/**
 * The influence table: the MBAL engine's pD at tD on a log grid from 0.01 to
 * past the run's end (at least to pseudo steady state for a finite aquifer).
 */
export function influenceRows({ k_md, phi, muw_cp, ct_psi, r_R_ft, reD = null, endDays }) {
  const tdPerDay = (6.328e-3 * k_md) / (phi * muw_cp * ct_psi * r_R_ft * r_R_ft);
  const tdEnd = Math.max(10, tdPerDay * endDays * 1.5, reD ? 1.5 * 0.4 * reD * reD : 0);
  const n = 40;
  const lo = Math.log10(0.01);
  const hi = Math.log10(tdEnd);
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const tD = 10 ** (lo + ((hi - lo) * i) / (n - 1));
    rows.push({ tD: Number(tD.toPrecision(8)), pD: Number(carterTracyPD(tD, reD ?? Infinity).toPrecision(8)) });
  }
  return rows;
}

/** The connected cells of a face of the grid. */
export function faceBox(face, grid) {
  const all = { i1: 1, i2: grid.nx, j1: 1, j2: grid.ny, k1: 1, k2: grid.nz };
  switch (face) {
    case 'I-': return { face, ...all, i2: 1 };
    case 'I+': return { face, ...all, i1: grid.nx };
    case 'J-': return { face, ...all, j2: 1 };
    case 'J+': return { face, ...all, j1: grid.ny };
    case 'K+': return { face, ...all, k1: grid.nz };
    default: return { face, ...all, i2: 1 };
  }
}

/**
 * The composeDeck aquifer of the form, or null when off.
 * @param {object} aq form.aquifer
 * @param {{grid: object, pvtw: {muw: number}, datumDepth: number, endDays: number, req: function}} o
 *   `req` the builder's strict reader (blank or unreadable inputs refused by name)
 */
export function aquiferSpec(aq, { grid, pvtw, datumDepth, endDays, req }) {
  if (!aq?.enabled) return null;
  const connection = faceBox(aq.face, grid);
  if (aq.model === 'fetkovich') {
    return {
      model: 'fetkovich',
      datumDepth,
      fetkovich: {
        volume: req(aq.fet.W_rb, 'Aquifer water in place W', { min: 0 }),
        pi: req(aq.fet.J_rb_d_psi, 'Aquifer productivity index J', { min: 0 }),
        ct: req(aq.fet.ct_psi, 'Aquifer total compressibility', { min: 0 }),
      },
      connection,
    };
  }
  const c = aq.ct;
  const k = req(c.k_md, 'Aquifer permeability', { min: 0 });
  const phi = req(c.phi, 'Aquifer porosity', { min: 0, max: 1 });
  const h = req(c.h_ft, 'Aquifer thickness', { min: 0 });
  const theta = req(c.theta_deg, 'Aquifer encroachment angle', { min: 0, max: 360 });
  const r0 = req(c.r_R_ft, 'Reservoir radius at the aquifer r_R', { min: 0 });
  const muw = req(c.muw_cp, 'Aquifer water viscosity', { min: 0 });
  const ct = req(c.ct_psi, 'Aquifer total compressibility', { min: 0 });
  const reD = String(c.reD ?? '').trim() === '' ? null : req(c.reD, 'Aquifer radius ratio reD', { min: 1 });
  const muPvtw = Number(pvtw?.muw);
  if (![k, phi, h, theta, r0, muw, ct].every(finite) || !(muPvtw > 0)) return { model: 'carter_tracy', invalid: true };
  return {
    model: 'carter_tracy',
    datumDepth,
    carterTracy: {
      // tD scales with k / mu: OPM Flow takes mu from PVTW, so k is written to keep k / mu the aquifer's
      k: k * (muPvtw / muw),
      phi, ct, r0, h, theta,
      influence: influenceRows({ k_md: k, phi, muw_cp: muw, ct_psi: ct, r_R_ft: r0, reD, endDays }),
    },
    connection,
    kAsEntered: k,
    muwAquifer: muw,
    muwPvtw: muPvtw,
    reD,
  };
}

/** Deck comment lines that say where the aquifer came from and how it was written. */
export function aquiferNotes(aq, spec) {
  if (!aq?.enabled || !spec || spec.invalid) return [];
  const it = aq.intake;
  const out = [];
  out.push(`Aquifer: ${AQUIFER_MODELS[spec.model]}, joined to the ${AQUIFER_FACE_WORDS[spec.connection.face] || spec.connection.face} (AQUANCON ${spec.connection.face})`);
  if (it) {
    out.push(`Aquifer source: mbal-1 from ${it.from?.app || 'Material Balance Studio'} case "${it.from?.recordName}"${it.status === 'earlier_run' ? ' (an earlier run of a since-changed case)' : ''}`);
    out.push(`Aquifer source ids: case ${it.from?.recordId}, run ${it.from?.runId || 'n/a'}, taken ${it.from?.at}`);
  } else out.push('Aquifer source: entered in the deck builder');
  if (spec.model === 'fetkovich') {
    const f = spec.fetkovich;
    out.push(`Aquifer Fetkovich: W ${f.volume} rb (AQUFETP initial volume), J ${f.pi} rb/d/psi, ct ${f.ct} 1/psi`);
    out.push('Aquifer initial pressure: the equilibrium pressure at the datum');
  } else {
    const c = spec.carterTracy;
    out.push(`Aquifer Carter-Tracy: k ${spec.kAsEntered} mD written as ${parseFloat(c.k.toPrecision(8))} mD = k x mu PVTW ${spec.muwPvtw} / mu aquifer ${spec.muwAquifer} cP`);
    out.push('(OPM Flow takes the aquifer water viscosity from PVTW, and tD scales with k / mu)');
    out.push(`Aquifer Carter-Tracy: porosity ${c.phi}, ct ${c.ct} 1/psi, r_R ${c.r0} ft, h ${c.h} ft, angle ${c.theta} deg`);
    out.push(`Aquifer influence table AQUTAB (table 2): the Material Balance engine pD(tD), ${spec.reD ? `finite, reD ${spec.reD}` : 'infinite acting'}`);
  }
  const edited = aquiferEditedKeys(aq);
  if (edited.length) out.push(`Aquifer edited in the deck builder after intake: ${edited.join(', ')}`);
  return out;
}
