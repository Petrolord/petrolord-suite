/**
 * One derived model of the Recovery Factor Estimator (RF-U1; RL12): the
 * screen, the report and the saved project all read what deriveRf returns
 * from the stored inputs, so they cannot disagree.
 *
 * In-place volume by its parts (RL2): gross rock volume A h, net rock volume
 * A h NTG, pore volume, hydrocarbon pore volume, then OOIP or OGIP through
 * the volume factor. The engine calls are the shipped ones
 * (stoiipVolumetric, ogipVolumetric, estimateRecovery); the parts are for
 * reading, and a test holds them closing on the engine total.
 *
 * Pure.
 */
import {
  estimateRecovery, stoiipVolumetric, ogipVolumetric, volumetricInputFlags, DRIVE_MECHANISMS,
} from '@/utils/recoveryFactorCalculations';
import { sampleKeysInUse, inputsWithLinked } from './model';
import { rfUncertainty } from './uncertainty.js';
import { rfGasZ, inputsWithGasZ } from './gasZ.js';

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

// 1 acre-ft = 43,560 ft3; 1 bbl = 5.614583 ft3 (the engine's 7758 is 43560 / 5.6146, rounded)
const FT3_PER_ACRE_FT = 43560;
const FT3_PER_BBL = 5.614583333333333;

/** The in-place volume by its parts, in the engine units (acre-ft, RB or reservoir ft3, STB or scf). */
export function inPlaceParts(vol, phase) {
  const A = num(vol?.area); const h = num(vol?.thickness); const ntg = num(vol?.ntg);
  const phi = num(vol?.phi); const sw = num(vol?.sw);
  const fvf = num(phase === 'gas' ? vol?.bgi : vol?.boi);
  const grv = A * h; // acre-ft
  const nrv = grv * ntg;
  const pvFt3 = nrv * FT3_PER_ACRE_FT * phi;
  const hcpvFt3 = pvFt3 * (1 - sw);
  const total = phase === 'gas' ? ogipVolumetric(vol || {}) : stoiipVolumetric(vol || {});
  const ok = [grv, nrv, pvFt3, hcpvFt3].every(Number.isFinite);
  return {
    grv_acft: ok ? grv : null,
    nrv_acft: ok ? nrv : null,
    pv_rb: ok ? pvFt3 / FT3_PER_BBL : null,
    hcpv_rb: ok ? hcpvFt3 / FT3_PER_BBL : null,
    hcpv_ft3: ok ? hcpvFt3 : null,
    fvf: Number.isFinite(fvf) ? fvf : null,
    total,
    formula: phase === 'gas'
      ? 'OGIP (scf) = 43,560 A h NTG phi (1 - Sw) / Bgi, with Bgi in reservoir ft3 per scf'
      : 'OOIP (STB) = 7,758 A h NTG phi (1 - Sw) / Boi, with 7,758 bbl per acre-ft',
  };
}

/**
 * @param {object} inputs the stored inputs (strings, oilfield units)
 * @param {{inPlaceIntake?: ?object, pvtIntake?: ?object}} [extra]
 */
export function deriveRf(typed, { inPlaceIntake = null, pvtIntake = null } = {}) {
  // RF-U2-003: a gas case on Dranchuk-Abou-Kassem reads zi, za and Bgi from the
  // canonical engines; every engine call below takes the inputs as used
  const gasZ = rfGasZ(typed);
  // RF-U2-012: linked, the method reads the volumetric porosity, Swi and Boi
  const inputs = inputsWithGasZ(inputsWithLinked(typed), gasZ);
  const phase = inputs?.phase === 'gas' ? 'gas' : 'oil';
  const direct = inputs?.inPlaceMode === 'direct';
  const parts = direct ? null : inPlaceParts(inputs?.vol, phase);
  let inPlace = null;
  if (direct) {
    const n = num(inputs?.ooipDirect);
    inPlace = Number.isFinite(n) && n > 0 ? n : null;
  } else {
    inPlace = Number.isFinite(parts.total) && parts.total > 0 ? parts.total : null;
  }
  const result = estimateRecovery({
    method: inputs?.method, driveCode: inputs?.driveCode, ooip: inPlace, correlationInputs: inputs?.corr,
  });
  const volFlags = direct ? [] : volumetricInputFlags(inputs?.vol, phase).map((f) => ({ ...f, scope: 'volumetric' }));
  if (direct && inPlace == null) volFlags.push({ key: 'ooipDirect', scope: 'volumetric', text: `${phase === 'gas' ? 'OGIP' : 'OOIP'} is blank, zero or not a number, so no reserves are computed.` });

  // RL12: one porosity and one Swi per case. The volumetric and correlation
  // fields are separate boxes; a difference is said, never reconciled silently.
  const consistency = [];
  const shared = { api_solution_gas: ['phi', 'swi'], api_water_drive: ['phi', 'swi', 'boi'], gas_water_drive: ['swi'] }[inputs?.method] || [];
  if (!direct && !typed?.linked) {
    for (const [v, c, label] of [['phi', 'phi', 'Porosity'], ['sw', 'swi', 'Water saturation'], ['boi', 'boi', 'Boi']]) {
      if (!shared.includes(c)) continue;
      const a = num(inputs.vol?.[v]); const b = num(inputs.corr?.[c]);
      if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > 1e-9) {
        consistency.push({ key: c, scope: 'consistency', text: `${label} is ${a} in the volumetrics and ${b} in the method inputs.` });
      }
    }
  }
  if (inPlaceIntake && direct && inPlaceIntake.value != null && Math.abs(num(inputs?.ooipDirect) - inPlaceIntake.value) > 1e-6 * Math.max(1, inPlaceIntake.value)) {
    consistency.push({ key: 'ooipDirect', scope: 'intake', text: `The in-place volume was edited after it was taken from ${inPlaceIntake.app} (received ${inPlaceIntake.value}).` });
  }

  // values read from the Fluid table at a pressure the case no longer holds
  if (pvtIntake && pvtIntake.phase === phase) {
    for (const [k, at] of [['pi', pvtIntake.pi_psia], ['pa', pvtIntake.pa_psia]]) {
      const now = num(inputs?.corr?.[k]);
      const used = (pvtIntake.fields || []).some((f) => (k === 'pi' ? ['boi', 'muoi', 'muwi', 'zi', 'bgi'] : ['za']).includes(f));
      if (used && Number.isFinite(at) && Number.isFinite(now) && Math.abs(now - at) > 1e-6 * Math.max(1, at)) {
        consistency.push({ key: k, scope: 'intake', text: `The PVT values were read from the Fluid table at ${k} ${at} psia, and ${k} is now ${now} psia. Take the PVT again.` });
      }
    }
  }
  const flags = [...volFlags, ...(result.flags || []), ...consistency, ...(gasZ?.flags || [])];
  // RF-U2-002: RF x in-place through the canonical Monte Carlo, seeded (null when off)
  const uncertainty = rfUncertainty(inputs?.mc, { result, inPlace, inPlaceIntake, phase });
  return {
    gasZ,
    inputsUsed: inputs,
    uncertainty,
    phase,
    direct,
    parts,
    inPlace,
    result,
    flags,
    drives: DRIVE_MECHANISMS.filter((d) => d.phase === phase),
    sampleKeys: sampleKeysInUse(typed),
    isSample: typed?.origin === 'sample',
  };
}
