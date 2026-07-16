// EOR screening engine (R4, Reservoir-ROADMAP.md).
//
// Encodes the published technical screening criteria of Taber, Martin
// & Seright, "EOR Screening Criteria Revisited" (SPE Reservoir
// Engineering, Aug 1997; SPE 35385/39234), Tables 1-3: for each EOR
// method, limits on oil gravity, viscosity, oil saturation, formation
// type, net thickness, average permeability, depth and temperature.
// `preferred` carries the paper's "current projects average" arrow
// values and is informational only; screening passes/fails on the
// hard limits. This is a SCREENING tool (candidate shortlisting),
// not a design or prediction tool — the paper's own caveat.
//
// Every criterion verdict is explicit (pass / fail / not-applicable),
// nothing is silently skipped: the score is passes over applicable
// criteria, and a method is "qualified" only when every applicable
// criterion passes. The thin-unless-dipping geometry note for the
// gravity-stable gas methods is advisory (reported, never scored).

export const FORMATION_OPTIONS = [
  { value: 'sandstone', label: 'Sandstone' },
  { value: 'carbonate', label: 'Carbonate' },
  { value: 'other', label: 'Other / unconsolidated' },
];

export const EOR_METHODS = [
  {
    id: 'nitrogen',
    name: 'Nitrogen & flue gas',
    group: 'Gas injection',
    composition: 'High % of light hydrocarbons (C1-C7)',
    gravity: { min: 35, preferred: 48 },
    viscosity: { max: 0.4, preferred: 0.2 },
    oilSat: { min: 40, preferred: 75 },
    formation: ['sandstone', 'carbonate'],
    thicknessRule: 'thin_unless_dipping',
    permeability: null,
    depth: { min: 6000 },
    temperature: null,
  },
  {
    id: 'hydrocarbon',
    name: 'Hydrocarbon miscible',
    group: 'Gas injection',
    composition: 'High % of C2-C7',
    gravity: { min: 23, preferred: 41 },
    viscosity: { max: 3, preferred: 0.5 },
    oilSat: { min: 30, preferred: 80 },
    formation: ['sandstone', 'carbonate'],
    thicknessRule: 'thin_unless_dipping',
    permeability: null,
    depth: { min: 4000 },
    temperature: null,
  },
  {
    id: 'co2',
    name: 'CO2 miscible',
    group: 'Gas injection',
    composition: 'High % of C5-C12',
    gravity: { min: 22, preferred: 36 },
    viscosity: { max: 10, preferred: 1.5 },
    oilSat: { min: 20, preferred: 55 },
    formation: ['sandstone', 'carbonate'],
    thicknessRule: 'wide_range',
    permeability: null,
    depth: { min: 2500 },
    temperature: null,
  },
  {
    id: 'immiscible',
    name: 'Immiscible gas',
    group: 'Gas injection',
    composition: 'Not critical',
    gravity: { min: 12 },
    viscosity: { max: 600 },
    oilSat: { min: 35, preferred: 70 },
    formation: null,
    thicknessRule: 'nc_if_dipping',
    permeability: null,
    depth: { min: 1800 },
    temperature: null,
  },
  {
    id: 'chemical',
    name: 'Micellar/polymer, ASP & alkaline',
    group: 'Chemical',
    composition: 'Light, intermediate; some organic acids for alkaline',
    gravity: { min: 20, preferred: 35 },
    viscosity: { max: 35, preferred: 13 },
    oilSat: { min: 35, preferred: 53 },
    formation: ['sandstone'],
    thicknessRule: null,
    permeability: { min: 10, preferred: 450 },
    depth: { max: 9000, preferred: 3250 },
    temperature: { max: 200, preferred: 80 },
  },
  {
    id: 'polymer',
    name: 'Polymer flooding',
    group: 'Chemical',
    composition: 'Not critical',
    gravity: { min: 15 },
    // The paper's quirk: too-thin oil does not need mobility control.
    viscosity: { min: 10, max: 150 },
    oilSat: { min: 50, preferred: 80 },
    formation: ['sandstone'],
    thicknessRule: null,
    permeability: { min: 10, preferred: 800 },
    depth: { max: 9000 },
    temperature: { max: 200, preferred: 140 },
  },
  {
    id: 'combustion',
    name: 'In-situ combustion',
    group: 'Thermal',
    composition: 'Some asphaltic components',
    gravity: { min: 10, preferred: 16 },
    viscosity: { max: 5000, preferred: 1200 },
    oilSat: { min: 50, preferred: 72 },
    formation: ['sandstone', 'other'],
    formationNote: 'High-porosity sand/sandstone',
    thicknessRule: { minFt: 10 },
    permeability: { min: 50 },
    depth: { max: 11500, preferred: 3500 },
    temperature: { min: 100, preferred: 135 },
  },
  {
    id: 'steam',
    name: 'Steam flooding',
    group: 'Thermal',
    composition: 'Not critical',
    gravity: { min: 8, preferred: 13.5 },
    viscosity: { max: 200000, preferred: 4700 },
    oilSat: { min: 40, preferred: 66 },
    formation: ['sandstone', 'other'],
    formationNote: 'High-porosity sand/sandstone',
    thicknessRule: { minFt: 20 },
    permeability: { min: 200, preferred: 2540 },
    depth: { max: 4500, preferred: 1500 },
    temperature: null,
  },
];

const isNum = (v) => Number.isFinite(v);

const rangeVerdict = (label, actual, spec, unit) => {
  if (!spec) return { criterion: label, status: 'na', required: 'Not critical', actual, unit };
  if (!isNum(actual)) return { criterion: label, status: 'na', required: describeRange(spec, unit), actual: null, unit };
  const pass = (spec.min == null || actual >= spec.min) && (spec.max == null || actual <= spec.max);
  return { criterion: label, status: pass ? 'pass' : 'fail', required: describeRange(spec, unit), actual, unit, preferred: spec.preferred };
};

export const describeRange = (spec, unit = '') => {
  const u = unit ? ` ${unit}` : '';
  if (spec.min != null && spec.max != null) return `${spec.min} to ${spec.max}${u}`;
  if (spec.min != null) return `> ${spec.min}${u}`;
  if (spec.max != null) return `< ${spec.max}${u}`;
  return 'Not critical';
};

/** Screen one method against the reservoir/fluid inputs. */
export function screenMethod(method, input) {
  const verdicts = [];

  verdicts.push(rangeVerdict('Oil gravity', input.gravityApi, method.gravity, '°API'));
  verdicts.push(rangeVerdict('Oil viscosity', input.viscosityCp, method.viscosity, 'cp'));
  verdicts.push(rangeVerdict('Oil saturation', input.oilSatPct, method.oilSat, '% PV'));

  if (method.formation) {
    const known = !!input.formation;
    const pass = known && method.formation.includes(input.formation);
    verdicts.push({
      criterion: 'Formation',
      status: known ? (pass ? 'pass' : 'fail') : 'na',
      required: method.formationNote || (method.formation.includes('carbonate')
        ? 'Sandstone or carbonate' : 'Sandstone preferred'),
      actual: input.formation || null,
    });
  } else {
    verdicts.push({ criterion: 'Formation', status: 'na', required: 'Not critical', actual: input.formation || null });
  }

  // Thickness: numeric minimum for thermal methods; advisory geometry
  // note for the gravity-stable gas methods (reported, not scored).
  if (method.thicknessRule && typeof method.thicknessRule === 'object') {
    verdicts.push(rangeVerdict('Net thickness', input.netThicknessFt, { min: method.thicknessRule.minFt }, 'ft'));
  } else {
    const note = method.thicknessRule === 'thin_unless_dipping'
      ? 'Thin unless dipping (advisory)'
      : method.thicknessRule === 'nc_if_dipping'
        ? 'Not critical if dipping (advisory)'
        : 'Not critical';
    verdicts.push({ criterion: 'Net thickness', status: 'na', required: note, actual: input.netThicknessFt ?? null, unit: 'ft' });
  }

  verdicts.push(rangeVerdict('Permeability', input.permeabilityMd, method.permeability, 'md'));
  verdicts.push(rangeVerdict('Depth', input.depthFt, method.depth, 'ft'));
  verdicts.push(rangeVerdict('Temperature', input.temperatureF, method.temperature, '°F'));

  const applicable = verdicts.filter((v) => v.status !== 'na');
  const passes = applicable.filter((v) => v.status === 'pass');
  const score = applicable.length > 0 ? passes.length / applicable.length : 0;

  return {
    id: method.id,
    name: method.name,
    group: method.group,
    composition: method.composition,
    verdicts,
    applicable: applicable.length,
    passes: passes.length,
    score,
    qualified: applicable.length > 0 && passes.length === applicable.length,
  };
}

/** Screen every method; qualified first, then by score. */
export function screenAllMethods(input) {
  return EOR_METHODS
    .map((m) => screenMethod(m, input))
    .sort((a, b) => (b.qualified - a.qualified) || (b.score - a.score) || a.name.localeCompare(b.name));
}

/** A light West-Texas-style CO2 candidate so the app is useful on first open. */
export function sampleEorScreeningData() {
  return {
    gravityApi: 32,
    viscosityCp: 2,
    oilSatPct: 45,
    formation: 'carbonate',
    netThicknessFt: 40,
    permeabilityMd: 25,
    depthFt: 5200,
    temperatureF: 105,
  };
}
