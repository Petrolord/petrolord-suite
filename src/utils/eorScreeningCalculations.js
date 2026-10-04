// EOR screening engine (R4, Reservoir-ROADMAP.md; EOR-U1 of the Reservoir
// upgrade round, docs/upgrade/EorScreening-UPGRADE.md).
//
// Encodes the published technical screening criteria of Taber, Martin and
// Seright (1997), read against the papers as printed (PRRC copies, see
// CRITERIA_EDITION): the summary Table 3 of Part 1 (SPE Reservoir
// Engineering, August 1997, p. 191) for every method, and the detail
// tables of Part 2 (pp. 199-205) where they sharpen it: CO2 minimum depth
// by oil gravity (Part 2, Table 3), "sandstones preferred" for the chemical
// floods (Part 2, Tables 4 and 5), the carbonate fracture-sweep note of the
// polymer flood (Part 1, Table 3, note b) and the transmissibility notes of
// combustion and steam (Part 1, Table 3, notes c and d). Every criterion
// carries the table it came from.
//
// Verdicts: 'pass', 'marginal' (the paper itself softens the limit: a
// preferred formation, a carbonate fracture sweep, a formation the table
// does not name), 'fail', and 'na' (not critical in the paper, or the
// input is blank; never assumed). A value exactly on a limit passes: the
// paper's ">" and "<" mark the side of the limit, and its own text treats
// them as soft ("this does not mean that the probability ... drops to zero
// at 34 API", Part 1, p. 192). Comparisons carry a relative tolerance of
// 1e-9 so a value typed in SI that lands on a limit after conversion is
// read as on the limit.
//
// Outcome per method: 'qualified' (every screened criterion passes),
// 'marginal' (no fail, at least one marginal), 'screened out' (any fail),
// 'not screened' (no criterion could be screened). Ranking: outcome in that
// order, then the share of screened criteria that pass, then the name. The
// underlined values of Table 3 (the approximate mean of the field projects
// of 1996) are printed for context and never scored.
//
// This is a SCREENING tool (candidate shortlisting), not a design or a
// prediction of recovery: the papers' own caveat (Part 2, Summary).
//
// All values in oilfield units: degAPI, cp, % PV, ft, md, degF.

export const CRITERIA_EDITION = Object.freeze({
  key: 'taber-1997',
  short: 'Taber, Martin and Seright (1997)',
  part1: 'Taber, J.J., Martin, F.D. and Seright, R.S.: "EOR Screening Criteria Revisited, Part 1: Introduction to Screening Criteria and Enhanced Recovery Field Projects", SPE Reservoir Engineering 12 (3), August 1997, 189-198 (SPE-35385-PA)',
  part2: 'Taber, J.J., Martin, F.D. and Seright, R.S.: "EOR Screening Criteria Revisited, Part 2: Applications and Impact of Oil Prices", SPE Reservoir Engineering 12 (3), August 1997, 199-205 (SPE-39234-PA)',
});

/** Where each criterion is printed. */
export const SRC = Object.freeze({
  T3: 'Part 1, Table 3 (p. 191)',
  T3a: 'Part 2, Table 3 (p. 200), CO2 depth by oil gravity',
  T3b: 'Part 1, Table 3, note b',
  T3c: 'Part 1, Table 3, note c',
  T3d: 'Part 1, Table 3, note d',
  P2T4: 'Part 2, Table 4 (p. 200)',
  P2T5: 'Part 2, Table 5 (p. 201)',
});

export const FORMATION_OPTIONS = [
  { value: 'sandstone', label: 'Sandstone' },
  { value: 'sand', label: 'Unconsolidated sand' },
  { value: 'carbonate', label: 'Carbonate' },
  { value: 'other', label: 'Other lithology' },
];
export const formationLabel = (v) => FORMATION_OPTIONS.find((o) => o.value === v)?.label || null;

// formation rules: pass, marginal (with the reason), fail
const GAS_FORMATION = {
  required: 'Sandstone or carbonate',
  pass: ['sandstone', 'sand', 'carbonate'],
  marginal: { other: 'The table names sandstone or carbonate only; another lithology is not covered.' },
  source: SRC.T3,
};
const CHEM_FORMATION = (source, carbonateWords) => ({
  required: 'Sandstone preferred',
  pass: ['sandstone', 'sand'],
  marginal: { carbonate: carbonateWords, other: 'Sandstone is preferred; another lithology is not covered.' },
  source,
});
const THERMAL_FORMATION = {
  required: 'High-porosity sand or sandstone',
  pass: ['sandstone', 'sand'],
  marginal: {},
  source: SRC.T3,
};

export const EOR_METHODS = [
  {
    id: 'nitrogen',
    name: 'Nitrogen & flue gas',
    group: 'Gas injection (miscible)',
    composition: 'High percent of C1 to C7',
    gravity: { min: 35, average: 48 },
    viscosity: { max: 0.4, average: 0.2 },
    oilSat: { min: 40, average: 75 },
    formation: GAS_FORMATION,
    thicknessRule: 'thin_unless_dipping',
    permeability: null,
    depth: { min: 6000 },
    temperature: null,
  },
  {
    id: 'hydrocarbon',
    name: 'Hydrocarbon miscible',
    group: 'Gas injection (miscible)',
    composition: 'High percent of C2 to C7',
    gravity: { min: 23, average: 41 },
    viscosity: { max: 3, average: 0.5 },
    oilSat: { min: 30, average: 80 },
    formation: GAS_FORMATION,
    thicknessRule: 'thin_unless_dipping',
    permeability: null,
    depth: { min: 4000 },
    temperature: null,
  },
  {
    id: 'co2',
    name: 'CO2 miscible',
    group: 'Gas injection (miscible)',
    composition: 'High percent of C5 to C12',
    gravity: { min: 22, average: 36 },
    viscosity: { max: 10, average: 1.5 },
    oilSat: { min: 20, average: 55 },
    formation: GAS_FORMATION,
    thicknessRule: 'wide_range',
    permeability: null,
    depth: { min: 2500 },
    depthByGravity: true,
    temperature: null,
  },
  {
    id: 'immiscible',
    name: 'Immiscible gases',
    group: 'Gas injection',
    composition: 'Not critical',
    gravity: { min: 12 },
    viscosity: { max: 600 },
    oilSat: { min: 35, average: 70 },
    formation: null,
    thicknessRule: 'nc_if_dipping',
    permeability: null,
    depth: { min: 1800 },
    temperature: null,
  },
  {
    id: 'chemical',
    name: 'Micellar/polymer, ASP & alkaline',
    group: '(Enhanced) waterflooding',
    composition: 'Light, intermediate; some organic acids for alkaline floods',
    gravity: { min: 20, average: 35 },
    viscosity: { max: 35, average: 13 },
    oilSat: { min: 35, average: 53 },
    formation: CHEM_FORMATION(SRC.P2T4, 'Sandstones are preferred (Part 2, Table 4); anhydrite, gypsum and clays, common in carbonates, are undesirable.'),
    thicknessRule: null,
    permeability: { min: 10, average: 450 },
    // printed "> 9,000 \ 3,250" and "> 200 \ 80" in Part 1, Table 3; read
    // as upper limits with Part 2, Table 4: "< about 9,000 ft", "< 200 F"
    depth: { max: 9000, average: 3250, source: SRC.P2T4, note: 'Printed "> 9,000" in Part 1, Table 3; Part 2, Table 4 gives "< about 9,000 ft".' },
    temperature: { max: 200, average: 80, source: SRC.P2T4, note: 'Printed "> 200" in Part 1, Table 3; Part 2, Table 4 gives "< 200 F".' },
  },
  {
    id: 'polymer',
    name: 'Polymer flooding',
    group: '(Enhanced) waterflooding',
    composition: 'Not critical',
    gravity: { min: 15 },
    // the paper's window: too thin an oil needs no mobility control
    viscosity: { min: 10, max: 150 },
    oilSat: { min: 50, average: 80 },
    formation: CHEM_FORMATION(SRC.P2T5, 'Sandstones are preferred but polymer can be used in carbonates (Part 2, Table 5).'),
    thicknessRule: null,
    permeability: { min: 10, average: 800, carbonateFractureMin: 3 },
    depth: { max: 9000 },
    temperature: { max: 200, average: 140, source: SRC.P2T5, note: 'Printed "> 200" in Part 1, Table 3; Part 2, Table 5 gives "< 200 to minimize degradation".' },
  },
  {
    id: 'combustion',
    name: 'In-situ combustion',
    group: 'Thermal',
    composition: 'Some asphaltic components',
    gravity: { min: 10, average: 16 },
    viscosity: { max: 5000, average: 1200 },
    oilSat: { min: 50, average: 72 },
    formation: THERMAL_FORMATION,
    thicknessRule: { minFt: 10 },
    permeability: { min: 50 },
    transmissibility: { min: 20, source: SRC.T3c },
    depth: { max: 11500, average: 3500 },
    temperature: { min: 100, average: 135 },
  },
  {
    id: 'steam',
    name: 'Steam flooding',
    group: 'Thermal',
    composition: 'Not critical',
    gravity: { min: 8, average: 13.5 },
    viscosity: { max: 200000, average: 4700 },
    oilSat: { min: 40, average: 66 },
    formation: THERMAL_FORMATION,
    thicknessRule: { minFt: 20 },
    permeability: { min: 200, average: 2540 },
    transmissibility: { min: 50, source: SRC.T3d },
    depth: { max: 4500, average: 1500 },
    temperature: null,
  },
];

/**
 * EOR-U2-006: the range of the field projects of each method, as printed in
 * the "Range of Current Projects" column of Part 2, Tables 1 to 7 (pp. 200
 * to 203), read from the page images. Context only: never scored. Part 2
 * prints no range for the chemical floods (Table 4) and has no immiscible
 * gas table. Oilfield units, as printed.
 */
const pr = (table, page, criteria) => Object.freeze({ source: `Part 2, Table ${table} (p. ${page}), Range of Current Projects`, criteria: Object.freeze(criteria) });
export const PROJECT_RANGES = Object.freeze({
  nitrogen: pr(1, 200, { gravity: { min: 38, max: 54, note: 'miscible projects' }, viscosity: { min: 0.07, max: 0.3 }, oilSat: { min: 59, max: 80 }, depth: { min: 10000, max: 18500 } }),
  hydrocarbon: pr(2, 200, { gravity: { min: 24, max: 54, note: 'miscible projects' }, viscosity: { min: 0.04, max: 2.3 }, oilSat: { min: 30, max: 98 }, depth: { min: 4040, max: 15900 } }),
  co2: pr(3, 201, { gravity: { min: 27, max: 44 }, viscosity: { min: 0.3, max: 6 }, oilSat: { min: 15, max: 70 } }),
  polymer: pr(5, 202, { gravity: { min: 14, max: 43 }, viscosity: { min: 1, max: 80 }, oilSat: { min: 50, max: 92 }, permeability: { min: 10, max: 15000 }, depth: { min: 1300, max: 9600 }, temperature: { min: 80, max: 185 } }),
  combustion: pr(6, 203, { gravity: { min: 10, max: 40 }, viscosity: { min: 6, max: 5000 }, oilSat: { min: 62, max: 94 }, permeability: { min: 85, max: 4000 }, depth: { min: 400, max: 11300 }, temperature: { min: 100, max: null, note: 'printed "100 to 22"' } }),
  steam: pr(7, 203, { gravity: { min: 8, max: 27 }, viscosity: { min: 10, max: 137000 }, oilSat: { min: 35, max: 90 }, permeability: { min: 63, max: 10000 }, depth: { min: 150, max: 4500 }, temperature: { min: 60, max: 280 } }),
});

/** CO2 miscible: the minimum depth for an oil gravity (Part 2, Table 3). null below 22 API (fails miscible). */
export const CO2_DEPTH_BY_GRAVITY = Object.freeze([
  { minApi: 40, depthFt: 2500, band: 'above 40 API' },
  { minApi: 32, depthFt: 2800, band: '32 to 39.9 API' },
  { minApi: 28, depthFt: 3300, band: '28 to 31.9 API' },
  { minApi: 22, depthFt: 4000, band: '22 to 27.9 API' },
]);
export function co2MinDepthFt(gravityApi) {
  if (!Number.isFinite(gravityApi)) return null;
  // the paper prints "> 40" for the first band and "32 to 39.9" for the next: 40.0 falls in neither; read as the 2,500 ft band
  const row = CO2_DEPTH_BY_GRAVITY.find((r) => gravityApi >= r.minApi - 1e-9);
  return row || null;
}

const isNum = (v) => Number.isFinite(v);
const EPS = 1e-9;
/** a >= b with a relative tolerance */
export const atLeast = (a, b) => a >= b - EPS * Math.max(1, Math.abs(b));
/** a <= b with a relative tolerance */
export const atMost = (a, b) => a <= b + EPS * Math.max(1, Math.abs(b));

/** Criterion keys, in screen order, with the unit kind of their numbers. */
export const CRITERIA = Object.freeze([
  { key: 'gravity', label: 'Oil gravity', kind: 'api', input: 'gravityApi' },
  { key: 'viscosity', label: 'Oil viscosity', kind: 'viscosity', input: 'viscosityCp' },
  { key: 'oilSat', label: 'Oil saturation', kind: 'saturation', input: 'oilSatPct' },
  { key: 'formation', label: 'Formation', kind: null, input: 'formation' },
  { key: 'thickness', label: 'Net thickness', kind: 'thickness', input: 'netThicknessFt' },
  { key: 'permeability', label: 'Permeability', kind: 'permeability', input: 'permeabilityMd' },
  { key: 'transmissibility', label: 'Transmissibility kh/mu', kind: 'transmissibility', input: null },
  { key: 'depth', label: 'Depth', kind: 'depth', input: 'depthFt' },
  { key: 'temperature', label: 'Temperature', kind: 'temperature', input: 'temperatureF' },
]);
const CRIT = Object.fromEntries(CRITERIA.map((c) => [c.key, c]));

const base = (key, extra) => ({ criterion: CRIT[key].label, key, kind: CRIT[key].kind, ...extra });

function rangeVerdict(key, actual, spec, source = SRC.T3) {
  if (!spec) return base(key, { status: 'na', notCritical: true, spec: null, actual: isNum(actual) ? actual : null, source, reason: 'Not critical for this method.' });
  const src = spec.source || source;
  const s = { min: spec.min ?? null, max: spec.max ?? null };
  if (!isNum(actual)) return base(key, { status: 'na', spec: s, average: spec.average ?? null, actual: null, source: src, note: spec.note, reason: 'Not screened: no value given.' });
  const lowOk = s.min == null || atLeast(actual, s.min);
  const highOk = s.max == null || atMost(actual, s.max);
  return base(key, {
    status: lowOk && highOk ? 'pass' : 'fail',
    spec: s,
    average: spec.average ?? null,
    actual,
    side: !lowOk ? 'below' : !highOk ? 'above' : null,
    source: src,
    note: spec.note,
  });
}

/** Screen one method against the reservoir and fluid inputs (oilfield units). */
export function screenMethod(method, input) {
  const verdicts = [];
  verdicts.push(rangeVerdict('gravity', input.gravityApi, method.gravity));
  verdicts.push(rangeVerdict('viscosity', input.viscosityCp, method.viscosity));
  verdicts.push(rangeVerdict('oilSat', input.oilSatPct, method.oilSat));

  // formation
  const f = method.formation;
  if (!f) {
    verdicts.push(base('formation', { status: 'na', notCritical: true, required: 'Not critical', actual: input.formation || null, source: SRC.T3, reason: 'Not critical for this method.' }));
  } else if (!input.formation) {
    verdicts.push(base('formation', { status: 'na', required: f.required, actual: null, source: f.source, reason: 'Not screened: no formation given.' }));
  } else if (f.pass.includes(input.formation)) {
    verdicts.push(base('formation', { status: 'pass', required: f.required, actual: input.formation, source: f.source }));
  } else if (f.marginal[input.formation]) {
    verdicts.push(base('formation', { status: 'marginal', required: f.required, actual: input.formation, source: f.source, reason: f.marginal[input.formation] }));
  } else {
    verdicts.push(base('formation', { status: 'fail', required: f.required, actual: input.formation, source: f.source }));
  }

  // thickness: a numeric minimum for the thermal methods; the geometry
  // words of the gas methods are advisory (printed, never scored)
  if (method.thicknessRule && typeof method.thicknessRule === 'object') {
    verdicts.push(rangeVerdict('thickness', input.netThicknessFt, { min: method.thicknessRule.minFt }));
  } else {
    const words = {
      thin_unless_dipping: 'Thin unless dipping (advisory, not scored)',
      nc_if_dipping: 'Not critical if dipping and/or good vertical permeability (advisory, not scored)',
      wide_range: 'Wide range (not scored)',
    }[method.thicknessRule] || 'Not critical';
    verdicts.push(base('thickness', { status: 'na', notCritical: true, advisory: method.thicknessRule != null, required: words, actual: isNum(input.netThicknessFt) ? input.netThicknessFt : null, source: SRC.T3, reason: method.thicknessRule ? 'Advisory in the paper; not scored.' : 'Not critical for this method.' }));
  }

  // permeability, with the polymer carbonate fracture-sweep note
  const perm = rangeVerdict('permeability', input.permeabilityMd, method.permeability);
  const fracMin = method.permeability?.carbonateFractureMin;
  if (perm.status === 'fail' && fracMin != null && input.formation === 'carbonate' && atLeast(input.permeabilityMd, fracMin)) {
    perm.status = 'marginal';
    perm.reason = `Above ${fracMin} md: the paper allows this in some carbonate reservoirs if the intent is to sweep only the fracture system (${SRC.T3b}).`;
    perm.source = `${SRC.T3}; ${SRC.T3b}`;
  }
  verdicts.push(perm);

  // transmissibility kh/mu (notes c and d), only where the paper sets one
  if (method.transmissibility) {
    const k = input.permeabilityMd; const h = input.netThicknessFt; const mu = input.viscosityCp;
    const t = isNum(k) && isNum(h) && isNum(mu) && mu > 0 ? (k * h) / mu : null;
    const v = rangeVerdict('transmissibility', t, { min: method.transmissibility.min, source: method.transmissibility.source });
    if (t == null) v.reason = 'Not screened: needs permeability, net thickness and viscosity.';
    v.derived = true;
    verdicts.push(v);
  }

  // depth, with CO2 miscible minimum depth by oil gravity
  if (method.depthByGravity) {
    const row = co2MinDepthFt(input.gravityApi);
    if (!isNum(input.gravityApi)) {
      const v = rangeVerdict('depth', input.depthFt, method.depth);
      v.reason = v.status === 'na' ? v.reason : 'Oil gravity not given: the summary minimum of Part 1, Table 3 is used (Part 2, Table 3 raises it for heavier oils).';
      verdicts.push(v);
    } else if (!row) {
      verdicts.push(base('depth', { status: 'na', spec: null, actual: isNum(input.depthFt) ? input.depthFt : null, source: SRC.T3a, reason: 'Below 22 API CO2 fails miscible at any depth; screen for immiscible gas (Part 2, Table 3).' }));
    } else {
      const v = rangeVerdict('depth', input.depthFt, { min: row.depthFt, source: SRC.T3a });
      v.band = row.band;
      verdicts.push(v);
    }
  } else {
    verdicts.push(rangeVerdict('depth', input.depthFt, method.depth));
  }

  verdicts.push(rangeVerdict('temperature', input.temperatureF, method.temperature));

  const applicable = verdicts.filter((v) => v.status !== 'na');
  const passes = applicable.filter((v) => v.status === 'pass').length;
  const marginals = applicable.filter((v) => v.status === 'marginal').length;
  const fails = applicable.filter((v) => v.status === 'fail').length;
  const unscored = verdicts.filter((v) => v.status === 'na' && !v.notCritical).length;
  const score = applicable.length > 0 ? passes / applicable.length : 0;
  let outcome = 'not screened';
  if (applicable.length) outcome = fails ? 'screened out' : marginals ? 'marginal' : 'qualified';

  return {
    id: method.id,
    name: method.name,
    group: method.group,
    composition: method.composition,
    verdicts,
    applicable: applicable.length,
    passes,
    marginals,
    fails,
    unscored,
    score,
    outcome,
    qualified: outcome === 'qualified',
  };
}

export const OUTCOME_ORDER = Object.freeze({ qualified: 0, marginal: 1, 'screened out': 2, 'not screened': 3 });
export const RANKING_BASIS = 'Methods are ranked by outcome (qualified, then marginal, then screened out), then by the share of screened criteria that pass, then by name. Marginal verdicts do not count as passes. Criteria the paper marks not critical, advisory geometry notes and blank inputs are not screened and do not count.';

/** Screen every method, ranked (RANKING_BASIS). */
export function screenAllMethods(input) {
  return EOR_METHODS
    .map((m) => screenMethod(m, input))
    .sort((a, b) => (OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome]) || (b.score - a.score) || a.name.localeCompare(b.name));
}

/** "> 22", "< 4,500", "10 to 150" in the numbers given (no unit). */
export const describeRange = (spec, unit = '') => {
  const u = unit ? ` ${unit}` : '';
  if (!spec) return 'Not critical';
  if (spec.min != null && spec.max != null) return `${spec.min} to ${spec.max}${u}`;
  if (spec.min != null) return `> ${spec.min}${u}`;
  if (spec.max != null) return `< ${spec.max}${u}`;
  return 'Not critical';
};

/** The engine input from the stored form (oilfield numbers as strings): blanks stay null. */
export function engineInputOf(form = {}) {
  const n = (v) => {
    if (v == null || String(v).trim() === '') return null;
    const x = Number(String(v).trim());
    return Number.isFinite(x) ? x : null;
  };
  return {
    gravityApi: n(form.gravityApi),
    viscosityCp: n(form.viscosityCp),
    oilSatPct: n(form.oilSatPct),
    formation: form.formation || null,
    netThicknessFt: n(form.netThicknessFt),
    permeabilityMd: n(form.permeabilityMd),
    depthFt: n(form.depthFt),
    temperatureF: n(form.temperatureF),
  };
}

/** A light West-Texas-style carbonate CO2 candidate (illustrative, not a real field). */
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
