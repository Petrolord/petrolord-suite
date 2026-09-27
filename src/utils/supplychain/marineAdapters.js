// Marine Logistics Planner adapters (Supply Chain SC4).
//
// Everything between the page state and the vendored marine logistics engine
// (packages/engines/engines/supplychain/marineLogistics.js) lives here, so the
// views hold no arithmetic of their own. The rules:
//
//   * No hidden defaults. Every engine input is a visible control in the page
//     state. A blank control is passed to the engine as absent, and the
//     engine's refusal (its `error` string) is shown to the user verbatim.
//   * No engine math here. These functions only reshape typed values into the
//     engine's named arguments and call it.
//   * The Ekene demo is the engines repo fixture
//     (test-data/supplychain/ekene-marine/marine.json), read as it is, so the
//     app, the engine gate and the NextGen course all run the same data.
import ekeneMarine from '../../../packages/engines/test-data/supplychain/ekene-marine/marine.json';
import vendor from '../../../packages/engines/VENDOR.json';
import {
  voyagePlan, fleetSize, fleetVariability, deckPlan, shoreBase, ACTIVITIES, ACCEPTED_KEYS,
} from '@/utils/supplychain/engine/marineLogistics';

export const EKENE_MARINE = ekeneMarine;
export const SCHEMA_VERSION = 1;
/** The petrolord-engines commit this build runs, read from the vendoring pin. */
export const ENGINE_COMMIT = vendor.canonical.commit;
export { ACTIVITIES };

/** The two packing rules the deck plan compares, in the order shown. */
export const DECK_RULES = [
  { rule: 'first-fit-decreasing-area', key: 'ffd', label: 'First-fit decreasing by area' },
  { rule: 'first-fit', key: 'ff', label: 'First fit in the booked order' },
];

// ---- typed values ----------------------------------------------------------

/**
 * A typed value as the engine should see it: blank is absent (undefined), a
 * number stays a number, text is read with Number(). Text that is not a
 * number becomes NaN, which the engine refuses by name.
 */
export const toNum = (v) => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s === '') return undefined;
  return Number(s);
};

const text = (v) => (v === undefined || v === null ? '' : String(v));
const nonBlank = (v) => (text(v).trim() === '' ? undefined : text(v).trim());
const isObj = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const named = (x) => (nonBlank(x.name) === undefined ? {} : { name: x.name });

// ---- the inputs ------------------------------------------------------------

const blankCargo = () => ({ deckAreaM2: '', deckWeightT: '', bulk: {} });
const blankTri = () => ({ min: '', mode: '', max: '' });

export const blankVessel = (key = '') => ({
  key,
  name: '',
  speedKnots: '',
  deckAreaM2: '',
  deckUsableFraction: '',
  deckLoadT: '',
  deadweightT: '',
  tanks: {},
  fuelTPerHour: { sailing: '', port: '', field: '' },
});

export const blankInstallation = (id = '') => ({
  id, name: '', distanceFromBaseNm: '', fieldHours: '', minVisits: '', demand: blankCargo(), cargo: blankCargo(),
});

export const blankDeckItem = (id = '') => ({
  id, name: '', lengthM: '', widthM: '', weightT: '', quantity: '',
});

/** The voyage settings a fleet calculation reads, blank. */
const blankFleetSettings = () => ({
  vessel: '',
  mode: '',
  portHours: '',
  appliesTo: [],
  fuelPricePerT: '',
  periodDays: '',
  vesselAvailableDays: '',
  voyageRounding: '',
  vesselRounding: '',
});

/** A new study: an empty cluster and every control blank. */
export const defaultInputs = () => ({
  cluster: {
    source: null,
    title: '',
    products: [],
    vessels: [],
    installations: [],
    milkRun: { stops: [], legsNm: [] },
  },
  voyage: {
    vessel: '', mode: '', portHours: '', weatherFactor: '', appliesTo: [], fuelPricePerT: '',
  },
  fleet: { ...blankFleetSettings(), weatherFactor: '' },
  variability: {
    ...blankFleetSettings(),
    weatherMode: '',
    weatherFixed: '',
    weatherTri: blankTri(),
    demandMode: '',
    demandFixed: '',
    demandTri: blankTri(),
    plannedVessels: '',
    iterations: '',
    seed: '',
  },
  deck: {
    name: '', areaM2: '', usableFraction: '', loadT: '', voyages: '', items: [],
  },
  shore: {
    berths: '',
    arrivalsPerDay: '',
    workingHoursPerDay: '',
    fixedHours: '',
    lifts: '',
    liftsPerHour: '',
    bulkM3: '',
    bulkM3PerHour: '',
    concurrent: '',
    model: '',
    targetMeanWaitHours: '',
  },
});

const cargoState = (c) => (isObj(c) ? {
  deckAreaM2: c.deckAreaM2 ?? '', deckWeightT: c.deckWeightT ?? '', bulk: isObj(c.bulk) ? { ...c.bulk } : {},
} : blankCargo());

const vesselState = (key, v) => ({
  key,
  name: text(v.name),
  speedKnots: v.speedKnots ?? '',
  deckAreaM2: v.deckAreaM2 ?? '',
  deckUsableFraction: v.deckUsableFraction ?? '',
  deckLoadT: v.deckLoadT ?? '',
  deadweightT: v.deadweightT ?? '',
  tanks: isObj(v.tanks) ? { ...v.tanks } : {},
  fuelTPerHour: {
    sailing: v.fuelTPerHour?.sailing ?? '',
    port: v.fuelTPerHour?.port ?? '',
    field: v.fuelTPerHour?.field ?? '',
  },
});

const triState = (d) => (isObj(d) ? { min: d.min ?? '', mode: d.mode ?? '', max: d.max ?? '' } : blankTri());
const distMode = (d) => (d === undefined ? '' : isObj(d) ? 'triangular' : 'fixed');

/**
 * A data set in the Ekene fixture's shape placed into the inputs. The cluster
 * keys (products, vessels, installations, milkRun) and the deck keys (deck,
 * deckItems) replace what they name; each planning key that is present
 * (portHours, weather, fuelPricePerT, period, variability, shoreBase) fills
 * the controls it states and leaves the rest as they are.
 */
export const applyDataSet = (fx, prev, source) => {
  const out = JSON.parse(JSON.stringify(prev));
  const c = out.cluster;
  c.source = source;
  if (fx.title !== undefined) c.title = text(fx.title);
  if (Array.isArray(fx.products)) {
    c.products = fx.products.map((p) => ({
      id: text(p.id), name: text(p.name), kind: text(p.kind), densityTPerM3: p.densityTPerM3 ?? '',
    }));
  }
  if (fx.vessels !== undefined) {
    c.vessels = Array.isArray(fx.vessels)
      ? fx.vessels.map((v, i) => vesselState(text(v.key) || `vessel-${i + 1}`, v))
      : Object.entries(fx.vessels).map(([k, v]) => vesselState(k, v));
  }
  if (Array.isArray(fx.installations)) {
    c.installations = fx.installations.map((x) => ({
      id: text(x.id),
      name: text(x.name),
      distanceFromBaseNm: x.distanceFromBaseNm ?? '',
      fieldHours: x.fieldHours ?? '',
      minVisits: x.minVisits ?? '',
      demand: cargoState(x.demand),
      cargo: cargoState(x.voyageCargo),
    }));
  }
  if (isObj(fx.milkRun)) {
    c.milkRun = {
      stops: Array.isArray(fx.milkRun.stops) ? fx.milkRun.stops.map(text) : [],
      legsNm: Array.isArray(fx.milkRun.legsNm) ? [...fx.milkRun.legsNm] : [],
    };
  }
  if (isObj(fx.deck)) {
    out.deck = {
      ...out.deck,
      name: text(fx.deck.name),
      areaM2: fx.deck.areaM2 ?? '',
      usableFraction: fx.deck.usableFraction ?? '',
      loadT: fx.deck.loadT ?? '',
    };
  }
  if (Array.isArray(fx.deckItems)) {
    out.deck.items = fx.deckItems.map((x) => ({
      id: text(x.id), name: text(x.name), lengthM: x.lengthM ?? '', widthM: x.widthM ?? '', weightT: x.weightT ?? '', quantity: x.quantity ?? '',
    }));
  }
  const both = (patch) => {
    Object.assign(out.voyage, patch);
    Object.assign(out.fleet, patch);
    Object.assign(out.variability, patch);
  };
  if (fx.portHours !== undefined) both({ portHours: fx.portHours });
  if (fx.fuelPricePerT !== undefined) both({ fuelPricePerT: fx.fuelPricePerT });
  if (isObj(fx.weather)) {
    if (fx.weather.appliesTo !== undefined) both({ appliesTo: Array.isArray(fx.weather.appliesTo) ? [...fx.weather.appliesTo] : [] });
    if (fx.weather.factor !== undefined) {
      out.voyage.weatherFactor = fx.weather.factor;
      out.fleet.weatherFactor = fx.weather.factor;
    }
  }
  if (isObj(fx.period)) {
    for (const k of ['periodDays', 'vesselAvailableDays']) {
      if (fx.period[k] !== undefined) { out.fleet[k] = fx.period[k]; out.variability[k] = fx.period[k]; }
    }
  }
  if (isObj(fx.variability)) {
    const v = fx.variability;
    const s = out.variability;
    if (v.weatherFactor !== undefined) {
      s.weatherMode = distMode(v.weatherFactor);
      s.weatherFixed = isObj(v.weatherFactor) ? '' : v.weatherFactor;
      s.weatherTri = triState(v.weatherFactor);
    }
    if (v.demandFactor !== undefined) {
      s.demandMode = distMode(v.demandFactor);
      s.demandFixed = isObj(v.demandFactor) ? '' : v.demandFactor;
      s.demandTri = triState(v.demandFactor);
    }
    for (const k of ['plannedVessels', 'iterations', 'seed']) if (v[k] !== undefined) s[k] = v[k];
  }
  if (isObj(fx.shoreBase)) {
    const b = fx.shoreBase;
    const s = out.shore;
    for (const k of ['berths', 'arrivalsPerDay', 'workingHoursPerDay']) if (b[k] !== undefined) s[k] = b[k];
    if (isObj(b.service)) {
      for (const k of ['fixedHours', 'lifts', 'liftsPerHour', 'bulkM3', 'bulkM3PerHour']) if (b.service[k] !== undefined) s[k] = b.service[k];
      if (typeof b.service.concurrent === 'boolean') s.concurrent = String(b.service.concurrent);
    }
  }
  return out;
};

/**
 * The Ekene demo: the fixture placed into the controls exactly as written,
 * plus the choices the fixture leaves to the planner, each stated here and
 * shown in its control: the PSV on the milk run, whole voyages and whole
 * vessels rounded up, one deck voyage, and the M/M/c model with a one-hour
 * target (the engine's Ekene cases).
 */
export const EKENE_CHOICES = Object.freeze({
  vessel: 'psv',
  mode: 'milk-run',
  voyageRounding: 'up',
  vesselRounding: 'up',
  deckVoyages: 1,
  model: 'M/M/c',
  targetMeanWaitHours: 1,
});

export const ekeneDemoInputs = (fx = EKENE_MARINE) => {
  const out = applyDataSet(fx, defaultInputs(), 'ekene');
  const ch = EKENE_CHOICES;
  for (const s of [out.voyage, out.fleet, out.variability]) {
    s.vessel = ch.vessel;
    s.mode = ch.mode;
  }
  for (const s of [out.fleet, out.variability]) {
    s.voyageRounding = ch.voyageRounding;
    s.vesselRounding = ch.vesselRounding;
  }
  out.deck.voyages = ch.deckVoyages;
  out.shore.model = ch.model;
  out.shore.targetMeanWaitHours = ch.targetMeanWaitHours;
  return out;
};

/** A saved payload back to inputs, or null when it is not one of ours. */
export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : null;
  if (!raw || !isObj(raw.cluster) || !Array.isArray(raw.cluster.installations)) return null;
  const base = defaultInputs();
  const out = { ...base };
  for (const k of Object.keys(base)) {
    if (isObj(raw[k])) out[k] = { ...base[k], ...raw[k] };
  }
  return out;
};

// ---- importing a data set --------------------------------------------------

// The keys a pasted JSON data set may carry, level by level. A key the planner
// does not read is refused by name, so nothing typed is dropped silently. The
// vessel, product and deck item keys are the engine's own accepted keys.
const engineKeys = (spec) => spec.keys;
const CARGO_KEYS = ['deckAreaM2', 'deckWeightT', 'bulk'];
const DATA_KEYS = {
  top: ['title', 'synthetic', 'generatedBy', 'products', 'vessels', 'installations', 'milkRun', 'portHours', 'weather', 'fuelPricePerT', 'period', 'variability', 'deck', 'deckItems', 'shoreBase'],
  product: engineKeys(ACCEPTED_KEYS.voyagePlan.children.products.of),
  vessel: engineKeys(ACCEPTED_KEYS.voyagePlan.children.vessel),
  installation: ['id', 'name', 'distanceFromBaseNm', 'fieldHours', 'minVisits', 'demand', 'voyageCargo'],
  milkRun: ['mode', 'stops', 'legsNm'],
  weather: ['factor', 'appliesTo', 'note'],
  period: ['periodDays', 'vesselAvailableDays', 'note'],
  variability: ['weatherFactor', 'demandFactor', 'plannedVessels', 'iterations', 'seed'],
  deck: engineKeys(ACCEPTED_KEYS.deckPlan.children.deck),
  deckItem: engineKeys(ACCEPTED_KEYS.deckPlan.children.items.of),
  shoreBase: ['name', 'berths', 'arrivalsPerDay', 'workingHoursPerDay', 'service'],
  service: engineKeys(ACCEPTED_KEYS.shoreBase.children.service),
};

const extraKey = (obj, keys, where) => {
  if (!isObj(obj)) return null;
  const k = Object.keys(obj).find((x) => !keys.includes(x));
  return k === undefined ? null : `${where} has the key "${k}", which the planner does not read. The keys are ${keys.join(', ')}.`;
};

/** Check a pasted data set's keys at every level the planner reads. */
export const checkDataSetKeys = (fx) => {
  if (!isObj(fx)) return 'The JSON needs an object in the Ekene data set\'s shape.';
  const checks = [extraKey(fx, DATA_KEYS.top, 'The data set')];
  (Array.isArray(fx.products) ? fx.products : []).forEach((p, i) => checks.push(extraKey(p, DATA_KEYS.product, `products[${i}]`)));
  const vessels = Array.isArray(fx.vessels) ? fx.vessels.map((v, i) => [`vessels[${i}]`, v, [...DATA_KEYS.vessel, 'key']])
    : isObj(fx.vessels) ? Object.entries(fx.vessels).map(([k, v]) => [`vessels.${k}`, v, DATA_KEYS.vessel]) : [];
  vessels.forEach(([where, v, keys]) => {
    checks.push(extraKey(v, keys, where));
    if (isObj(v)) checks.push(extraKey(v.fuelTPerHour, ACTIVITIES, `${where}.fuelTPerHour`));
  });
  (Array.isArray(fx.installations) ? fx.installations : []).forEach((x, i) => {
    checks.push(extraKey(x, DATA_KEYS.installation, `installations[${i}]`));
    if (isObj(x)) {
      checks.push(extraKey(x.demand, CARGO_KEYS, `installations[${i}].demand`));
      checks.push(extraKey(x.voyageCargo, CARGO_KEYS, `installations[${i}].voyageCargo`));
    }
  });
  checks.push(extraKey(fx.milkRun, DATA_KEYS.milkRun, 'milkRun'));
  checks.push(extraKey(fx.weather, DATA_KEYS.weather, 'weather'));
  checks.push(extraKey(fx.period, DATA_KEYS.period, 'period'));
  checks.push(extraKey(fx.variability, DATA_KEYS.variability, 'variability'));
  if (isObj(fx.variability)) {
    checks.push(extraKey(fx.variability.weatherFactor, ['min', 'mode', 'max'], 'variability.weatherFactor'));
    checks.push(extraKey(fx.variability.demandFactor, ['min', 'mode', 'max'], 'variability.demandFactor'));
  }
  checks.push(extraKey(fx.deck, DATA_KEYS.deck, 'deck'));
  (Array.isArray(fx.deckItems) ? fx.deckItems : []).forEach((x, i) => checks.push(extraKey(x, DATA_KEYS.deckItem, `deckItems[${i}]`)));
  checks.push(extraKey(fx.shoreBase, DATA_KEYS.shoreBase, 'shoreBase'));
  if (isObj(fx.shoreBase)) checks.push(extraKey(fx.shoreBase.service, DATA_KEYS.service, 'shoreBase.service'));
  for (const k of ['products', 'installations', 'deckItems']) {
    if (fx[k] !== undefined && !Array.isArray(fx[k])) checks.push(`${k} must be an array.`);
  }
  return checks.find(Boolean) || null;
};

/** A data set pasted as JSON in the Ekene fixture's shape. */
export const parseDataSetJson = (textIn) => {
  let data;
  try { data = JSON.parse(textIn); } catch (e) { return { error: `The JSON could not be read: ${e.message}` }; }
  const bad = checkDataSetKeys(data);
  if (bad) return { error: bad };
  return { dataSet: data };
};

/** One CSV record split on the delimiter, honouring double quotes. */
const splitCsvLine = (line, delim) => {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
};

const csvRows = (textIn) => {
  const lines = String(textIn || '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return { error: 'A pasted table needs a header row and at least one data row.' };
  const head = lines[0];
  const delim = head.includes('\t') ? '\t' : head.includes(';') && !head.includes(',') ? ';' : ',';
  const cols = splitCsvLine(head, delim);
  const rows = [];
  for (let r = 1; r < lines.length; r += 1) {
    const cells = splitCsvLine(lines[r], delim);
    if (cells.length > cols.length) return { error: `Row ${r + 1} has ${cells.length} cells against ${cols.length} columns in the header.` };
    rows.push(cells);
  }
  return { cols, rows };
};

const INSTALLATION_FIELDS = ['distanceFromBaseNm', 'fieldHours', 'minVisits'];
const CARGO_FIELDS = ['deckAreaM2', 'deckWeightT'];
const keyOf = (s) => s.replace(/[\s_-]/g, '').toLowerCase();
const FIELD_BY_KEY = Object.fromEntries(['id', 'name', ...INSTALLATION_FIELDS].map((f) => [keyOf(f), f]));
const CARGO_BY_KEY = Object.fromEntries(CARGO_FIELDS.map((f) => [keyOf(f), f]));
export const INSTALLATION_CSV_HELP = 'id, name, distanceFromBaseNm, fieldHours, minVisits, demand_deckAreaM2, demand_deckWeightT, '
  + 'demand_<product id> (m3 a period), cargo_deckAreaM2, cargo_deckWeightT and cargo_<product id> (m3 on one voyage)';

/**
 * Installations pasted as CSV (comma, tab or semicolon separated, first row
 * the header). Demand is a period's demand for fleet sizing; cargo is one
 * voyage's cargo for the voyage plan. A column the planner does not read is
 * refused by name, so a misspelt header is never dropped silently.
 */
export const parseInstallationsCsv = (textIn) => {
  const t = csvRows(textIn);
  if (t.error) return t;
  const map = [];
  for (const c of t.cols) {
    const m = c.match(/^(demand|cargo)[._:\s-](.+)$/i);
    if (m) {
      const part = m[1].toLowerCase();
      const rest = m[2].trim();
      const f = CARGO_BY_KEY[keyOf(rest)];
      map.push(f ? { part, field: f } : { part, product: rest });
    } else if (FIELD_BY_KEY[keyOf(c)]) map.push({ field: FIELD_BY_KEY[keyOf(c)] });
    else return { error: `Column "${c}" is not one the planner reads. The columns are ${INSTALLATION_CSV_HELP}.` };
  }
  if (!map.some((m) => m.field === 'id' && !m.part)) return { error: 'The header needs an id column.' };
  const installations = [];
  const seen = new Set();
  t.rows.forEach((cells, r) => {
    if (installations.error) return;
    const x = blankInstallation();
    map.forEach((m, i) => {
      const v = cells[i] === undefined ? '' : cells[i];
      if (!m.part) x[m.field] = v;
      else if (m.field) x[m.part][m.field] = v;
      else if (v !== '') x[m.part].bulk[m.product] = v;
    });
    installations.push(x);
  });
  for (let r = 0; r < installations.length; r += 1) {
    const x = installations[r];
    if (!x.id) return { error: `Row ${r + 2} has no id.` };
    if (seen.has(x.id)) return { error: `Row ${r + 2} repeats the id ${x.id}.` };
    seen.add(x.id);
  }
  return { installations };
};

/** The installations as CSV, in the column order parseInstallationsCsv reads. */
export const installationsToCsv = (installations) => {
  const bulkKeys = (part) => [...new Set(installations.flatMap((x) => Object.keys(x[part].bulk || {})))];
  const dk = bulkKeys('demand');
  const ck = bulkKeys('cargo');
  const esc = (v) => { const s = text(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['id', 'name', ...INSTALLATION_FIELDS, ...CARGO_FIELDS.map((f) => `demand_${f}`), ...dk.map((k) => `demand_${k}`),
    ...CARGO_FIELDS.map((f) => `cargo_${f}`), ...ck.map((k) => `cargo_${k}`)];
  const rows = installations.map((x) => [
    x.id, x.name, ...INSTALLATION_FIELDS.map((f) => x[f]),
    ...CARGO_FIELDS.map((f) => x.demand[f]), ...dk.map((k) => x.demand.bulk[k]),
    ...CARGO_FIELDS.map((f) => x.cargo[f]), ...ck.map((k) => x.cargo.bulk[k]),
  ].map(esc).join(','));
  return [head.join(','), ...rows].join('\n');
};

const DECK_ITEM_FIELDS = ['id', 'name', 'lengthM', 'widthM', 'weightT', 'quantity'];
const DECK_BY_KEY = Object.fromEntries(DECK_ITEM_FIELDS.map((f) => [keyOf(f), f]));

/** Deck cargo pasted as CSV: id, name, lengthM, widthM, weightT, quantity. */
export const parseDeckItemsCsv = (textIn) => {
  const t = csvRows(textIn);
  if (t.error) return t;
  const map = [];
  for (const c of t.cols) {
    const f = DECK_BY_KEY[keyOf(c)];
    if (!f) return { error: `Column "${c}" is not one the planner reads. The columns are ${DECK_ITEM_FIELDS.join(', ')}.` };
    map.push(f);
  }
  if (!map.includes('id')) return { error: 'The header needs an id column.' };
  const items = t.rows.map((cells) => {
    const x = blankDeckItem();
    map.forEach((f, i) => { x[f] = cells[i] === undefined ? '' : cells[i]; });
    return x;
  });
  const seen = new Set();
  for (let r = 0; r < items.length; r += 1) {
    if (!items[r].id) return { error: `Row ${r + 2} has no id.` };
    if (seen.has(items[r].id)) return { error: `Row ${r + 2} repeats the id ${items[r].id}.` };
    seen.add(items[r].id);
  }
  return { items };
};

/** JSON (a data set) or CSV (installations), decided by the first character. */
export const parseDataText = (textIn) => {
  const s = String(textIn || '').trim();
  if (s === '') return { error: 'Paste a data set or an installations table first.' };
  return s[0] === '{' || s[0] === '[' ? parseDataSetJson(s) : parseInstallationsCsv(s);
};

// ---- engine arguments ------------------------------------------------------

const cargoArgs = (c) => ({
  deckAreaM2: toNum(c.deckAreaM2),
  deckWeightT: toNum(c.deckWeightT),
  bulk: Object.fromEntries(Object.entries(c.bulk || {}).filter(([, v]) => toNum(v) !== undefined).map(([k, v]) => [k, toNum(v)])),
});

export const productArgs = (cluster) => cluster.products.map((p) => ({
  id: text(p.id), ...named(p), kind: nonBlank(p.kind), densityTPerM3: toNum(p.densityTPerM3),
}));

/** The chosen vessel as the engine reads it, or undefined when none is chosen. */
export const vesselArgs = (cluster, key) => {
  const v = cluster.vessels.find((x) => x.key === key);
  if (!v || nonBlank(key) === undefined) return undefined;
  return {
    ...named(v),
    speedKnots: toNum(v.speedKnots),
    deckAreaM2: toNum(v.deckAreaM2),
    deckUsableFraction: toNum(v.deckUsableFraction),
    deckLoadT: toNum(v.deckLoadT),
    deadweightT: toNum(v.deadweightT),
    // Every stored tank goes through, so a tank for a product that is not in
    // the list is refused by the engine by name; an unstated tank is absent.
    tanks: Object.fromEntries(Object.entries(v.tanks || {}).map(([k, x]) => [k, toNum(x)])),
    fuelTPerHour: Object.fromEntries(ACTIVITIES.map((a) => [a, toNum(v.fuelTPerHour?.[a])])),
  };
};

/** The route for a mode: the milk run's stops and legs, or dedicated voyages. */
export const routeArgs = (cluster, mode) => {
  if (mode === 'milk-run') return { mode, stops: cluster.milkRun.stops.map(text), legsNm: cluster.milkRun.legsNm.map(toNum) };
  if (mode === 'dedicated') return { mode };
  return undefined;
};

const appliesArgs = (list) => ACTIVITIES.filter((a) => (list || []).includes(a));
// A dedicated voyage reads each installation's distance; a milk run reads the
// legs, and the engine refuses a distance given with a milk run.
const distanceArg = (x, mode) => (mode === 'dedicated' ? { distanceFromBaseNm: toNum(x.distanceFromBaseNm) } : {});

export const buildVoyageArgs = (inputs) => {
  const { cluster } = inputs;
  const s = inputs.voyage;
  return {
    vessel: vesselArgs(cluster, s.vessel),
    products: productArgs(cluster),
    installations: cluster.installations.map((x) => ({
      id: text(x.id), ...named(x), ...distanceArg(x, s.mode), fieldHours: toNum(x.fieldHours), cargo: cargoArgs(x.cargo),
    })),
    route: routeArgs(cluster, s.mode),
    portHours: toNum(s.portHours),
    weather: { factor: toNum(s.weatherFactor), appliesTo: appliesArgs(s.appliesTo) },
    fuelPricePerT: toNum(s.fuelPricePerT),
  };
};

const fleetCommon = (cluster, s) => ({
  vessel: vesselArgs(cluster, s.vessel),
  products: productArgs(cluster),
  installations: cluster.installations.map((x) => ({
    id: text(x.id), ...named(x), ...distanceArg(x, s.mode), fieldHours: toNum(x.fieldHours), minVisits: toNum(x.minVisits), demand: cargoArgs(x.demand),
  })),
  route: routeArgs(cluster, s.mode),
  portHours: toNum(s.portHours),
  fuelPricePerT: toNum(s.fuelPricePerT),
  periodDays: toNum(s.periodDays),
  vesselAvailableDays: toNum(s.vesselAvailableDays),
  voyageRounding: nonBlank(s.voyageRounding),
  vesselRounding: nonBlank(s.vesselRounding),
});

export const buildFleetArgs = (inputs) => {
  const s = inputs.fleet;
  return {
    ...fleetCommon(inputs.cluster, s),
    weather: { factor: toNum(s.weatherFactor), appliesTo: appliesArgs(s.appliesTo) },
  };
};

/** A fixed value or a triangular { min, mode, max }; absent when no form is chosen. */
const dist = (mode, fixed, tri) => {
  if (mode === 'fixed') return toNum(fixed);
  if (mode === 'triangular') return { min: toNum(tri.min), mode: toNum(tri.mode), max: toNum(tri.max) };
  return undefined;
};

export const buildVariabilityArgs = (inputs) => {
  const s = inputs.variability;
  return {
    ...fleetCommon(inputs.cluster, s),
    weather: { factor: dist(s.weatherMode, s.weatherFixed, s.weatherTri), appliesTo: appliesArgs(s.appliesTo) },
    demandFactor: dist(s.demandMode, s.demandFixed, s.demandTri),
    plannedVessels: toNum(s.plannedVessels),
    iterations: toNum(s.iterations),
    seed: toNum(s.seed),
  };
};

export const buildDeckArgs = (inputs, rule) => {
  const d = inputs.deck;
  return {
    deck: {
      ...named(d), areaM2: toNum(d.areaM2), usableFraction: toNum(d.usableFraction), loadT: toNum(d.loadT),
    },
    items: d.items.map((x) => ({
      id: text(x.id), ...named(x), lengthM: toNum(x.lengthM), widthM: toNum(x.widthM), weightT: toNum(x.weightT), quantity: toNum(x.quantity),
    })),
    voyages: toNum(d.voyages),
    rule,
  };
};

const boolOf = (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined);

export const buildShoreArgs = (inputs) => {
  const s = inputs.shore;
  const out = {
    berths: toNum(s.berths),
    arrivalsPerDay: toNum(s.arrivalsPerDay),
    workingHoursPerDay: toNum(s.workingHoursPerDay),
    service: {
      fixedHours: toNum(s.fixedHours),
      lifts: toNum(s.lifts),
      liftsPerHour: toNum(s.liftsPerHour),
      bulkM3: toNum(s.bulkM3),
      bulkM3PerHour: toNum(s.bulkM3PerHour),
      concurrent: boolOf(s.concurrent),
    },
    model: nonBlank(s.model),
  };
  // Optional: with no target the engine reports no berth search.
  if (toNum(s.targetMeanWaitHours) !== undefined) out.targetMeanWaitHours = toNum(s.targetMeanWaitHours);
  return out;
};

// ---- running the engine ----------------------------------------------------

/** Each view: its argument builder and its engine function. */
export const VIEWS = {
  voyage: { build: buildVoyageArgs, run: voyagePlan },
  fleet: { build: buildFleetArgs, run: fleetSize },
  variability: { build: buildVariabilityArgs, run: fleetVariability },
  deckFfd: { build: (i) => buildDeckArgs(i, 'first-fit-decreasing-area'), run: deckPlan },
  deckFf: { build: (i) => buildDeckArgs(i, 'first-fit'), run: deckPlan },
  shore: { build: buildShoreArgs, run: shoreBase },
};

const guarded = (fn, args) => {
  try {
    return fn(args);
  } catch (e) {
    // The engine refuses by returning { error }; a throw is reported as it is.
    return { error: `The engine stopped: ${e.message}`, field: null };
  }
};

/** One view's engine result, or its refusal { error, field }. */
export const runView = (key, inputs) => guarded(VIEWS[key].run, VIEWS[key].build(inputs));

export const isRefusal = (r) => !!(r && typeof r.error === 'string');

/**
 * The mean wait at the berth counts around the stated one, each an engine
 * call with only `berths` changed and no target: from the fewest berths with
 * a steady state (the whole number above the offered load) for `span` counts.
 */
export const berthCurve = (inputs, offeredLoad, span = 6) => {
  if (!(typeof offeredLoad === 'number' && Number.isFinite(offeredLoad))) return [];
  const args = buildShoreArgs(inputs);
  delete args.targetMeanWaitHours;
  const from = Math.max(1, Math.floor(offeredLoad) + 1);
  const out = [];
  for (let c = from; c < from + span; c += 1) {
    const r = guarded(shoreBase, { ...args, berths: c });
    if (!isRefusal(r)) out.push({ berths: c, meanWaitHours: r.meanWaitHours, berthUtilisation: r.berthUtilisation });
  }
  return out;
};

// ---- display ---------------------------------------------------------------

/** A number for the screen, en-US grouping, a fixed number of decimals. */
export const fmtNum = (x, dp = 2) => (typeof x === 'number' && Number.isFinite(x)
  ? x.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'n/a');
/** A fraction (0.9) shown as a percentage (90.0%). */
export const fmtShare = (x, dp = 1) => (typeof x === 'number' && Number.isFinite(x) ? `${fmtNum(100 * x, dp)}%` : 'n/a');
