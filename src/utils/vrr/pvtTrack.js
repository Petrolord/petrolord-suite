// Pressure-dependent PVT for the VRR Monitor (V3): bridges the Suite's
// jest-goldened black-oil PVT kit (src/utils/nodal/pvt.js, built on Fluid
// Studio correlations) to the engine's per-period FVF override format.
// Correlations stay Suite-side by design — the engine
// (vrrLedger.interpolateFvfTrack) only ever sees resolved numbers.
//
// UNIT SEAM: pvtAt returns bg in rb/scf; the VRR core takes Bg in RB/Mscf,
// so bg is scaled x1000 here. This is the exact unit class the V1 wave
// fixed as a label bug in the WDS SurveillancePanel — keep it explicit.
//
// VRR-U2-018: Z is Dranchuk-Abou-Kassem (1975) with Sutton pseudo-criticals
// from the canonical engines (engines/fluid/blackOil gasZDetail, gated there
// on readings of the Standing-Katz chart), the default of Fluid Systems
// Studio since FLUID-U2-006. The nodal route underneath still computes Z by
// Papay for its own use; only Bg here takes the engine Z.
import { buildFluidModel, pvtAt } from '@/utils/nodal/pvt';
import { gasZDetail } from '../../../packages/engines/engines/fluid/blackOil';

/** Gas FVF in rb/scf: 0.00504 Z T[degR] / p, T + 460 as the nodal route writes it. */
const bgRbScf = (p, tF, z) => (p > 0 ? (0.00504 * z * (tF + 460)) / p : 0);

const num = (v, d) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

/**
 * Derive per-period {Bo, Bw, Bg, Rs} overrides from a fluid description
 * and an array of period pressures (psia; null entries pass through).
 * fluid: { api, gasSg, gor, salinityPpm, tempF } (strings fine).
 * Returns { overrides, warnings } — overrides[i] is null where pressure
 * is null, so unpressured periods keep the global FVF set.
 */
export function derivePeriodFvf(fluid, pressures) {
  const model = buildFluidModel({
    api: num(fluid?.api, 35),
    gasSg: num(fluid?.gasSg, 0.7),
    gor: num(fluid?.gor, 500),
    salinityPpm: num(fluid?.salinityPpm, 30000),
  });
  const tF = num(fluid?.tempF, 180);

  const overrides = (pressures || []).map((pRaw) => {
    const p = parseFloat(pRaw);
    if (!Number.isFinite(p) || p <= 0) return null;
    const r = pvtAt(model, p, tF);
    const z = gasZDetail(p, tF, model.gasSg, 'dranchuk_abou_kassem').z;
    return {
      Bo: r.bo,             // RB/STB
      Bw: r.bw,             // RB/STB
      Bg: bgRbScf(p, tF, z) * 1000, // rb/scf -> RB/Mscf (the unit seam), Z by Dranchuk-Abou-Kassem
      Rs: r.rs,             // scf/STB (clamped at the model GOR above Pb)
      Z: z,
    };
  });

  return { overrides, warnings: model.warnings || [] };
}
