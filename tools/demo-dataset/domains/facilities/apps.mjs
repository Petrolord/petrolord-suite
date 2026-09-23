// The four Facilities input sheets (episodes 30 to 33), how each sheet row
// lands in its application, and the application's arithmetic replayed on
// the engines.
//
// A sheet row is [section, field, value, unit, source]. `field` is the label
// the application shows, and `section` is where on screen it sits. MAP says
// which input-state key each (section, field) is in the app's own context
// (src/contexts/*Context.jsx), and `options` turns a dropdown's visible text
// into the value the context stores.
//
// `evaluate*` below repeat, line for line, the useMemo derivations in those
// contexts (the unit conversions, the defaults, the selection rule) and call
// the vendored engines the contexts call. The generator quotes these numbers
// in the episode notes; the gate (__tests__/domain.facilities.test.js)
// drives the real context providers with the same rows and checks they give
// the same numbers, so a drift in either place fails.

import { LOCKED } from '../../spine.mjs';
import { FD, SG_WATER_LB_FT3, LB_FT3_PER_KG_M3 } from './basis.mjs';
import {
  gasDensityLbFt3, oilDensityLbFt3, oilDensityAtTLbFt3, kValue, terminalVelocityFtS, gasActualFt3S, ldSweep, K_BASE,
} from '../../../../packages/engines/engines/facilities/separatorSizing.js';
import {
  liquidLineDrop, liquidLineTraverse, requiredWallIn, maopPsig,
} from '../../../../packages/engines/engines/facilities/lineHydraulics.js';
import { scheduleRow, roughnessOf, ROUGHNESS_IN } from '../../../../packages/engines/engines/production/pipeSchedule.js';
import {
  waterViscosityPaS, waterDensityKgM3, oilDensityKgM3, hydrocyclone, mediaFilter, flotation,
  apiSeparator, plateInterceptor, treatmentTrain,
} from '../../../../packages/engines/engines/facilities/producedWater.js';
import { screen } from '../../../../packages/engines/engines/facilities/corrosion.js';

const FT_PER_M = 3.280839895013123;
const s = (v) => String(v);
const fx = (v, d) => v.toFixed(d);

// ---------------------------------------------------------------- 30 ------

export const SEPARATOR = {
  n: 30,
  app: 'Separator & Slug Catcher Studio',
  slug: 'separator-slug-catcher-designer',
  context: 'src/contexts/SeparatorStudioContext.jsx',
  components: ['src/components/separatorstudio/SeparatorPanels.jsx'],
  MAP: {
    'Vessel and process|Vessel type': { s: 'vessel', k: 'type', options: { 'Horizontal, three phase': 'horizontal3', 'Horizontal, two phase': 'horizontal2', 'Vertical, two phase': 'vertical2' } },
    'Vessel and process|Mist extractor': { s: 'vessel', k: 'internalsId', optionsFromEngine: true, options: Object.fromEntries(K_BASE.map((k) => [`${k.label} (K = ${k.k})`, k.id])) },
    'Vessel and process|K override (ft/s)': { s: 'vessel', k: 'kOverride' },
    'Vessel and process|Liquid level (fraction of diameter)': { s: 'vessel', k: 'liquidLevelFrac' },
    'Vessel and process|Candidate diameters (ft)': { s: 'vessel', k: 'diametersFt' },
    'Vessel and process|L/D minimum': { s: 'vessel', k: 'ldMin' },
    'Vessel and process|L/D maximum': { s: 'vessel', k: 'ldMax' },
    'Process|Gas (MMscfd)': { s: 'process', k: 'qGasMMscfd' },
    'Process|Pressure (psig)': { s: 'process', k: 'pPsig' },
    'Process|Temperature (F)': { s: 'process', k: 'tF' },
    'Process|Gas gravity': { s: 'process', k: 'gasSg' },
    'Process|Oil (bpd)': { s: 'process', k: 'qOilBpd' },
    'Process|Water (bpd)': { s: 'process', k: 'qWaterBpd' },
    'Process|Oil gravity (API)': { s: 'process', k: 'oilApi' },
    'Process|Water SG': { s: 'process', k: 'waterSg' },
    'Process|Oil retention (min)': { s: 'process', k: 'oilRetentionMin' },
    'Process|Water retention (min)': { s: 'process', k: 'waterRetentionMin' },
    'Process|Oil visc (cp)': { s: 'process', k: 'muOilCp' },
    'Process|Water visc': { s: 'process', k: 'muWaterCp' },
    'Process|Water droplet in oil (um)': { s: 'process', k: 'waterDropletMicron' },
    'Process|Oil droplet in water (um)': { s: 'process', k: 'oilDropletMicron' },
  },
  rows(V) {
    const waterSg = V.water.rhoKgM3 * LB_FT3_PER_KG_M3 / SG_WATER_LB_FT3;
    return [
      ['Vessel and process', 'Vessel type', 'Horizontal, three phase', '', 'designed: oil, water and gas leave separately'],
      ['Vessel and process', 'Mist extractor', 'Horizontal, wire mesh pad (K = 0.45)', '', 'designed: the usual mesh pad'],
      ['Vessel and process', 'K override (ft/s)', '', 'ft/s', 'leave blank: the studio derates the mesh pad K for pressure'],
      ['Vessel and process', 'Liquid level (fraction of diameter)', '0.5', '', 'designed: half full, the customary level'],
      ['Vessel and process', 'Candidate diameters (ft)', '2.5, 3, 3.5, 4, 4.5, 5, 6', 'ft', 'designed: a fine family so the selection is visible'],
      ['Vessel and process', 'L/D minimum', '3', '', 'the studio default for a horizontal vessel'],
      ['Vessel and process', 'L/D maximum', '5', '', 'the studio default for a horizontal vessel'],
      ['Process', 'Gas (MMscfd)', s(FD.gas_mmscfd), 'MMscfd', 'd8spine FACILITY_DESIGN.gas_mmscfd'],
      ['Process', 'Pressure (psig)', s(FD.separator_pressure_psig), 'psig', 'd8spine FACILITY_DESIGN.separator_pressure_psig'],
      ['Process', 'Temperature (F)', s(FD.separator_temperature_f), 'degF', 'd8spine FACILITY_DESIGN.separator_temperature_f'],
      ['Process', 'Gas gravity', s(LOCKED.gas_sg), 'air = 1', 'spine LOCKED.gas_sg (the gas composition in the design basis gives it)'],
      ['Process', 'Oil (bpd)', s(FD.oil_bopd), 'bpd', 'd8spine FACILITY_DESIGN.oil_bopd'],
      ['Process', 'Water (bpd)', s(FD.water_bwpd), 'bpd', 'd8spine FACILITY_DESIGN.water_bwpd'],
      ['Process', 'Oil gravity (API)', s(LOCKED.api), 'API', 'spine LOCKED.api'],
      ['Process', 'Water SG', fx(waterSg, 3), '', `designed: the 35,000 ppm brine at 140 degF (${fx(V.water.rhoKgM3, 1)} kg/m3) over 62.4 lb/ft3`],
      ['Process', 'Oil retention (min)', '5', 'min', 'designed: a generous retention for a 32 API crude'],
      ['Process', 'Water retention (min)', '5', 'min', 'designed: matched to the oil'],
      ['Process', 'Oil visc (cp)', fx(V.muOilSep, 2), 'cp', 'designed: Beggs and Robinson live oil at the separator (design basis)'],
      ['Process', 'Water visc', fx(V.water.muPaS * 1000, 2), 'cp', 'designed: the brine at 140 degF (design basis)'],
      ['Process', 'Water droplet in oil (um)', '500', 'um', 'designed: the customary water drop to remove from the oil'],
      ['Process', 'Oil droplet in water (um)', '200', 'um', 'designed: the customary oil drop to remove from the water'],
    ];
  },
};

const num = (v, fallback = NaN) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : fallback;
};
const isBlank = (v) => !Number.isFinite(parseFloat(v));
const parseDiameters = (text) => String(text).split(/[,\s]+/).map((t) => parseFloat(t)).filter((x) => Number.isFinite(x) && x > 0);

/** SeparatorStudioContext: conditions -> sweep -> selectVessel. */
export function evaluateSeparator(inp) {
  const p = inp.process;
  const v = inp.vessel;
  const pPsia = num(p.pPsig) + 14.7;
  const gas = gasDensityLbFt3({ pPsia, tF: num(p.tF), gasSg: num(p.gasSg) });
  if (gas.error) return gas;
  // the Separator Studio takes the oil at the separator temperature (engines #246)
  const rhoOil = oilDensityAtTLbFt3({ apiGravity: num(p.oilApi), tF: num(p.tF) }).rhoLbFt3;
  const qWater = num(p.qWaterBpd);
  const rhoWater = qWater > 0 || v.type === 'horizontal3' ? num(p.waterSg) * 62.4 : NaN;
  const qOil = num(p.qOilBpd);
  const qLiquid = qOil + qWater;
  const rhoLiquid = qLiquid > 0 ? (rhoOil * qOil + (qWater > 0 ? rhoWater * qWater : 0)) / qLiquid : rhoOil;
  const k = kValue({ internalsId: v.internalsId, pPsig: num(p.pPsig), kOverride: isBlank(v.kOverride) ? undefined : num(v.kOverride) });
  if (k.error) return k;
  const vt = terminalVelocityFtS({ k: k.k, rhoLLbFt3: rhoLiquid, rhoGLbFt3: gas.rhoLbFt3 });
  if (vt.error) return vt;
  const qGasActFt3S = gasActualFt3S({ qGasMMscfd: num(p.qGasMMscfd), pPsia, tF: num(p.tF), z: gas.z });
  if (v.type !== 'horizontal3') return { error: 'the Ekene sheet is a three-phase vessel' };
  const sweep = ldSweep({
    diametersFt: parseDiameters(v.diametersFt), ldMin: num(v.ldMin), ldMax: num(v.ldMax),
    qGasActFt3S, vTerminalFtS: vt.vFtS, liquidLevelFrac: num(v.liquidLevelFrac),
    mode: 'horizontal3', qOilBpd: qOil, qWaterBpd: qWater,
    oilRetentionMin: num(p.oilRetentionMin), waterRetentionMin: num(p.waterRetentionMin),
    sgOil: rhoOil / 62.4, sgWater: num(p.waterSg), muOilCp: num(p.muOilCp), muWaterCp: num(p.muWaterCp),
    waterDropletMicron: num(p.waterDropletMicron), oilDropletMicron: num(p.oilDropletMicron),
  });
  if (!sweep.preferred) return { error: `no vessel selected (${sweep.preferredStatus})`, sweep };
  const sel = sweep.preferred;
  return {
    z: gas.z, k: k.k, rhoGas: gas.rhoLbFt3, rhoLiquid, vTerminalFtS: vt.vFtS, qGasActFt3S,
    diameterFt: sel.diameterFt, lengthFt: sel.lengthFt, ldRatio: sel.ldRatio,
    controlling: sel.result.controlling, lengthGasFt: sel.result.lengthGasFt,
    liquidRetentionLengthFt: sel.result.liquidRetentionLengthFt,
    gasVelocityFtS: sel.result.gasVelocityFtS,
    interfaceHeightFt: sel.result.interfaceHeightFt,
    waterDropFallS: sel.result.dropChecks.waterDropFallS,
    oilDropRiseS: sel.result.dropChecks.oilDropRiseS,
    residenceOilS: sel.result.dropChecks.residenceOilS,
    sweep,
  };
}

// ---------------------------------------------------------------- 31 ------

export const LINE = {
  n: 31,
  app: 'Pipeline & Line Sizing Studio',
  slug: 'facility-network-hydraulics',
  context: 'src/contexts/LineSizingContext.jsx',
  components: [
    'src/components/linesizing/FluidPanel.jsx', 'src/components/linesizing/PipePanel.jsx',
    'src/components/linesizing/ProfilePanel.jsx', 'src/components/linesizing/WallPanel.jsx',
  ],
  MAP: {
    'Fluid and duty|Line service': { mode: true, options: { 'Liquid (single phase)': 'liquid', 'Gas (single phase)': 'gas', 'Multiphase (Beggs & Brill)': 'multiphase' } },
    'Fluid and duty|Liquid rate (bpd)': { s: 'liquid', k: 'qBpd' },
    'Fluid and duty|Density from': { s: 'liquid', k: 'rhoMode', options: { 'API gravity': 'api', 'Density directly': 'direct' } },
    'Fluid and duty|Oil gravity (API)': { s: 'liquid', k: 'oilApi' },
    'Fluid and duty|Viscosity (cp)': { s: 'liquid', k: 'muCp' },
    'Fluid and duty|Velocity limit (ft/s)': { s: 'liquid', k: 'maxVFtS' },
    'Pipe|Pipe source': { s: 'pipe', k: 'source', options: { 'From the checked schedule table': 'schedule', 'Type the bore directly': 'custom' } },
    'Pipe|NPS (in)': { s: 'pipe', k: 'nps' },
    'Pipe|Schedule': { s: 'pipe', k: 'schedule' },
    'Pipe|Roughness': { s: 'pipe', k: 'roughnessId', optionsFromEngine: true, options: Object.fromEntries(ROUGHNESS_IN.map((r) => [`${r.label} (${r.roughnessIn} in)`, r.id])) },
    'Pipe|Custom roughness (in)': { s: 'pipe', k: 'customRoughIn' },
    'Pipe|Length (ft)': { s: 'pipe', k: 'lengthFt' },
    'Pipe|Elevation change (ft)': { s: 'pipe', k: 'elevChangeFt' },
    'Elevation profile|Inlet pressure (psia)': { s: 'profile', k: 'p1Psia' },
    'Elevation profile, segment 1|Length (ft)': { seg: 0, k: 'lengthFt' },
    'Elevation profile, segment 1|Elevation change (ft)': { seg: 0, k: 'elevChangeFt' },
    'Elevation profile, segment 2|Length (ft)': { seg: 1, k: 'lengthFt' },
    'Elevation profile, segment 2|Elevation change (ft)': { seg: 1, k: 'elevChangeFt' },
    'Elevation profile, segment 3|Length (ft)': { seg: 2, k: 'lengthFt' },
    'Elevation profile, segment 3|Elevation change (ft)': { seg: 2, k: 'elevChangeFt' },
    'Line pipe|Outside diameter (in)': { s: 'wall', k: 'odIn' },
    'Line pipe|Design pressure (psig)': { s: 'wall', k: 'designPsig' },
    'Line pipe|SMYS (psi)': { s: 'wall', k: 'smysPsi' },
    'Line pipe|Design code': { s: 'wall', k: 'code', options: { 'B31.4 (liquid lines, F = 0.72)': 'B31.4', 'B31.8 (gas lines, location classes)': 'B31.8' } },
    'Line pipe|Joint factor E': { s: 'wall', k: 'jointFactor' },
    'Line pipe|Temp derate T': { s: 'wall', k: 'tempDerate' },
    'Line pipe|Corrosion allowance (in)': { s: 'wall', k: 'corrosionAllowanceIn' },
    'Line pipe|Actual wall (in)': { s: 'wall', k: 'actualWallIn' },
  },
  rows(V) {
    const L = V.exportLine;
    const ft = (m) => fx(m * FT_PER_M, 1);
    const seg = L.profileM.flatMap((p, i) => [
      [`Elevation profile, segment ${i + 1}`, 'Length (ft)', ft(p.lengthM), 'ft', `designed: ${p.name}, ${p.lengthM} m`],
      [`Elevation profile, segment ${i + 1}`, 'Elevation change (ft)', ft(p.elevM), 'ft', `designed: ${p.elevM > 0 ? '+' : ''}${p.elevM} m`],
    ]);
    return [
      ['Fluid and duty', 'Line service', 'Liquid (single phase)', '', 'designed: stabilised crude leaves the export pump dead'],
      ['Fluid and duty', 'Liquid rate (bpd)', s(FD.oil_bopd), 'bpd', 'd8spine FACILITY_DESIGN.oil_bopd'],
      ['Fluid and duty', 'Density from', 'API gravity', '', 'the oil gravity sets the density'],
      ['Fluid and duty', 'Oil gravity (API)', s(LOCKED.api), 'API', 'spine LOCKED.api'],
      ['Fluid and duty', 'Viscosity (cp)', fx(V.muExport, 2), 'cp', 'designed: Beal dead oil at the 77 degF seabed (design basis)'],
      ['Fluid and duty', 'Velocity limit (ft/s)', '15', 'ft/s', 'the studio default'],
      ['Pipe', 'Pipe source', 'From the checked schedule table', '', ''],
      ['Pipe', 'NPS (in)', '4', 'in', 'designed: headroom for Ekene-11 and later tie-ins'],
      ['Pipe', 'Schedule', '80', '', 'designed: heavy wall for on-bottom stability'],
      ['Pipe', 'Roughness', 'Commercial steel, new (0.0018 in)', 'in', 'new line pipe'],
      ['Pipe', 'Custom roughness (in)', '', 'in', 'leave blank'],
      ['Pipe', 'Length (ft)', ft(L.lineM), 'ft', `d8spine FACILITY_DESIGN.export_line_length_km (${FD.export_line_length_km} km)`],
      ['Pipe', 'Elevation change (ft)', ft(L.netElevM), 'ft', `designed: deck +${L.deckM} m to terminal +${L.landfallM} m`],
      ['Elevation profile', 'Inlet pressure (psia)', '114.7', 'psia', 'designed: export pump discharge 100 psig'],
      ...seg,
      ['Line pipe', 'Outside diameter (in)', '4.5', 'in', '4 in line pipe'],
      ['Line pipe', 'Design pressure (psig)', '1440', 'psig', 'designed: Class 600 design pressure'],
      ['Line pipe', 'SMYS (psi)', '52000', 'psi', 'designed: API 5L X52'],
      ['Line pipe', 'Design code', 'B31.4 (liquid lines, F = 0.72)', '', 'a crude oil line'],
      ['Line pipe', 'Joint factor E', '1', '', 'seamless or ERW line pipe'],
      ['Line pipe', 'Temp derate T', '1', '', 'below 250 degF'],
      ['Line pipe', 'Corrosion allowance (in)', '0.118', 'in', 'designed: 3 mm for carbon steel in crude service'],
      ['Line pipe', 'Actual wall (in)', '0.337', 'in', '4 in schedule 80'],
    ];
  },
};

/** LineSizingContext, liquid mode: sizing, profile and wall. */
export function evaluateLine(inp) {
  const pipe = inp.pipe;
  const row = scheduleRow(num(pipe.nps), pipe.schedule);
  if (!row) return { error: 'no schedule row' };
  const custom = num(pipe.customRoughIn);
  const roughnessIn = custom > 0 ? custom : (roughnessOf(pipe.roughnessId) > 0 ? roughnessOf(pipe.roughnessId) : 0.0018);
  const lengthFt = num(pipe.lengthFt);
  const elevChangeFt = num(pipe.elevChangeFt, 0);
  const rhoLbFt3 = inp.liquid.rhoMode === 'api' ? oilDensityLbFt3(num(inp.liquid.oilApi, 35)) : num(inp.liquid.rhoLbFt3);
  const liquidArgs = { qBpd: num(inp.liquid.qBpd), rhoLbFt3, muCp: num(inp.liquid.muCp), lengthFt, elevChangeFt, roughnessIn };
  const sizing = liquidLineDrop({ ...liquidArgs, idIn: row.id });
  const segments = inp.profile.segments.map((sg) => ({ lengthFt: num(sg.lengthFt), elevChangeFt: num(sg.elevChangeFt, 0) })).filter((sg) => sg.lengthFt > 0);
  const profile = liquidLineTraverse({
    p1Psia: num(inp.profile.p1Psia, 900), qBpd: liquidArgs.qBpd, idIn: row.id,
    rhoLbFt3, muCp: liquidArgs.muCp, roughnessIn, profile: segments,
  });
  const w = inp.wall;
  const args = {
    odIn: num(w.odIn), designPsig: num(w.designPsig), smysPsi: num(w.smysPsi), code: w.code,
    locationClass: num(w.locationClass, 1), jointFactor: num(w.jointFactor, 1), tempDerate: num(w.tempDerate, 1),
    corrosionAllowanceIn: num(w.corrosionAllowanceIn, 0),
  };
  const req = requiredWallIn(args);
  const actualWallIn = num(w.actualWallIn, NaN);
  const rated = maopPsig({ ...args, wallIn: actualWallIn });
  return {
    idIn: row.id, rhoLbFt3, sizing, profile,
    wall: { ...req, actualWallIn, maop: rated.maopPsig, pass: actualWallIn >= req.tRequiredIn },
  };
}

// ---------------------------------------------------------------- 32 ------

const STAGE_TEXT = {
  none: 'None', api: 'API 421 separator', cpi: 'Plate interceptor', hydrocyclone: 'De-oiling hydrocyclone',
  igf: 'Induced gas flotation', daf: 'Dissolved gas flotation', nutshell: 'Walnut shell filter', media: 'Multi-media filter',
};
const STAGE_OPTIONS = Object.fromEntries(Object.entries(STAGE_TEXT).map(([k, t]) => [t, k]));

export const PWT = {
  n: 32,
  app: 'Produced Water Treatment Studio',
  slug: 'produced-water-treatment',
  context: 'src/contexts/ProducedWaterContext.jsx',
  components: ['src/components/pwtstudio/PwtPanels.jsx'],
  // The stage labels are built from the stage key in the panel, so the gate
  // checks their option text instead of the label.
  generatedLabels: ['Primary', 'Secondary', 'Tertiary'],
  MAP: {
    'Water and train|Flow (bwpd)': { s: 'water', k: 'flowBwpd' },
    'Water and train|Inlet OIW (ppm)': { s: 'water', k: 'oiwPpm' },
    'Water and train|Temperature (F)': { s: 'water', k: 'tF' },
    'Water and train|TDS (ppm)': { s: 'water', k: 'tdsPpm' },
    'Water and train|Oil gravity (API)': { s: 'water', k: 'oilApi' },
    'Water and train|Discharge spec (ppm)': { s: 'water', k: 'specPpm' },
    'Water and train|Inlet droplet d50 (um)': { s: 'water', k: 'inletD50Micron' },
    'Water and train|Distribution sigma': { s: 'water', k: 'sigma' },
    'Train|Primary': { s: 'train', k: 'primary', options: STAGE_OPTIONS },
    'Train|Secondary': { s: 'train', k: 'secondary', options: STAGE_OPTIONS },
    'Train|Tertiary': { s: 'train', k: 'tertiary', options: STAGE_OPTIONS },
    'Hydrocyclone|Liners': { s: 'hydrocyclone', k: 'nLiners' },
    'Hydrocyclone|Liner bore (mm)': { s: 'hydrocyclone', k: 'linerDiameterMm' },
    'Hydrocyclone|Liner length (m)': { s: 'hydrocyclone', k: 'linerLengthM' },
    'Hydrocyclone|Design flow per liner (m3/h)': { s: 'hydrocyclone', k: 'designFlowPerLinerM3H' },
    'Hydrocyclone|Field at design flow (g)': { s: 'hydrocyclone', k: 'gFieldAtDesign' },
    'Filter|Bed area (m2)': { s: 'filter', k: 'areaM2' },
    'Filter|Bed depth (m)': { s: 'filter', k: 'bedDepthM' },
    'Filter|Media grain (um)': { s: 'filter', k: 'mediaMicron' },
    'Filter|Filter coefficient (1/m)': { s: 'filter', k: 'filterCoefficientPerM' },
  },
  rows(V) {
    const m3h = FD.water_bwpd * 0.158987294928 / 24;
    return [
      ['Water and train', 'Flow (bwpd)', s(FD.water_bwpd), 'bwpd', `d8spine FACILITY_DESIGN.water_bwpd (${fx(m3h, 2)} m3/h)`],
      ['Water and train', 'Inlet OIW (ppm)', '1000', 'ppm', 'designed: the separator water outlet (design basis)'],
      ['Water and train', 'Temperature (F)', s(FD.separator_temperature_f), 'degF', 'd8spine: the water leaves the separator at 140 degF'],
      ['Water and train', 'TDS (ppm)', s(LOCKED.salinity_ppm), 'ppm', 'spine LOCKED.salinity_ppm'],
      ['Water and train', 'Oil gravity (API)', s(LOCKED.api), 'API', 'spine LOCKED.api'],
      ['Water and train', 'Discharge spec (ppm)', fx(V.specPpm, 2), 'ppm', `designed: ${V.specMgL} mg/l over the brine density ${fx(V.water.rhoKgM3, 1)} kg/m3`],
      ['Water and train', 'Inlet droplet d50 (um)', '25', 'um', 'designed: after shear through the level control valve'],
      ['Water and train', 'Distribution sigma', '0.7', '', 'designed: the middle of the customary band'],
      ['Train', 'Primary', 'None', '', 'the separator is the primary stage'],
      ['Train', 'Secondary', 'De-oiling hydrocyclone', '', 'designed: compact, the usual offshore choice'],
      ['Train', 'Tertiary', 'Walnut shell filter', '', 'designed: polishing, so the spec holds with margin'],
      ['Hydrocyclone', 'Liners', '5', '', `designed: ${fx(m3h, 2)} m3/h over 2.16 m3/h per liner`],
      ['Hydrocyclone', 'Liner bore (mm)', '35', 'mm', 'the studio default liner'],
      ['Hydrocyclone', 'Liner length (m)', '0.7', 'm', 'the studio default liner'],
      ['Hydrocyclone', 'Design flow per liner (m3/h)', '2.16', 'm3/h', 'the studio default liner'],
      ['Hydrocyclone', 'Field at design flow (g)', '1000', 'g', 'the studio default liner'],
      ['Filter', 'Bed area (m2)', '1', 'm2', 'designed: close to the 10 m/h reference loading'],
      ['Filter', 'Bed depth (m)', '0.9', 'm', 'the studio default'],
      ['Filter', 'Media grain (um)', '800', 'um', 'the studio default'],
      ['Filter', 'Filter coefficient (1/m)', '3.5', '1/m', 'the Walnut shell preset'],
    ];
  },
};

const BWPD_TO_M3S = 0.158987294928 / 86400;

/** ProducedWaterContext: fluid -> devices -> treatmentTrain. */
export function evaluatePwt(inp) {
  const w = inp.water;
  const tC = (num(w.tF) - 32) / 1.8;
  const tdsPpm = num(w.tdsPpm);
  const mu = waterViscosityPaS({ tC, tdsPpm });
  const rhoW = waterDensityKgM3({ tC, tdsPpm });
  const rhoO = oilDensityKgM3({ apiGravity: num(w.oilApi), tC });
  const fluid = { muPaS: mu.muPaS, rhoWater: rhoW.rhoKgM3, rhoOil: rhoO.rhoKgM3, flowM3S: num(w.flowBwpd) * BWPD_TO_M3S };
  const common = { flowM3S: fluid.flowM3S, rhoWater: fluid.rhoWater, rhoOil: fluid.rhoOil, muPaS: fluid.muPaS };
  const build = (key) => {
    if (!key || key === 'none') return null;
    const name = key;
    if (key === 'api') return { key, name, ...apiSeparator({ ...common, lengthM: num(inp.api.lengthM), widthM: num(inp.api.widthM), depthM: num(inp.api.depthM), shortCircuitF: num(inp.api.shortCircuitF) }) };
    if (key === 'cpi') return { key, name, ...plateInterceptor({ ...common, plateAreaM2: num(inp.cpi.plateAreaM2), nPlates: num(inp.cpi.nPlates), efficiencyFactor: num(inp.cpi.efficiencyFactor) }) };
    if (key === 'hydrocyclone') {
      const h = inp.hydrocyclone;
      return { key, name, ...hydrocyclone({ ...common, nLiners: num(h.nLiners), linerDiameterM: num(h.linerDiameterMm) / 1000, linerLengthM: num(h.linerLengthM), designFlowPerLinerM3S: num(h.designFlowPerLinerM3H) / 3600, gFieldAtDesign: num(h.gFieldAtDesign) }) };
    }
    if (key === 'igf' || key === 'daf') {
      const f = inp.flotation;
      return { key, name, ...flotation({ ...common, cellVolumeM3: num(f.cellVolumeM3), nCells: num(f.nCells), cellDepthM: num(f.cellDepthM), gasRatio: num(f.gasRatio), bubbleMicron: num(f.bubbleMicron) }) };
    }
    const f = inp.filter;
    return { key, name, ...mediaFilter({ flowM3S: fluid.flowM3S, areaM2: num(f.areaM2), bedDepthM: num(f.bedDepthM), mediaMicron: num(f.mediaMicron), filterCoefficientPerM: num(f.filterCoefficientPerM) }) };
  };
  const devices = ['primary', 'secondary', 'tertiary'].map((st) => build(inp.train[st])).filter(Boolean);
  const result = treatmentTrain({
    inletOiwPpm: num(w.oiwPpm), inletD50Micron: num(w.inletD50Micron), sigma: num(w.sigma),
    devices, specPpm: num(w.specPpm),
  });
  return { fluid, devices, result };
}

// ---------------------------------------------------------------- 33 ------

export const CORROSION = {
  n: 33,
  app: 'Corrosion & Integrity Studio',
  slug: 'corrosion-rate-predictor',
  context: 'src/contexts/CorrosionStudioContext.jsx',
  components: ['src/components/corrosionstudio/CorrosionPanels.jsx'],
  MAP: {
    'Conditions|Temperature (F)': { s: 'conditions', k: 'tF' },
    'Conditions|Pressure (psig)': { s: 'conditions', k: 'pPsig' },
    'Conditions|CO2 (mol %)': { s: 'conditions', k: 'co2MolPct' },
    'Conditions|H2S (mol %)': { s: 'conditions', k: 'h2sMolPct' },
    'Conditions|In-situ pH': { s: 'conditions', k: 'ph' },
    'Flow|Velocity (ft/s)': { s: 'flow', k: 'velocityFtS' },
    'Flow|Line ID (in)': { s: 'flow', k: 'idIn' },
    'Flow|Density (lb/ft3)': { s: 'flow', k: 'densityLbFt3' },
    'Flow|Viscosity (cp)': { s: 'flow', k: 'viscosityCp' },
    'Flow|Wetting regime': { s: 'flow', k: 'flowRegime', options: { 'Water wet (continuous water film)': 'waterWet', 'Intermittent (scaled by water cut)': 'intermittent', 'Oil wet (no water at the wall)': 'oilWet' } },
    'Flow|Water cut (%)': { s: 'flow', k: 'waterCutPct' },
    'Inhibition|Efficiency (%)': { s: 'mitigation', k: 'inhibitorEfficiencyPct' },
    'Inhibition|Availability (%)': { s: 'mitigation', k: 'inhibitorAvailabilityPct' },
    'Integrity|Corrosion allowance (in)': { s: 'integrity', k: 'corrosionAllowanceIn' },
    'Integrity|Already consumed (in)': { s: 'integrity', k: 'consumedIn' },
    'Integrity|Design life (years)': { s: 'integrity', k: 'designLifeYears' },
  },
  rows(V, { co2MolPct, h2sMolPct }) {
    const idIn = 3.068;
    const areaFt2 = Math.PI * (idIn / 12) ** 2 / 4;
    const vFtS = (FD.water_bwpd * 5.614583333333333 / 86400) / areaFt2;
    return [
      ['Conditions', 'Temperature (F)', s(FD.separator_temperature_f), 'degF', 'd8spine: the water line runs at separator temperature'],
      ['Conditions', 'Pressure (psig)', s(FD.separator_pressure_psig), 'psig', 'd8spine: upstream of the level control valve, at separator pressure'],
      ['Conditions', 'CO2 (mol %)', s(co2MolPct), 'mol %', 'designed: the separator gas composition (design basis)'],
      ['Conditions', 'H2S (mol %)', s(h2sMolPct), 'mol %', 'designed: 20 ppmv in the separator gas (design basis)'],
      ['Conditions', 'In-situ pH', '4.5', '', 'designed: CO2-saturated brine, little bicarbonate, a conservative value'],
      ['Flow', 'Velocity (ft/s)', fx(vFtS, 2), 'ft/s', `designed: ${FD.water_bwpd} bwpd (d8spine) through the 3.068 in bore`],
      ['Flow', 'Line ID (in)', s(idIn), 'in', 'designed: 3 in schedule 40'],
      ['Flow', 'Density (lb/ft3)', fx(V.water.rhoKgM3 * LB_FT3_PER_KG_M3, 2), 'lb/ft3', `designed: the brine at 140 degF, ${fx(V.water.rhoKgM3, 1)} kg/m3 (design basis)`],
      ['Flow', 'Viscosity (cp)', fx(V.water.muPaS * 1000, 2), 'cp', 'designed: the brine at 140 degF (design basis)'],
      ['Flow', 'Wetting regime', 'Water wet (continuous water film)', '', 'a produced water line is all water'],
      ['Flow', 'Water cut (%)', '100', '%', 'all water'],
      ['Inhibition', 'Efficiency (%)', '90', '%', 'designed: continuous inhibitor injection'],
      ['Inhibition', 'Availability (%)', '95', '%', 'designed: pump downtime and refills'],
      ['Integrity', 'Corrosion allowance (in)', '0.118', 'in', 'designed: 3 mm carbon steel allowance'],
      ['Integrity', 'Already consumed (in)', '0', 'in', 'a new line'],
      ['Integrity', 'Design life (years)', '25', 'years', 'designed: field life with Ekene-11 and the flood'],
    ];
  },
};

const MM_PER_IN = 25.4;

/** CorrosionStudioContext: toEngineUnits -> screen. */
export function evaluateCorrosion(inp) {
  const c = inp.conditions;
  const f = inp.flow;
  const m = inp.mitigation;
  const i = inp.integrity;
  return screen({
    tC: (num(c.tF) - 32) / 1.8,
    pTotalBar: (num(c.pPsig) + 14.7) / 14.5038,
    co2MolFrac: num(c.co2MolPct) / 100,
    h2sMolFrac: num(c.h2sMolPct) / 100,
    ph: num(c.ph),
    velocityMS: num(f.velocityFtS) * 0.3048,
    diameterM: num(f.idIn) * 0.0254,
    densityKgM3: num(f.densityLbFt3) * 16.0185,
    viscosityPaS: num(f.viscosityCp) * 1e-3,
    flowRegime: f.flowRegime,
    waterCutFrac: num(f.waterCutPct) / 100,
    inhibitorEfficiencyPct: num(m.inhibitorEfficiencyPct, 0),
    inhibitorAvailabilityPct: num(m.inhibitorAvailabilityPct, 100),
    corrosionAllowanceMm: num(i.corrosionAllowanceIn, 0) * MM_PER_IN,
    consumedMm: num(i.consumedIn, 0) * MM_PER_IN,
    designLifeYears: num(i.designLifeYears, 0),
  });
}

// ------------------------------------------------------------ plumbing ----

export const APPS = [SEPARATOR, LINE, PWT, CORROSION];

/**
 * Sheet rows -> the app's input state, as edits on top of `base` (a
 * context's defaultInputs(), or an empty shape for the generator).
 * Returns { inputs, edits } where edits are [kind, ...args] in the order a
 * presenter would type them: ['mode', v], ['set', s, k, v], ['seg', i, k, v].
 */
export function applyRows(app, rows, base) {
  const inputs = JSON.parse(JSON.stringify(base));
  const edits = [];
  for (const [section, field, value] of rows) {
    const key = `${section}|${field}`;
    const m = app.MAP[key];
    if (!m) throw new Error(`${app.slug}: sheet row ${key} maps to no input`);
    let v = value;
    if (m.options) {
      if (!(value in m.options)) throw new Error(`${app.slug}: ${key} has no option "${value}"`);
      v = m.options[value];
    }
    if (m.mode) { inputs.mode = v; edits.push(['mode', v]); continue; }
    if (m.seg !== undefined) {
      inputs.profile ??= {};
      inputs.profile.segments ??= [];
      while (inputs.profile.segments.length <= m.seg) inputs.profile.segments.push({ lengthFt: '', elevChangeFt: '' });
      inputs.profile.segments[m.seg] = { ...inputs.profile.segments[m.seg], [m.k]: v };
      edits.push(['seg', m.seg, m.k, v]);
      continue;
    }
    inputs[m.s] ??= {};
    inputs[m.s][m.k] = v;
    edits.push(['set', m.s, m.k, v]);
  }
  return { inputs, edits };
}

/** The empty input shape each context starts from, for the generator. */
export const EMPTY = {
  'separator-slug-catcher-designer': { vessel: {}, process: {}, slug: {} },
  'facility-network-hydraulics': { mode: 'liquid', liquid: {}, pipe: {}, profile: { segments: [] }, wall: {} },
  'produced-water-treatment': { water: {}, train: {}, api: {}, cpi: {}, hydrocyclone: {}, flotation: {}, filter: {} },
  'corrosion-rate-predictor': { conditions: {}, flow: {}, mitigation: {}, integrity: {} },
};

/** RFC 4180 CSV: quote a cell that holds a comma, a quote or a newline. */
export const csvCell = (v) => {
  const t = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
export const toCsv = (headers, rows) => `${[headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')}\n`;

/** The matching reader: the gate parses the sheets with it. */
export function parseCsv(text) {
  const out = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out;
}

export const SHEET_HEADERS = ['section', 'field', 'value', 'unit', 'source'];
export const sheetPath = (app) => `13-facilities/${app.slug}-inputs.csv`;
