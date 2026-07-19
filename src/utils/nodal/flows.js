/**
 * In-situ volumetric flow decomposition for the Nodal Analysis Studio (NA1).
 *
 * Converts surface rates (stock-tank oil rate, water cut, produced GOR)
 * into the local superficial velocities and no-slip mixture properties the
 * multiphase correlations consume, using the black-oil PVT set at local
 * (p, T) from ./pvt.js pvtAt.
 *
 * Field units: qo stb/d, area ft2, velocities ft/s, densities lbm/ft3,
 * viscosities cp, surface tension dyn/cm.
 */

const SEC_PER_DAY = 86400;
const FT3_PER_BBL = 5.614583;

/** Flow area (ft2) of a circular pipe with inner diameter in inches. */
export const pipeArea = (idIn) => {
  const dFt = idIn / 12;
  return (Math.PI / 4) * dFt * dFt;
};

/**
 * In-situ rates and no-slip mixture properties.
 * inputs: { qo (stb/d), wct (fraction 0..1), gor (scf/stb), pvt, areaFt2 }
 * Water cut is on the surface liquid stream: ql = qo / (1 - wct).
 * Free gas at local p = qo (gor - rs), floored at zero above Pb.
 */
export const inSituRates = ({ qo, wct = 0, gor, pvt, areaFt2 }) => {
  const wc = Math.min(Math.max(wct, 0), 0.999);
  const qw = wc > 0 ? (qo * wc) / (1 - wc) : 0; // stb/d water

  // Liquid: oil swells by Bo, water by Bw (rb/d -> ft3/s through area)
  const qoIs = (qo * pvt.bo * FT3_PER_BBL) / SEC_PER_DAY; // ft3/s
  const qwIs = (qw * pvt.bw * FT3_PER_BBL) / SEC_PER_DAY;
  const qlIs = qoIs + qwIs;

  // Free gas: (GOR - Rs) scf/stb of oil, Bg rb/scf
  const freeGasScfd = Math.max(0, qo * (gor - pvt.rs));
  const qgIs = (freeGasScfd * pvt.bg * FT3_PER_BBL) / SEC_PER_DAY;

  const vsl = qlIs / areaFt2;
  const vsg = qgIs / areaFt2;
  const vm = vsl + vsg;
  const lambdaL = vm > 0 ? vsl / vm : 1;

  // Volume-weighted liquid properties at in-situ conditions.
  const fo = qlIs > 0 ? qoIs / qlIs : 1;
  const fw = 1 - fo;
  const rhoL = fo * pvt.rhoO + fw * pvt.rhoW;
  const muL = fo * pvt.muO + fw * pvt.muW;
  const sigmaL = fo * pvt.sigmaOG + fw * pvt.sigmaWG;

  const rhoNs = rhoL * lambdaL + pvt.rhoG * (1 - lambdaL);
  const muNs = muL * lambdaL + pvt.muG * (1 - lambdaL);

  return {
    qw,
    freeGasScfd,
    vsl,
    vsg,
    vm,
    lambdaL,
    rhoL,
    muL,
    sigmaL,
    rhoNs,
    muNs,
    fo,
    fw,
  };
};
