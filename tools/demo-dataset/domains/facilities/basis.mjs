// Ekene Alpha facilities design basis (Wave D8, episodes 30 to 33).
//
// Three kinds of value live here, and every one is tagged with which it is:
//   spine     LOCKED field values from ../../spine.mjs (the Academy's Ekene)
//   d8spine   FACILITY_DESIGN from ../../d8spine.mjs, BINDING: the process
//             safety domain takes its release conditions from the same basis
//   designed  new here, each with a one-line reason, and each derived from
//             the two above through a published correlation where one exists
//
// Nothing in this file may change a spine or d8spine value. The gas
// composition is designed to reproduce the LOCKED gas gravity, and that is
// asserted below rather than hoped for.

import { LOCKED, FRAME, PLATFORM } from '../../spine.mjs';
import { FACILITY_DESIGN } from '../../d8spine.mjs';
import {
  standingRs, bealDeadOilViscosity, beggsRobinsonLiveOilViscosity,
} from '../../../../packages/engines/engines/fluid/blackOil.ts';
import {
  waterViscosityPaS, waterDensityKgM3, oilDensityKgM3,
} from '../../../../packages/engines/engines/facilities/producedWater.js';
import { gasDensityLbFt3 } from '../../../../packages/engines/engines/facilities/separatorSizing.js';

export const FD = FACILITY_DESIGN;
export const AIR_MW = 28.9647;
export const M_PER_FT = 0.3048;
export const LB_FT3_PER_KG_M3 = 1 / 16.0185;   // the Corrosion studio's own factor
export const SG_WATER_LB_FT3 = 62.4;           // the Separator studio multiplies SG by this

const round = (v, d) => Number(v.toFixed(d));

/**
 * Separator gas, mol percent. Designed: a lean associated gas with 2.5
 * percent CO2 and 20 ppmv H2S, so the corrosion episode has a CO2 case that is
 * sweet by the H2S screen. C6+ is lumped as n-hexane and closes the sum.
 */
export const MOLAR_MASS = {
  N2: 28.0134, CO2: 44.0095, H2S: 34.081, C1: 16.0425, C2: 30.069, C3: 44.0956,
  iC4: 58.1222, nC4: 58.1222, iC5: 72.1488, nC5: 72.1488, 'C6+': 86.1754,
};
const GAS_NO_C6 = {
  N2: 0.6, CO2: 2.5, H2S: 0.002, C1: 78.1, C2: 9.0, C3: 5.4,
  iC4: 1.3, nC4: 1.6, iC5: 0.5, nC5: 0.45,
};
export const GAS_COMPOSITION = {
  ...GAS_NO_C6,
  'C6+': round(100 - Object.values(GAS_NO_C6).reduce((a, b) => a + b, 0), 3),
};

export function gasMolarMass(comp = GAS_COMPOSITION) {
  return Object.entries(comp).reduce((s, [k, pct]) => s + (pct / 100) * MOLAR_MASS[k], 0);
}

/** Everything the four episodes type, derived once. */
export function designValues({ assertClose }) {
  const sumPct = Object.values(GAS_COMPOSITION).reduce((a, b) => a + b, 0);
  assertClose('facilities gas composition sums to 100 mol percent', sumPct, 100, 1e-9);
  const mw = gasMolarMass();
  const sgFromComp = mw / AIR_MW;
  // The brief: the composition's molecular weight gives the LOCKED SG 0.75
  // within 1 percent. It is designed to 0.1 percent.
  assertClose('facilities gas composition gives the locked gas gravity (1 percent)',
    sgFromComp, LOCKED.gas_sg, 0.01 * LOCKED.gas_sg);

  const pSepPsia = FD.separator_pressure_psig + 14.7;
  const tSepF = FD.separator_temperature_f;
  const tSepC = (tSepF - 32) / 1.8;

  // Oil at the separator: Standing's solution gas left in the oil at 150
  // psig and 140 degF, then Beal dead oil and Beggs and Robinson live oil.
  const rsSep = standingRs(pSepPsia, LOCKED.pb_psia, LOCKED.gas_sg, LOCKED.api, tSepF);
  const muDeadSep = bealDeadOilViscosity(LOCKED.api, tSepF);
  const muOilSep = beggsRobinsonLiveOilViscosity(rsSep, muDeadSep);
  // Export crude: stabilised (dead) oil that has cooled to the seabed.
  const muExport = bealDeadOilViscosity(LOCKED.api, FRAME.seabed_temp_f);

  // Produced water at the separator: the Produced Water engine's own brine
  // properties at 140 degF and the LOCKED 35,000 ppm, so the three
  // applications that see this water all see the same water.
  const water = {
    muPaS: waterViscosityPaS({ tC: tSepC, tdsPpm: LOCKED.salinity_ppm }).muPaS,
    rhoKgM3: waterDensityKgM3({ tC: tSepC, tdsPpm: LOCKED.salinity_ppm }).rhoKgM3,
  };
  const oilRhoSepKgM3 = oilDensityKgM3({ apiGravity: LOCKED.api, tC: tSepC }).rhoKgM3;
  const gasAtSep = gasDensityLbFt3({ pPsia: pSepPsia, tF: tSepF, gasSg: LOCKED.gas_sg });

  // Overboard spec: 30 mg/l, written as ppm by mass against this brine.
  const specMgL = 30;
  const specPpm = specMgL / (water.rhoKgM3 / 1000);

  // GOR check: d8spine says 0.45 MMscfd is GOR 400 on 1000 bopd plus 12.5 percent.
  assertClose('facilities design gas is the locked GOR on the design oil plus 12.5 percent',
    FD.gas_mmscfd, (LOCKED.rsi_scf_stb * FD.oil_bopd * 1.125) / 1e6, 1e-9);

  // Export line: 18 km from the Ekene Alpha deck to the shore terminal.
  // Designed profile in metres (deck +20 m, seabed -35 m, terminal +5 m).
  const deckM = 20;
  const landfallM = 5;
  const lineM = FD.export_line_length_km * 1000;
  const riserM = deckM + FRAME.water_depth_m;           // vertical riser, 55 m
  const landfallRunM = 245;
  const seabedRunM = lineM - riserM - landfallRunM;
  const profileM = [
    { name: 'riser, deck to seabed', lengthM: riserM, elevM: -riserM },
    { name: 'seabed run to the shore approach', lengthM: seabedRunM, elevM: FRAME.water_depth_m - 2 },
    { name: 'landfall to the terminal', lengthM: landfallRunM, elevM: landfallM + 2 },
  ];
  const netElevM = profileM.reduce((s, p) => s + p.elevM, 0);
  assertClose('facilities export line profile sums to the d8spine length', profileM.reduce((s, p) => s + p.lengthM, 0), lineM, 1e-9);
  assertClose('facilities export line rises from deck to terminal as designed', netElevM, landfallM - deckM, 1e-9);

  return {
    mw, sgFromComp, pSepPsia, tSepF, tSepC,
    rsSep, muDeadSep, muOilSep, muExport, water, oilRhoSepKgM3, gasAtSep,
    specMgL, specPpm,
    exportLine: { deckM, landfallM, lineM, profileM, netElevM },
    platform: PLATFORM.name,
  };
}

/** The design-basis table: group,item,value,unit,source,note. */
export function designBasisRows(V, fx) {
  const comp = Object.entries(GAS_COMPOSITION).map(([k, v]) => [
    'gas composition', `${k}`, String(v), 'mol %', 'designed',
    k === 'CO2' ? 'a few percent CO2 is common in associated gas; it is what makes Episode 33 a CO2 corrosion case'
      : k === 'H2S' ? '20 ppmv: measurable, and below the sour screening threshold at separator pressure'
        : k === 'C6+' ? 'lumped as n-hexane; closes the composition to 100 percent'
          : 'lean associated gas; tuned so the molar mass gives the field gas gravity',
  ]);
  const Vw = V.water;
  return [
    ['field', 'platform', V.platform, '', 'spine', 'PLATFORM'],
    ['field', 'water depth', String(FRAME.water_depth_m), 'm', 'spine', 'FRAME.water_depth_m'],
    ['field', 'seabed temperature', String(FRAME.seabed_temp_f), 'degF', 'spine', 'FRAME.seabed_temp_f; the export line cools to it'],
    ['fluid', 'oil gravity', String(LOCKED.api), 'API', 'spine', 'LOCKED.api'],
    ['fluid', 'gas gravity', String(LOCKED.gas_sg), 'air = 1', 'spine', 'LOCKED.gas_sg'],
    ['fluid', 'solution GOR', String(LOCKED.rsi_scf_stb), 'scf/stb', 'spine', 'LOCKED.rsi_scf_stb'],
    ['fluid', 'bubble point', String(LOCKED.pb_psia), 'psia', 'spine', 'LOCKED.pb_psia'],
    ['fluid', 'water formation volume factor', String(LOCKED.bw_rb_stb), 'rb/stb', 'spine', 'LOCKED.bw_rb_stb'],
    ['fluid', 'brine salinity', String(LOCKED.salinity_ppm), 'ppm', 'spine', 'LOCKED.salinity_ppm'],
    ['fluid', 'reservoir temperature', String(LOCKED.temp_f), 'degF', 'spine', 'LOCKED.temp_f'],
    ['rates', 'oil', String(FD.oil_bopd), 'bopd', 'd8spine', 'FACILITY_DESIGN.oil_bopd'],
    ['rates', 'produced water', String(FD.water_bwpd), 'bwpd', 'd8spine', 'FACILITY_DESIGN.water_bwpd'],
    ['rates', 'gas', String(FD.gas_mmscfd), 'MMscfd', 'd8spine', 'GOR 400 scf/stb on 1000 bopd plus 12.5 percent (asserted)'],
    ['rates', 'water injection', String(FD.water_injection_bwpd), 'bwpd', 'd8spine', 'FACILITY_DESIGN.water_injection_bwpd'],
    ['separator', 'operating pressure', String(FD.separator_pressure_psig), 'psig', 'd8spine', 'FACILITY_DESIGN.separator_pressure_psig'],
    ['separator', 'operating temperature', String(FD.separator_temperature_f), 'degF', 'd8spine', 'FACILITY_DESIGN.separator_temperature_f'],
    ...comp,
    ['gas composition', 'molar mass', fx(V.mw, 3), 'g/mol', 'designed', 'computed from the composition above'],
    ['gas composition', 'gas gravity from the composition', fx(V.sgFromComp, 4), 'air = 1', 'designed', `molar mass over ${AIR_MW}; asserted within 1 percent of the locked 0.75`],
    ['gas composition', 'z at the separator', fx(V.gasAtSep.z, 4), '', 'designed', 'Dranchuk and Abou-Kassem through the Separator engine at 150 psig and 140 degF'],
    ['separator oil', 'solution gas left in the oil', fx(V.rsSep, 1), 'scf/stb', 'designed', 'Standing at 164.7 psia and 140 degF'],
    ['separator oil', 'dead oil viscosity at 140 degF', fx(V.muDeadSep, 2), 'cp', 'designed', 'Beal'],
    ['separator oil', 'live oil viscosity at the separator', fx(V.muOilSep, 2), 'cp', 'designed', 'Beggs and Robinson on the Beal dead oil'],
    ['separator oil', 'oil density at 140 degF', fx(V.oilRhoSepKgM3, 1), 'kg/m3', 'designed', 'Produced Water engine, 32 API'],
    ['produced water', 'brine density at 140 degF', fx(Vw.rhoKgM3, 1), 'kg/m3', 'designed', 'Produced Water engine at 35,000 ppm; the Separator and Corrosion sheets use the same value'],
    ['produced water', 'brine viscosity at 140 degF', fx(Vw.muPaS * 1000, 3), 'cp', 'designed', 'Produced Water engine at 35,000 ppm'],
    ['produced water', 'oil in water leaving the separator', '1000', 'ppm', 'designed', 'a typical three-phase separator water outlet; the vessel removes oil drops of 200 um and up, not the fine tail'],
    ['produced water', 'droplet d50 after the level control valve', '25', 'um', 'designed', 'shear through the valve; the most important number in Episode 32'],
    ['produced water', 'droplet distribution sigma', '0.7', '', 'designed', 'the middle of the customary 0.6 to 0.9'],
    ['produced water', 'overboard limit', String(V.specMgL), 'mg/l', 'designed', 'the OSPAR monthly average, taken as this fictional block\'s permit'],
    ['produced water', 'overboard limit as ppm by mass', fx(V.specPpm, 2), 'ppm', 'designed', '30 mg/l divided by the brine density in kg/l'],
    ['export line', 'length', String(FD.export_line_length_km), 'km', 'd8spine', 'FACILITY_DESIGN.export_line_length_km'],
    ...V.exportLine.profileM.map((p, i) => ['export line', `profile segment ${i + 1}: ${p.name}`, `${p.lengthM} m long, ${p.elevM > 0 ? '+' : ''}${p.elevM} m`, 'm', 'designed',
      i === 0 ? 'deck at +20 m to the 35 m seabed' : i === 1 ? 'gentle rise across the shelf to 2 m below sea level' : 'shore crossing to the terminal at +5 m']),
    ['export line', 'net elevation change', String(V.exportLine.netElevM), 'm', 'designed', 'deck +20 m to terminal +5 m'],
    ['export line', 'pipe', '4 in schedule 80 (4.5 in OD, 0.337 in wall, 3.826 in bore)', '', 'designed', 'headroom for Ekene-11 and later tie-ins; heavy wall for on-bottom stability'],
    ['export line', 'line pipe grade', 'API 5L X52 (SMYS 52,000 psi)', '', 'designed', 'the common grade for small-bore line pipe'],
    ['export line', 'design pressure', '1440', 'psig', 'designed', 'the usual Class 600 pipeline design pressure'],
    ['export line', 'export pump discharge', '100', 'psig', 'designed', 'enough to reach the terminal tank with margin; Episode 31 shows how little the line needs'],
    ['export line', 'corrosion allowance', '0.118', 'in', 'designed', '3 mm, customary for carbon steel in stabilised crude service'],
    ['export line', 'export crude viscosity', fx(V.muExport, 2), 'cp', 'designed', 'Beal dead oil at the 77 degF seabed'],
    ['produced water line', 'pipe', '3 in schedule 40 (3.068 in bore)', '', 'designed', 'separator water outlet to the treatment train'],
    ['produced water line', 'corrosion inhibitor', '90 percent efficiency, 95 percent availability', '', 'designed', 'a continuous injection package'],
    ['produced water line', 'corrosion allowance', '0.118', 'in', 'designed', '3 mm, the same carbon steel allowance as the export line'],
    ['produced water line', 'design life', '25', 'years', 'designed', 'the field life with Ekene-11 and the flood'],
    ['produced water line', 'in-situ pH', '4.5', '', 'designed', 'CO2-saturated brine with little bicarbonate buffering; a low, conservative value (the brine chemistry is not in the kit)'],
  ];
}

/**
 * The stream table: stream,description,phase,rate,unit,pressure_psig,temperature_degF,source.
 * Rates are the d8spine design values; conditions are the separator's.
 */
export function streamRows(V) {
  return [
    ['S1', 'separator inlet: production header', 'oil', FD.oil_bopd, 'bopd', FD.separator_pressure_psig, FD.separator_temperature_f, 'd8spine'],
    ['S1', 'separator inlet: production header', 'water', FD.water_bwpd, 'bwpd', FD.separator_pressure_psig, FD.separator_temperature_f, 'd8spine'],
    ['S1', 'separator inlet: production header', 'gas', FD.gas_mmscfd, 'MMscfd', FD.separator_pressure_psig, FD.separator_temperature_f, 'd8spine'],
    ['S2', 'separator gas outlet to fuel and flare', 'gas', FD.gas_mmscfd, 'MMscfd', FD.separator_pressure_psig, FD.separator_temperature_f, 'd8spine'],
    ['S3', 'separator oil outlet to the export pump', 'oil', FD.oil_bopd, 'bopd', FD.separator_pressure_psig, FD.separator_temperature_f, 'd8spine'],
    ['S4', 'export line inlet (pump discharge)', 'oil', FD.oil_bopd, 'bopd', 100, FD.separator_temperature_f, `d8spine rate; designed pressure; cools to the ${FRAME.seabed_temp_f} degF seabed along the line`],
    ['S5', 'separator water outlet to treatment', 'water', FD.water_bwpd, 'bwpd', FD.separator_pressure_psig, FD.separator_temperature_f, 'd8spine'],
    ['S6', 'treated water overboard', 'water', FD.water_bwpd, 'bwpd', '', FD.separator_temperature_f, `d8spine; ${V.specMgL} mg/l oil in water limit`],
    ['S7', 'water injection to Ekene-2 and Ekene-4', 'water', FD.water_injection_bwpd, 'bwpd', '', '', 'd8spine'],
  ];
}
