// Pressure-dependent PVT for the VRR Monitor (V3): bridges the Suite's
// jest-goldened black-oil PVT kit (src/utils/nodal/pvt.js, built on Fluid
// Studio correlations) to the engine's per-period FVF override format.
// Correlations stay Suite-side by design — the engine
// (vrrLedger.interpolateFvfTrack) only ever sees resolved numbers.
//
// UNIT SEAM: pvtAt returns bg in rb/scf; the VRR core takes Bg in RB/Mscf,
// so bg is scaled x1000 here. This is the exact unit class the V1 wave
// fixed as a label bug in the WDS SurveillancePanel — keep it explicit.
import { buildFluidModel, pvtAt } from '@/utils/nodal/pvt';

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
    return {
      Bo: r.bo,             // RB/STB
      Bw: r.bw,             // RB/STB
      Bg: r.bg * 1000,      // rb/scf -> RB/Mscf (the unit seam)
      Rs: r.rs,             // scf/STB (clamped at the model GOR above Pb)
    };
  });

  return { overrides, warnings: model.warnings || [] };
}
