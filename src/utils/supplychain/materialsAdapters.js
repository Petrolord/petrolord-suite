// Materials & Spares Planner adapters (Supply Chain SC3).
//
// Everything between the page state and the vendored inventory engine
// (packages/engines/engines/supplychain/inventory.js) lives here, so the views
// hold no arithmetic of their own. The rules:
//
//   * No hidden defaults. Every engine input is a visible control in the page
//     state. A blank control is passed to the engine as absent, and the
//     engine's refusal (its `error` string) is shown to the user verbatim.
//   * No engine math here. These functions only reshape typed values into the
//     engine's named arguments and call it.
//   * The Ekene demo is the engines repo fixture
//     (test-data/supplychain/ekene-materials/register.json), read as it is, so
//     the app, the engine gate and the NextGen course all run the same data.
import ekeneRegister from '../../../packages/engines/test-data/supplychain/ekene-materials/register.json';
import vendor from '../../../packages/engines/VENDOR.json';
import {
  criticality, abcClassification, eoq, quantityDiscount, safetyStock,
  poissonStock, insuranceSpares, leadTimeRisk, slowMoving,
} from '@/utils/supplychain/engine/inventory';

export const EKENE_REGISTER = ekeneRegister;
export const SCHEMA_VERSION = 1;
/** The petrolord-engines commit this build runs, read from the vendoring pin. */
export const ENGINE_COMMIT = vendor.canonical.commit;

/** The numeric fields an item in the register can carry. */
export const ITEM_FIELDS = ['annualUsage', 'unitCost', 'onHand', 'monthsSinceLastIssue', 'monthlyUsage'];

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

// ---- the inputs ------------------------------------------------------------

const blankRounding = () => ({ rule: '', multiple: '' });

/** A new study: an empty register and every control blank. */
export const defaultInputs = () => ({
  register: { source: null, title: '', currency: '', items: [] },
  criticality: { criteria: [], scoreMax: '', classes: [], topClassOnMaxScore: [] },
  abc: { aPct: '', bPct: '', boundaryRule: '' },
  eoq: {
    itemId: '', annualDemand: '', orderCost: '', holdingMode: '', holdingRate: '', unitCost: '',
    holdingCostPerUnitYear: '', rounding: blankRounding(),
  },
  discount: {
    itemId: '', annualDemand: '', orderCost: '', holdingRate: '', breaks: [], discountType: '',
    rounding: blankRounding(),
  },
  safety: {
    itemId: '', demandMean: '', demandSd: '', leadTime: '', leadTimeSd: '', reviewPeriod: '',
    serviceMeasure: '', serviceLevel: '', orderQuantity: '', kRule: '', kDecimals: '',
    minimumMode: '', minimumSafetyFactor: '', rounding: blankRounding(),
  },
  poisson: {
    itemId: '', demandRate: '', leadTime: '', reviewPeriod: '', serviceMeasure: '', serviceLevel: '',
    orderQuantity: '',
  },
  spares: {
    itemId: '', failuresPerYear: '', leadTimeDays: '', daysPerYear: '', unitCost: '', holdingRate: '',
    downtimeCostPerDay: '', maxSpares: '',
  },
  leadTime: {
    itemId: '',
    demandMode: '', demandFixed: '', demandTri: { min: '', mode: '', max: '' },
    leadTimeMode: '', leadTimeFixed: '', leadTimeTri: { min: '', mode: '', max: '' },
    reorderPoint: '', serviceLevel: '', iterations: '', seed: '',
  },
  slow: { bands: [], excessCoverMonths: '' },
});

const roundingState = (r) => (r ? { rule: text(r.rule), multiple: r.multiple === undefined ? '' : r.multiple } : blankRounding());
const triState = (d) => (d && typeof d === 'object' ? { min: d.min, mode: d.mode, max: d.max } : { min: '', mode: '', max: '' });

/**
 * The Ekene demo: the fixture's items, its stated policy and one stated case
 * for each calculation, placed into the visible controls exactly as written.
 */
export const ekeneDemoInputs = (reg = EKENE_REGISTER) => {
  const { policy, cases } = reg;
  const c = cases;
  const lt = c.leadTimeRisk;
  return {
    register: {
      source: 'ekene',
      title: reg.title,
      currency: reg.currency,
      items: reg.items.map((it) => ({
        id: it.id, name: it.name, ...Object.fromEntries(ITEM_FIELDS.map((f) => [f, it[f]])), scores: { ...it.scores },
      })),
    },
    criticality: {
      criteria: policy.criticality.criteria.map((x) => ({ ...x })),
      scoreMax: policy.criticality.scoreMax,
      classes: policy.criticality.classes.map((x) => ({ ...x })),
      topClassOnMaxScore: [...policy.criticality.topClassOnMaxScore],
    },
    abc: { aPct: policy.abc.cutoffs.aPct, bPct: policy.abc.cutoffs.bPct, boundaryRule: policy.abc.boundaryRule },
    eoq: {
      itemId: c.eoq.item,
      annualDemand: c.eoq.annualDemand,
      orderCost: c.eoq.orderCost,
      holdingMode: c.eoq.holdingRate !== undefined ? 'rate' : 'direct',
      holdingRate: c.eoq.holdingRate ?? '',
      unitCost: c.eoq.unitCost ?? '',
      holdingCostPerUnitYear: c.eoq.holdingCostPerUnitYear ?? '',
      rounding: roundingState(c.eoq.rounding),
    },
    discount: {
      itemId: c.quantityDiscount.item,
      annualDemand: c.quantityDiscount.annualDemand,
      orderCost: c.quantityDiscount.orderCost,
      holdingRate: c.quantityDiscount.holdingRate,
      breaks: c.quantityDiscount.breaks.map((b) => ({ ...b })),
      discountType: c.quantityDiscount.discountType,
      rounding: roundingState(c.quantityDiscount.rounding),
    },
    safety: {
      itemId: c.safetyStock.item,
      demandMean: c.safetyStock.demandMean,
      demandSd: c.safetyStock.demandSd,
      leadTime: c.safetyStock.leadTime,
      leadTimeSd: c.safetyStock.leadTimeSd,
      reviewPeriod: c.safetyStock.reviewPeriod,
      serviceMeasure: c.safetyStock.serviceMeasure,
      serviceLevel: c.safetyStock.serviceLevel,
      orderQuantity: c.safetyStock.orderQuantity ?? '',
      kRule: c.safetyStock.safetyFactorRounding.rule,
      kDecimals: c.safetyStock.safetyFactorRounding.decimals ?? '',
      minimumMode: c.safetyStock.minimumSafetyFactor === null ? 'none' : 'value',
      minimumSafetyFactor: c.safetyStock.minimumSafetyFactor === null ? '' : c.safetyStock.minimumSafetyFactor,
      rounding: roundingState(c.safetyStock.rounding),
    },
    poisson: {
      itemId: c.poissonStock.item,
      demandRate: c.poissonStock.demandRate,
      leadTime: c.poissonStock.leadTime,
      reviewPeriod: c.poissonStock.reviewPeriod,
      serviceMeasure: c.poissonStock.serviceMeasure,
      serviceLevel: c.poissonStock.serviceLevel,
      orderQuantity: c.poissonStock.orderQuantity ?? '',
    },
    spares: {
      itemId: c.insuranceSpares.item,
      failuresPerYear: c.insuranceSpares.failuresPerYear,
      leadTimeDays: c.insuranceSpares.leadTimeDays,
      daysPerYear: c.insuranceSpares.daysPerYear,
      unitCost: c.insuranceSpares.unitCost,
      holdingRate: c.insuranceSpares.holdingRate,
      downtimeCostPerDay: c.insuranceSpares.downtimeCostPerDay,
      maxSpares: c.insuranceSpares.maxSpares,
    },
    leadTime: {
      itemId: lt.item,
      demandMode: typeof lt.demandPerDay === 'object' ? 'triangular' : 'fixed',
      demandFixed: typeof lt.demandPerDay === 'object' ? '' : lt.demandPerDay,
      demandTri: triState(lt.demandPerDay),
      leadTimeMode: typeof lt.leadTimeDays === 'object' ? 'triangular' : 'fixed',
      leadTimeFixed: typeof lt.leadTimeDays === 'object' ? '' : lt.leadTimeDays,
      leadTimeTri: triState(lt.leadTimeDays),
      reorderPoint: lt.reorderPoint,
      serviceLevel: lt.serviceLevel ?? '',
      iterations: lt.iterations,
      seed: lt.seed,
    },
    slow: {
      bands: policy.slowMoving.bands.map((b) => ({ ...b })),
      excessCoverMonths: policy.slowMoving.excessCoverMonths,
    },
  };
};

/** A saved payload back to inputs, or null when it is not one of ours. */
export const inputsFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : null;
  if (!raw || !raw.register || !Array.isArray(raw.register.items)) return null;
  const base = defaultInputs();
  const out = { ...base };
  for (const k of Object.keys(base)) {
    if (raw[k] && typeof raw[k] === 'object') out[k] = { ...base[k], ...raw[k] };
  }
  return out;
};

// ---- register import -------------------------------------------------------

const HEADER_ALIASES = {
  id: 'id', itemid: 'id', item: 'id',
  name: 'name', description: 'name',
  annualusage: 'annualUsage', unitcost: 'unitCost', onhand: 'onHand',
  monthssincelastissue: 'monthsSinceLastIssue', monthlyusage: 'monthlyUsage',
};
const SCORE_PREFIX = /^score[._:\s-]?(.+)$/i;

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

/**
 * A register pasted as CSV (comma, tab or semicolon separated, first row the
 * header). Columns: id, name, annualUsage, unitCost, onHand,
 * monthsSinceLastIssue, monthlyUsage, and one score_<criterion> column per
 * criticality criterion. A column the planner does not read is refused by
 * name, so a misspelt header is never dropped silently.
 */
export const parseRegisterCsv = (textIn) => {
  const lines = String(textIn || '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return { error: 'A pasted register needs a header row and at least one item row.' };
  const head = lines[0];
  const delim = head.includes('\t') ? '\t' : head.includes(';') && !head.includes(',') ? ';' : ',';
  const cols = splitCsvLine(head, delim);
  const map = cols.map((c) => {
    const s = c.match(SCORE_PREFIX);
    if (s) return { score: s[1].trim() };
    const key = HEADER_ALIASES[c.replace(/[\s_-]/g, '').toLowerCase()];
    return key ? { field: key } : { unknown: c };
  });
  const bad = map.find((m) => m.unknown !== undefined);
  if (bad) return { error: `Column "${bad.unknown}" is not one the planner reads. The columns are id, name, ${ITEM_FIELDS.join(', ')} and score_<criterion> for each criticality criterion.` };
  if (!map.some((m) => m.field === 'id')) return { error: 'The header needs an id column.' };
  const items = [];
  const seen = new Set();
  for (let r = 1; r < lines.length; r += 1) {
    const cells = splitCsvLine(lines[r], delim);
    if (cells.length > cols.length) return { error: `Row ${r + 1} has ${cells.length} cells against ${cols.length} columns in the header.` };
    const it = { id: '', name: '', scores: {} };
    map.forEach((m, i) => {
      const v = cells[i] === undefined ? '' : cells[i];
      if (m.score) { if (v !== '') it.scores[m.score] = v; } else it[m.field] = v;
    });
    if (!it.id) return { error: `Row ${r + 1} has no id.` };
    if (seen.has(it.id)) return { error: `Row ${r + 1} repeats the id ${it.id}.` };
    seen.add(it.id);
    items.push(it);
  }
  return { items };
};

/** A register pasted as JSON: an array of items, or an object with `items`. */
export const parseRegisterJson = (textIn) => {
  let data;
  try { data = JSON.parse(textIn); } catch (e) { return { error: `The JSON could not be read: ${e.message}` }; }
  const list = Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : null;
  if (!list || list.length === 0) return { error: 'The JSON needs an array of items, or an object with an items array.' };
  const items = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const x = list[i];
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || x.id === '') return { error: `Item ${i + 1} needs an id.` };
    if (seen.has(x.id)) return { error: `Item ${i + 1} repeats the id ${x.id}.` };
    seen.add(x.id);
    const known = new Set(['id', 'name', 'scores', ...ITEM_FIELDS]);
    const extra = Object.keys(x).find((k) => !known.has(k));
    if (extra) return { error: `Item ${x.id} has the key "${extra}", which the planner does not read. The keys are id, name, ${ITEM_FIELDS.join(', ')} and scores.` };
    items.push({
      id: x.id, name: text(x.name), ...Object.fromEntries(ITEM_FIELDS.map((f) => [f, x[f] === undefined ? '' : x[f]])), scores: { ...(x.scores || {}) },
    });
  }
  const meta = Array.isArray(data) ? {} : { title: text(data.title), currency: text(data.currency) };
  return { items, ...meta };
};

/** CSV or JSON, decided by the first character. */
export const parseRegisterText = (textIn) => {
  const s = String(textIn || '').trim();
  if (s === '') return { error: 'Paste a register first.' };
  return s[0] === '[' || s[0] === '{' ? parseRegisterJson(s) : parseRegisterCsv(s);
};

/** The register as CSV, in the column order parseRegisterCsv reads. */
export const registerToCsv = (items) => {
  const scoreKeys = [...new Set(items.flatMap((it) => Object.keys(it.scores || {})))];
  const esc = (v) => { const s = text(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['id', 'name', ...ITEM_FIELDS, ...scoreKeys.map((k) => `score_${k}`)];
  const rows = items.map((it) => [it.id, it.name, ...ITEM_FIELDS.map((f) => it[f]), ...scoreKeys.map((k) => (it.scores || {})[k])].map(esc).join(','));
  return [head.join(','), ...rows].join('\n');
};

// ---- engine arguments ------------------------------------------------------

const rounding = (r) => {
  if (!r || nonBlank(r.rule) === undefined) return undefined;
  return r.rule === 'none' ? { rule: 'none' } : { rule: r.rule, multiple: toNum(r.multiple) };
};
const dist = (mode, fixed, tri) => {
  if (mode === 'fixed') return toNum(fixed);
  if (mode === 'triangular') return { min: toNum(tri.min), mode: toNum(tri.mode), max: toNum(tri.max) };
  return undefined;
};
const named = (it) => (nonBlank(it.name) === undefined ? {} : { name: it.name });

export const buildCriticalityArgs = (inputs) => {
  const c = inputs.criticality;
  return {
    criteria: c.criteria.map((x) => ({ id: text(x.id), ...(nonBlank(x.label) === undefined ? {} : { label: x.label }), weight: toNum(x.weight) })),
    scoreMax: toNum(c.scoreMax),
    items: inputs.register.items.map((it) => ({
      id: it.id, ...named(it), scores: Object.fromEntries(Object.entries(it.scores || {}).map(([k, v]) => [k, toNum(v)])),
    })),
    classes: c.classes.map((x) => ({ label: text(x.label), minScore: toNum(x.minScore) })),
    topClassOnMaxScore: [...c.topClassOnMaxScore],
  };
};

export const buildAbcArgs = (inputs) => ({
  items: inputs.register.items.map((it) => ({
    id: it.id, ...named(it), annualUsage: toNum(it.annualUsage), unitCost: toNum(it.unitCost),
  })),
  cutoffs: { aPct: toNum(inputs.abc.aPct), bPct: toNum(inputs.abc.bPct) },
  boundaryRule: nonBlank(inputs.abc.boundaryRule),
});

export const buildEoqArgs = (inputs) => {
  const s = inputs.eoq;
  const out = { annualDemand: toNum(s.annualDemand), orderCost: toNum(s.orderCost) };
  if (s.holdingMode === 'rate') {
    out.holdingRate = toNum(s.holdingRate);
    out.unitCost = toNum(s.unitCost);
  } else if (s.holdingMode === 'direct') {
    out.holdingCostPerUnitYear = toNum(s.holdingCostPerUnitYear);
    // Optional here: only the purchase cost line reads it.
    if (toNum(s.unitCost) !== undefined) out.unitCost = toNum(s.unitCost);
  }
  out.rounding = rounding(s.rounding);
  return out;
};

export const buildDiscountArgs = (inputs) => {
  const s = inputs.discount;
  return {
    annualDemand: toNum(s.annualDemand),
    orderCost: toNum(s.orderCost),
    holdingRate: toNum(s.holdingRate),
    breaks: s.breaks.map((b) => ({ minQuantity: toNum(b.minQuantity), unitPrice: toNum(b.unitPrice) })),
    discountType: nonBlank(s.discountType),
    rounding: rounding(s.rounding),
  };
};

export const buildSafetyArgs = (inputs) => {
  const s = inputs.safety;
  const out = {
    demandMean: toNum(s.demandMean),
    demandSd: toNum(s.demandSd),
    leadTime: toNum(s.leadTime),
    leadTimeSd: toNum(s.leadTimeSd),
    reviewPeriod: toNum(s.reviewPeriod),
    serviceMeasure: nonBlank(s.serviceMeasure),
    serviceLevel: toNum(s.serviceLevel),
  };
  // Optional for a cycle service level; required (and refused when blank) for a fill rate.
  if (toNum(s.orderQuantity) !== undefined) out.orderQuantity = toNum(s.orderQuantity);
  if (s.kRule === 'none') out.safetyFactorRounding = { rule: 'none' };
  else if (s.kRule === 'nearest') out.safetyFactorRounding = { rule: 'nearest', decimals: toNum(s.kDecimals) };
  // null is a stated "no floor"; blank leaves it unstated, which the engine refuses.
  if (s.minimumMode === 'none') out.minimumSafetyFactor = null;
  else if (s.minimumMode === 'value') out.minimumSafetyFactor = toNum(s.minimumSafetyFactor);
  out.rounding = rounding(s.rounding);
  return out;
};

export const buildPoissonArgs = (inputs) => {
  const s = inputs.poisson;
  const out = {
    demandRate: toNum(s.demandRate),
    leadTime: toNum(s.leadTime),
    reviewPeriod: toNum(s.reviewPeriod),
    serviceMeasure: nonBlank(s.serviceMeasure),
    serviceLevel: toNum(s.serviceLevel),
  };
  if (toNum(s.orderQuantity) !== undefined) out.orderQuantity = toNum(s.orderQuantity);
  return out;
};

export const buildSparesArgs = (inputs) => {
  const s = inputs.spares;
  return {
    failuresPerYear: toNum(s.failuresPerYear),
    leadTimeDays: toNum(s.leadTimeDays),
    daysPerYear: toNum(s.daysPerYear),
    unitCost: toNum(s.unitCost),
    holdingRate: toNum(s.holdingRate),
    downtimeCostPerDay: toNum(s.downtimeCostPerDay),
    maxSpares: toNum(s.maxSpares),
  };
};

export const buildLeadTimeArgs = (inputs) => {
  const s = inputs.leadTime;
  const out = {
    demandPerDay: dist(s.demandMode, s.demandFixed, s.demandTri),
    leadTimeDays: dist(s.leadTimeMode, s.leadTimeFixed, s.leadTimeTri),
    reorderPoint: toNum(s.reorderPoint),
    iterations: toNum(s.iterations),
    seed: toNum(s.seed),
  };
  // Optional: with no service level the engine reports no reorder point for service.
  if (toNum(s.serviceLevel) !== undefined) out.serviceLevel = toNum(s.serviceLevel);
  return out;
};

export const buildSlowArgs = (inputs) => ({
  items: inputs.register.items.map((it) => ({
    id: it.id,
    ...named(it),
    onHand: toNum(it.onHand),
    unitCost: toNum(it.unitCost),
    monthsSinceLastIssue: toNum(it.monthsSinceLastIssue),
    monthlyUsage: toNum(it.monthlyUsage),
  })),
  bands: inputs.slow.bands.map((b) => ({ label: text(b.label), minMonths: toNum(b.minMonths), writeDownPct: toNum(b.writeDownPct) })),
  excessCoverMonths: toNum(inputs.slow.excessCoverMonths),
});

// ---- running the engine ----------------------------------------------------

/** Each view: its argument builder and its engine function. */
export const VIEWS = {
  criticality: { build: buildCriticalityArgs, run: criticality },
  abc: { build: buildAbcArgs, run: abcClassification },
  eoq: { build: buildEoqArgs, run: eoq },
  discount: { build: buildDiscountArgs, run: quantityDiscount },
  safety: { build: buildSafetyArgs, run: safetyStock },
  poisson: { build: buildPoissonArgs, run: poissonStock },
  spares: { build: buildSparesArgs, run: insuranceSpares },
  leadTime: { build: buildLeadTimeArgs, run: leadTimeRisk },
  slow: { build: buildSlowArgs, run: slowMoving },
};

/** One view's engine result, or its refusal { error, field }. */
export const runView = (key, inputs) => {
  const v = VIEWS[key];
  try {
    return v.run(v.build(inputs));
  } catch (e) {
    // The engine refuses by returning { error }; a throw is reported as it is.
    return { error: `The engine stopped: ${e.message}`, field: null };
  }
};

export const isRefusal = (r) => !!(r && typeof r.error === 'string');

// ---- filling a calculation from a register item ----------------------------

/**
 * Copy an item's figures into a calculation's visible controls. The user sees
 * and can change every value copied; the period each one is in is named in
 * the view.
 */
export const fillFromItem = (view, item) => {
  if (!item) return {};
  switch (view) {
    case 'eoq': return { itemId: item.id, annualDemand: item.annualUsage, unitCost: item.unitCost };
    case 'discount': return { itemId: item.id, annualDemand: item.annualUsage };
    case 'safety': return { itemId: item.id, demandMean: item.monthlyUsage };
    case 'poisson': return { itemId: item.id, demandRate: item.monthlyUsage };
    case 'spares': return { itemId: item.id, unitCost: item.unitCost };
    default: return { itemId: item.id };
  }
};

// ---- display ---------------------------------------------------------------

/** A number for the screen, en-US grouping, a fixed number of decimals. */
export const fmtNum = (x, dp = 2) => (typeof x === 'number' && Number.isFinite(x)
  ? x.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'n/a');
export const fmtPct = (x, dp = 1) => (typeof x === 'number' && Number.isFinite(x) ? `${fmtNum(x, dp)}%` : 'n/a');
