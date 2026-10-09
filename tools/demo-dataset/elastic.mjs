// Ekene demonstration dataset — elastic properties for QI (kit v3).
// ============================================================================
// v3 (2026-10-09) adds a shear sonic (DTS) to every well with a sonic. The
// compressional sonic is NOT changed: the Petrophysics series quotes it (sonic
// porosity on Ekene-9, the Oboro gas sand), so shear is derived around it.
//
// The rule, in the order Rock Physics Studio and QI Studio run it:
//   1. Brine-filled rock lies on the Ekene LOCAL shear trend (ELASTIC.trend),
//      a Greenberg-Castagna form whose sand line sits a few per cent above the
//      published one. Calibrating a local regression on a measured DTS is
//      therefore worth doing, and Greenberg-Castagna alone is measurably off.
//   2. Hydrocarbon-bearing rock is the fixed point of the engine's own
//      iterativeVs: taken to brine by Gassmann, it lands on that trend.
//   3. Fluids are Batzle-Wang at each reservoir's conditions, minerals are
//      quartz and clay mixed by Voigt-Reuss-Hill on Vsh, porosity is PHIT,
//      density is the RHOB truth. Every one of those is the engine's function,
//      so a presenter running the app with the inputs in the truth table gets
//      the truth table back.
// ============================================================================

import { brine, liveOil, gas, apiToRho0, woodMix } from '../../packages/engines/engines/rockphysics/fluids.js';
import { mixMinerals } from '../../packages/engines/engines/rockphysics/minerals.js';
import { iterativeVs } from '../../packages/engines/engines/rockphysics/vsEstimate.js';
import { LOCKED, OBORO, ELASTIC } from './spine.mjs';

const FT_PER_M = 3.280839895013123;
export const psiToMPa = (psi) => psi * 0.00689475729;
export const fToC = (f) => (f - 32) / 1.8;

/** Brine-filled shear trend, m/s: the GC composite on the Ekene lines. */
export function localBrineVs(vp, vsh) {
  const vpk = vp / 1000;
  const v = Math.min(1, Math.max(0, Number.isFinite(vsh) ? vsh : 0));
  const [s1, s0] = ELASTIC.trend.sand;
  const [h1, h0] = ELASTIC.trend.shale;
  const sand = (s1 * vpk + s0) * 1000;
  const shale = (h1 * vpk + h0) * 1000;
  if (v === 0) return sand;
  if (v === 1) return shale;
  if (!(sand > 0) || !(shale > 0)) return NaN;
  return 0.5 * ((1 - v) * sand + v * shale + 1 / ((1 - v) / sand + v / shale));
}

/**
 * Reservoir conditions and Batzle-Wang fluids, one set per reservoir. The
 * Ekene values are the LOCKED reservoir state (180 degF, 3200 psia at the
 * contact); Oboro is read at its gas-water contact from the Ekene-1 rows.
 */
export function reservoirFluids(ekene1Rows) {
  const ek = {
    tF: LOCKED.temp_f, pPsia: LOCKED.pi_psia,
    salinity: LOCKED.salinity_ppm / 1e6,
    api: LOCKED.api, gorScfStb: LOCKED.rsi_scf_stb, gasSg: LOCKED.gas_sg,
  };
  const gwc = ekene1Rows.reduce((best, r) => (r.layerKey === 'OBORO'
    && (!best || Math.abs(r.md - OBORO.gwc_m) < Math.abs(best.md - OBORO.gwc_m)) ? r : best), null);
  const ob = {
    tF: Math.round(gwc.tF * 10) / 10, pPsia: Math.round(gwc.ppPsi),
    salinity: LOCKED.salinity_ppm / 1e6, gasSg: OBORO.gas_gravity,
  };
  const at = (c) => ({ tC: fToC(c.tF), pMPa: psiToMPa(c.pPsia) });
  const e = at(ek);
  const o = at(ob);
  const gorLL = ek.gorScfStb * 0.1781076;  // scf/stb -> L/L (m3/m3)
  return {
    EKENE: {
      cond: { ...ek, gorLL },
      brine: brine(e.tC, e.pMPa, ek.salinity),
      hc: liveOil(e.tC, e.pMPa, apiToRho0(ek.api), gorLL, ek.gasSg),
      hcName: 'oil',
    },
    OBORO: {
      cond: ob,
      brine: brine(o.tC, o.pMPa, ob.salinity),
      hc: gas(o.tC, o.pMPa, ob.gasSg),
      hcName: 'gas',
    },
  };
}

export const mineralFor = (vsh) => mixMinerals([
  { name: 'quartz', frac: 1 - vsh }, { name: 'clay', frac: vsh },
]);

/** In-situ pore fluid {k, rho} for a row: brine and hydrocarbon mixed by Wood at Sw. */
export function insituFluid(fl, sw) {
  if (sw >= 1) return { k: fl.brine.k, rho: fl.brine.rho };
  return woodMix([{ k: fl.brine.k, rho: fl.brine.rho, sat: sw }, { k: fl.hc.k, rho: fl.hc.rho, sat: 1 - sw }]);
}

/**
 * Adds vs_m_s, dts (us/ft), vpBrine_m_s and the elastic attributes to every
 * row, in place. Rows outside a hydrocarbon column are on the trend exactly.
 */
export function addShear(rows, fluids) {
  for (const r of rows) {
    const vp = r.vp_m_s;
    const res = r.fluid !== 'brine' ? fluids[r.layerKey] : null;
    let vs;
    let vpBrine = vp;
    if (res) {
      const out = iterativeVs({
        vp, rho: r.rhob * 1000, phi: r.phit, kmin: mineralFor(r.vsh).k,
        fluidInSitu: insituFluid(res, r.sw), fluidBrine: { k: res.brine.k, rho: res.brine.rho },
        vsh: r.vsh, brineVs: localBrineVs,
      });
      if (!out.converged) throw new Error(`ASSERT shear did not converge at ${r.md} m`);
      vs = out.vs;
      vpBrine = out.vpBrine;
    } else {
      vs = localBrineVs(vp, r.vsh);
    }
    if (!(vs > 0 && vs < vp / Math.SQRT2)) throw new Error(`ASSERT unphysical Vs ${vs} at ${r.md} m (Vp ${vp})`);
    r.vs_m_s = vs;
    r.vpBrine_m_s = vpBrine;
    // the same rock with brine in the pores (shear modulus unchanged):
    // the seismic's fine structure is built from these (v3.2)
    if (res) {
      const fl = insituFluid(res, r.sw);
      r.rhoBrine = r.rhob * 1000 + r.phit * (res.brine.rho - fl.rho);
      r.vsBrine_m_s = vs * Math.sqrt((r.rhob * 1000) / r.rhoBrine);
    } else {
      r.rhoBrine = r.rhob * 1000;
      r.vsBrine_m_s = vs;
    }
    r.dts = 1e6 / (vs * FT_PER_M);
    r.ai = vp * r.rhob * 1000;          // kg/m2/s
    r.si = vs * r.rhob * 1000;
    r.vpvs = vp / vs;
  }
  return rows;
}
