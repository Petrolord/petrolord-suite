// Process safety domain (Wave D8): the three input sheets' fields.
//
// One row per thing a presenter types or picks, in the app's OWN words: the
// section is the tab and panel, the field is the label (or the screen reader
// label, for the register's table cells) the app puts on the input, and the
// unit is the one printed beside it. `path` is where that input lives in the
// app's study object (src/utils/processSafety/*Study.js), which is how the
// gate test feeds the sheet through the app's own evaluateStudy.
//
// kinds:  num     typed text, the app turns it into a number itself
//         text    typed words
//         select  the option label as the app lists it; `options` names the
//                 app export the label is resolved against
//         preset  a probit preset, shown as '<id>: Y = ...'
//         bool    yes / no (a checkbox)
//         clear   a list the presenter empties (value 'none')

import { D } from './design.mjs';

export const SHEET_HEADER = ['section', 'field', 'value', 'unit', 'source'];

// ------------------------------------------------------------ CSV

const needsQuote = (s) => /[",\n]/.test(s);
export const csvCell = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return needsQuote(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** The first row of every sheet says what it is; applySheet skips it. */
export const ABOUT_SECTION = 'About this sheet';
export const toCsv = (rows, about) => `${[SHEET_HEADER, [ABOUT_SECTION, 'Synthetic teaching case', 'yes', '', about], ...rows]
  .map((r) => r.map(csvCell).join(',')).join('\n')}\n`;

/** A small RFC 4180 reader: quoted fields, doubled quotes, no multi-line cells. */
export function readCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  const parse = (line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (ch === '"') q = false; else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const [head, ...body] = lines.map(parse);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// ------------------------------------------------------------ 34 Consequence Modelling Studio

const LIQ = 'Source term: Liquid through a hole (Bernoulli)';
const GAS = 'Source term: Gas through a hole (ideal gas, choked or subsonic)';
const POOL = 'Source term: Pool from a spill';
const DISP = 'Dispersion: Release and weather';
const RECEP = 'Dispersion: Receptor';
const DIST = 'Dispersion: Distance to a concentration';
const BURN = 'Fire: Pool and burning rate';
const FLAME = 'Fire: Flame, emissive power and target';
const FDIST = 'Fire: Distance to a heat flux';
const CHARGE = 'Explosion: Charge';
const OVERP = 'Explosion: Overpressure at a distance (free-air burst)';
const ODIST = 'Explosion: Distance to an overpressure';
const THERM = 'Harm: Thermal radiation';
const BLAST = 'Harm: Blast overpressure';

/** [section, field, unit, path, kind, options] */
export const CONSEQUENCE_FIELDS = [
  [LIQ, 'Discharge coefficient Cd', '-', 'source.liquid.dischargeCoefficient', 'num'],
  [LIQ, 'Hole diameter', 'mm', 'source.liquid.holeDiameterMm', 'num'],
  [LIQ, 'Liquid density', 'kg/m3', 'source.liquid.liquidDensityKgM3', 'num'],
  [LIQ, 'Liquid height above the hole', 'm', 'source.liquid.liquidHeadM', 'num'],
  [LIQ, 'Pressure above the liquid', 'bar absolute', 'source.liquid.pressureAboveLiquidBar', 'num'],
  [LIQ, 'Ambient pressure', 'bar absolute', 'source.liquid.ambientPressureBar', 'num'],
  [GAS, 'Discharge coefficient Cd', '-', 'source.gas.dischargeCoefficient', 'num'],
  [GAS, 'Hole diameter', 'mm', 'source.gas.holeDiameterMm', 'num'],
  [GAS, 'Upstream pressure', 'bar absolute', 'source.gas.upstreamPressureBar', 'num'],
  [GAS, 'Upstream temperature', 'C', 'source.gas.upstreamTemperatureC', 'num'],
  [GAS, 'Molar mass', 'g/mol', 'source.gas.molarMassGMol', 'num'],
  [GAS, 'Heat capacity ratio gamma', 'Cp/Cv', 'source.gas.heatCapacityRatio', 'num'],
  [GAS, 'Ambient pressure', 'bar absolute', 'source.gas.ambientPressureBar', 'num'],
  [POOL, 'Spill volume', '', 'source.pool.spillSource', 'select', 'SPILL_SOURCES'],
  [POOL, 'Release duration', 's', 'source.pool.releaseDurationS', 'num'],
  [POOL, 'Containment', '', 'source.pool.containment', 'select', 'CONTAINMENTS'],
  [POOL, 'Bund floor area', 'm2', 'source.pool.bundAreaM2', 'num'],
  [POOL, 'Bund wall height (blank: not checked)', 'm', 'source.pool.bundWallHeightM', 'num'],
  [DISP, 'Release rate from', '', 'dispersion.rateSource', 'select', 'PLUME_RATE_SOURCES'],
  [DISP, 'Wind speed', 'm/s', 'dispersion.windSpeedMS', 'num'],
  [DISP, 'Dispersion coefficients', '', 'dispersion.sigmaMode', 'select', 'SIGMA_MODES'],
  [DISP, 'Pasquill-Gifford stability class', '', 'dispersion.stabilityClass', 'select', 'STABILITY_CLASSES'],
  [DISP, 'Release height h', 'm', 'dispersion.releaseHeightM', 'num'],
  [RECEP, 'Downwind distance x', 'm', 'dispersion.downwindDistanceM', 'num'],
  [RECEP, 'Crosswind offset y', 'm', 'dispersion.crosswindDistanceM', 'num'],
  [RECEP, 'Receptor height z', 'm', 'dispersion.receptorHeightM', 'num'],
  [RECEP, 'Molar mass, for ppm (blank: mg/m3 only)', 'g/mol', 'dispersion.molarMassGMol', 'num'],
  [RECEP, 'Air temperature, for ppm', 'C', 'dispersion.temperatureC', 'num'],
  [RECEP, 'Air pressure, for ppm', 'bar absolute', 'dispersion.pressureBar', 'num'],
  [DIST, 'Target concentration', 'ppm', 'dispersion.targetConcentration', 'num'],
  [DIST, 'Target unit', '', 'dispersion.targetUnit', 'select', 'CONCENTRATION_UNITS'],
  [BURN, 'Pool diameter from', '', 'fire.diameterSource', 'select', 'DIAMETER_SOURCES'],
  [BURN, 'Burning rate method', '', 'fire.burningMethod', 'select', 'BURNING_METHODS'],
  [BURN, 'Heat of combustion', 'MJ/kg', 'fire.heatOfCombustionMJKg', 'num'],
  [BURN, 'Give the two coefficients myself instead of a Table 6.5 fuel', '', 'fire.customBurning', 'bool'],
  [BURN, 'm"inf', 'kg/(m2 s)', 'fire.massBurningFluxInfKgM2S', 'num'],
  [BURN, 'k beta (none: independent of D)', '1/m', 'fire.kBetaPerM', 'num'],
  [FLAME, 'Flame length', '', 'fire.flameLengthMethod', 'select', 'FLAME_LENGTH_METHODS'],
  [FLAME, 'Air density', 'kg/m3', 'fire.airDensityKgM3', 'num'],
  [FLAME, 'Wind speed at 10 m (0: no tilt)', 'm/s', 'fire.windSpeed10mMS', 'num'],
  [FLAME, 'Air kinematic viscosity (for tilt)', 'm2/s', 'fire.airKinematicViscosityM2S', 'num'],
  [FLAME, 'Surface emissive power', '', 'fire.sepMethod', 'select', 'SEP_METHODS'],
  [FLAME, 'Radiative fraction Fs (YB: 0.1 to 0.4)', '-', 'fire.radiativeFraction', 'num'],
  [FLAME, 'Soot fraction (YB: 0.8 for oil products)', '-', 'fire.sootFraction', 'num'],
  [FLAME, 'Soot emissive power (blank: 20)', 'kW/m2', 'fire.sootEmissivePowerKWM2', 'num'],
  [FLAME, 'Target distance from the pool centre X', 'm', 'fire.distanceFromCentreM', 'num'],
  [FLAME, 'Transmissivity', '', 'fire.transmissivityMode', 'select', 'TRANSMISSIVITY_MODES'],
  [FLAME, 'Transmissivity tau', '-', 'fire.transmissivity', 'num'],
  [FDIST, 'Target heat flux', 'kW/m2', 'fire.targetHeatFluxKWM2', 'num'],
  [CHARGE, 'Charge', '', 'explosion.chargeMode', 'select', 'CHARGE_MODES'],
  [CHARGE, 'Fuel mass in the cloud', 'kg', 'explosion.fuelMassKg', 'num'],
  [CHARGE, 'Heat of combustion', 'MJ/kg', 'explosion.heatOfCombustionMJKg', 'num'],
  [CHARGE, 'Yield factor (YB: 0.02 to 0.2 in use)', '-', 'explosion.yieldFactor', 'num'],
  [CHARGE, 'TNT blast energy', 'MJ/kg', 'explosion.tntBlastEnergyMJKg', 'num'],
  [OVERP, 'Distance R', 'm', 'explosion.distanceM', 'num'],
  [OVERP, 'Ambient pressure', 'bar absolute', 'explosion.ambientPressureBar', 'num'],
  [ODIST, 'Target overpressure', 'kPa', 'explosion.targetOverpressureKPa', 'num'],
  [THERM, 'Preset', '', 'harm.thermal.preset', 'preset', 'THERMAL_PROBITS'],
  [THERM, 'Heat flux from', '', 'harm.thermal.link', 'select', 'HARM_LINKS.thermal'],
  [THERM, 'Exposure time t', 's', 'harm.thermal.exposureTimeS', 'num'],
  [BLAST, 'Preset', '', 'harm.overpressure.preset', 'preset', 'OVERPRESSURE_PROBITS'],
  [BLAST, 'Overpressure from', '', 'harm.overpressure.link', 'select', 'HARM_LINKS.overpressure'],
];

// ------------------------------------------------------------ 35 LOPA & SIL Studio

const WS = 'LOPA worksheet';
const CM = (k) => `LOPA worksheet: Conditional modifiers, row ${k}`;
const IPL = (k) => `LOPA worksheet: Independent protection layers, row ${k}`;
const SIF = 'SIF verification';
const SUB = (role) => `SIF verification: ${role}`;
const subFields = (role, i) => [
  [SUB(role), 'Name', '', `sif.subsystems.${i}.name`, 'text'],
  [SUB(role), 'Architecture', '', `sif.subsystems.${i}.architecture`, 'select', 'ARCHITECTURES'],
  [SUB(role), 'lambda DU', 'per hour, per channel', `sif.subsystems.${i}.lambdaDuPerHour`, 'num'],
  [SUB(role), 'lambda DD', 'per hour, per channel', `sif.subsystems.${i}.lambdaDdPerHour`, 'num'],
  [SUB(role), 'MTTR', 'h', `sif.subsystems.${i}.mttrHours`, 'num'],
  [SUB(role), 'MRT', 'h', `sif.subsystems.${i}.mrtHours`, 'num'],
  [SUB(role), 'beta (DU common cause)', 'fraction', `sif.subsystems.${i}.beta`, 'num'],
  [SUB(role), 'beta D (DD common cause)', 'fraction', `sif.subsystems.${i}.betaD`, 'num'],
  [SUB(role), 'Proof test interval T1', 'h', `sif.subsystems.${i}.proofTestIntervalHours`, 'num'],
  [SUB(role), 'Proof test coverage', 'fraction, 0 to 1', `sif.subsystems.${i}.proofTestCoverage`, 'num'],
];

export const LOPA_FIELDS = [
  [WS, 'Scenario', '', 'name', 'text'],
  [WS, 'Initiating event', '', 'initiatingEvent', 'text'],
  [WS, 'Consequence', '', 'consequence', 'text'],
  [WS, 'Initiating event frequency (IEF)', 'per year', 'iefPerYr', 'num'],
  [WS, 'Tolerable mitigated event likelihood (TMEL)', 'per year', 'tmelPerYr', 'num'],
  [CM(1), 'Description', '', 'conditionalModifiers.0.name', 'text'],
  [CM(1), 'Probability', '-', 'conditionalModifiers.0.probability', 'num'],
  [CM(2), 'Description', '', 'conditionalModifiers.1.name', 'text'],
  [CM(2), 'Probability', '-', 'conditionalModifiers.1.probability', 'num'],
  [IPL(1), 'Layer', '', 'ipls.0.name', 'text'],
  [IPL(1), 'PFD', '-', 'ipls.0.pfd', 'num'],
  [IPL(1), 'Independent', '', 'ipls.0.independent', 'bool'],
  [IPL(1), 'Auditable', '', 'ipls.0.auditable', 'bool'],
  [IPL(2), 'Layer', '', 'ipls.1.name', 'text'],
  [IPL(2), 'PFD', '-', 'ipls.1.pfd', 'num'],
  [IPL(2), 'Independent', '', 'ipls.1.independent', 'bool'],
  [IPL(2), 'Auditable', '', 'ipls.1.auditable', 'bool'],
  [SIF, 'Attach a SIF to this scenario', '', 'sif.enabled', 'bool'],
  [SIF, 'SIF', '', 'sif.name', 'text'],
  ...subFields('Sensors', 0),
  ...subFields('Logic solver', 1),
  ...subFields('Final elements', 2),
];

// ------------------------------------------------------------ 36 QRA Studio

export const QRA_SCENARIOS = [
  { id: 's1', name: 'Gas 25 mm jet fire' },
  { id: 's2', name: 'Gas 25 mm flash fire' },
  { id: 's3', name: 'Gas 25 mm explosion' },
  { id: 's4', name: 'Oil 25 mm pool fire' },
];

const ET = 'Event tree: Release and ignition';
const SC = 'Register: Scenarios';
const LO = 'Register: Locations';
const PD = 'Register: Probability of death at each location';
const IR = 'Individual risk: IRPA of the most exposed person';
const SR = 'Societal risk';
const CB = 'ALARP and cost-benefit: Cost-benefit and gross disproportion';

const scenarioFields = QRA_SCENARIOS.flatMap((s, i) => {
  const n = i + 1;
  return [
    [SC, `Scenario ${n} name`, '', `scenarios.${i}.name`, 'text'],
    [SC, `Scenario ${n} frequency from`, '', `scenarios.${i}.frequencySource`, 'select', 'FREQUENCY_SOURCES'],
    [SC, `Scenario ${n} event tree outcome`, '', `scenarios.${i}.outcome`, 'select', 'EVENT_TREE_OUTCOMES'],
    [SC, `Scenario ${n} frequency`, 'per year', `scenarios.${i}.frequencyPerYr`, 'num'],
    [SC, `Scenario ${n} expected deaths`, 'deaths', `scenarios.${i}.fatalities`, 'num'],
    [SC, `Scenario ${n} effect`, '', `scenarios.${i}.effect`, 'select', 'EFFECTS'],
    [SC, `Scenario ${n} fire duration`, 's', `scenarios.${i}.fireDurationS`, 'num'],
  ];
});
const locationFields = D.places.flatMap((p, j) => {
  const n = j + 1;
  return [
    [LO, `Location ${n} name`, '', `locations.${j}.name`, 'text'],
    [LO, `Location ${n} criterion`, '', `locations.${j}.criterion`, 'select', 'IR_CRITERIA'],
    [LO, `Location ${n} period`, '', `locations.${j}.period`, 'select', 'PERIODS'],
    [LO, `Location ${n} hours per year`, 'h/yr', `locations.${j}.occupancyHoursPerYr`, 'num'],
  ];
});
// Every cell label the register can show; a sheet writes the ones its cell needs.
const cellFields = QRA_SCENARIOS.flatMap((s) => D.places.flatMap((p) => {
  const label = `${s.name} at ${p.name}`;
  const at = `cells.${s.id}.${p.id}`;
  return [
    [PD, `${label}, probability from`, '', `${at}.mode`, 'select', 'PD_MODES'],
    [PD, `${label}, probability of death`, '-', `${at}.pd`, 'num'],
    [PD, `${label}, flame envelope`, '', `${at}.inFlame`, 'select', 'FLASH_OPTIONS'],
    [PD, `${label}, in the flame envelope`, '', `${at}.inFlame`, 'bool'],
    [PD, `${label}, Heat flux (kW/m2)`, 'kW/m2', `${at}.dose`, 'num'],
    [PD, `${label}, Peak overpressure (kPa)`, 'kPa', `${at}.dose`, 'num'],
  ];
}));

/** RegisterPanel's flash fire choice (a module constant there, not exported). */
export const FLASH_OPTIONS = [
  { id: 'outside', label: 'Outside the envelope', value: false },
  { id: 'inside', label: 'Inside the envelope', value: true },
];

export const QRA_FIELDS = [
  [ET, 'Initiating frequency f0', 'per year', 'eventTree.initiatingFrequencyPerYr', 'num'],
  [ET, 'Immediate ignition from', '', 'eventTree.immediateMode', 'select', 'IGNITION_MODES'],
  [ET, 'Release type', '', 'eventTree.releaseType', 'select', 'RELEASE_TYPES'],
  [ET, 'Release rate', 'kg/s', 'eventTree.massRateKgS', 'num'],
  [ET, 'Substance (PB Table 4.7 reactivity)', '', 'eventTree.substance', 'select', 'SUBSTANCES'],
  [ET, 'Delayed ignition, given no immediate ignition', '-', 'eventTree.delayedIgnitionProbability', 'num'],
  [ET, 'Ignited cloud split', '', 'eventTree.splitMode', 'select', 'SPLIT_MODES'],
  ...scenarioFields,
  ...locationFields,
  ...cellFields,
  [IR, 'Judged against', '', 'individual.irpaCriterion', 'select', 'IR_CRITERIA'],
  [SR, 'Exposed hours of the workforce', 'h per year', 'societal.exposedHoursPerYr', 'num'],
  [SR, 'Criterion', '', 'societal.criterion', 'select', 'FN_CRITERION_CHOICES'],
  [CB, 'Measure', '', 'costBenefit.measure', 'text'],
  [CB, 'PLL reduction from', '', 'costBenefit.deltaSource', 'select', 'DELTA_SOURCES'],
  [CB, 'PLL after the measure', 'per year', 'costBenefit.pllAfterPerYr', 'num'],
  [CB, 'Value of preventing a fatality (VPF)', 'currency', 'costBenefit.vpf', 'num'],
  [CB, 'Life of the measure', 'whole years', 'costBenefit.lifetimeYears', 'num'],
  [CB, 'Capital cost at year 0', 'currency', 'costBenefit.capitalCost', 'num'],
  [CB, 'Annual cost, net of savings (blank is 0)', 'currency per year', 'costBenefit.annualCost', 'num'],
  [CB, 'Disproportion factor (DF)', '', 'costBenefit.disproportionFactor', 'num'],
  [CB, 'Other harms', '', 'costBenefit.otherHarms', 'clear'],
];

// ------------------------------------------------------------ writing and reading

const key = (section, field) => `${section}\u0000${field}`;
const index = (fields) => new Map(fields.map((f) => [key(f[0], f[1]), f]));

/**
 * The sheet rows from { [section|field]: [value, source] } in the field
 * order. Refuses a value for a field the app does not have, so a sheet can
 * never name an input that is not on screen.
 */
export function sheetRows(fields, values) {
  const ix = index(fields);
  const rows = [];
  for (const [k, [value, source]] of values) {
    const f = ix.get(k);
    if (!f) throw new Error(`ASSERT process safety sheet: no field ${k.replace('\u0000', ' / ')} in the app`);
    rows.push([f[0], f[1], value, f[2], source]);
  }
  return rows;
}
export const at = (section, field) => key(section, field);

const setPath = (obj, path, value) => {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i];
    if (o[p] === undefined || o[p] === null) o[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    o = o[p];
  }
  o[parts[parts.length - 1]] = value;
};

/**
 * Apply the rows of a sheet to a study, the way a presenter would type them.
 * `resolve(optionsName, label)` returns the app's option id for a label (or
 * throws); it lives in the gate, which can import the app's option lists.
 */
export function applySheet(study, fields, rows, resolve) {
  const ix = index(fields);
  for (const r of rows) {
    if (r.section === ABOUT_SECTION) continue;
    const f = ix.get(key(r.section, r.field));
    if (!f) throw new Error(`sheet row names a field the app does not have: ${r.section} / ${r.field}`);
    const [, , unit, path, kind, options] = f;
    if (r.unit !== unit) throw new Error(`sheet row ${r.section} / ${r.field}: unit '${r.unit}', the app shows '${unit}'`);
    let v = r.value;
    if (kind === 'bool') {
      if (v !== 'yes' && v !== 'no') throw new Error(`${r.field}: yes or no, not '${v}'`);
      v = v === 'yes';
    } else if (kind === 'select' || kind === 'preset') {
      v = resolve(options, v, kind);
    } else if (kind === 'clear') {
      if (v !== 'none') throw new Error(`${r.field}: 'none', not '${v}'`);
      v = [];
    }
    setPath(study, path, v);
  }
  return study;
}
