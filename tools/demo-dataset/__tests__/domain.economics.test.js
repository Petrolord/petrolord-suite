/**
 * @jest-environment node
 *
 * Wave D8, economics (episodes 26 to 29, kit folder 12-economics).
 *
 * Reads the GENERATED kit and runs each file through the path its
 * application uses, into the canonical engine, and checks the answer the
 * episode note quotes. Run the generator first:
 *
 *   npx tsx tools/demo-dataset/generate.mjs && npx jest tools/demo-dataset
 *
 * EPE: the uploader's Papa options -> computeCashFlow (the engine the
 * epe-cash-flow-engine edge function runs), with the Run Console's own
 * defaults plus the fields the input sheet lists. NPV Scenario Builder:
 * the Quick Mode sheet -> expandQuickInputs -> calculateEconomics.
 * Breakeven: the analyzer's CSV reader (restated; it lives inside a React
 * component, so its source lines are checked here) -> generateBreakevenData.
 * Decision Tree Builder: the JSON files -> rollback, and evpi on the same
 * payoffs.
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

import { computeCashFlow, computeBreakevenOilPrice, irrResult, ENGINE_VERSION } from '../../../packages/engines/engines/economics/cashflow';
import { calculateEconomics, expandQuickInputs } from '../../../packages/engines/engines/economics/screening';
import { generateBreakevenData, DEFAULT_SEED } from '../../../packages/engines/engines/economics/breakeven';
import { rollback, evpi } from '../../../packages/engines/engines/economics/decisionTree';
import { epeIrrReason } from '../../../src/pages/apps/epe/epeIrrReason';
import { CONSOLE_DEFAULTS, breakevenProcessProductionData } from '../domains/economics/model.mjs';

const ROOT = path.join(__dirname, '..', '..', '..');
const KIT = path.join(ROOT, 'dist-demo', 'ekene-demo-v1');
const read = (rel) => {
  const p = path.join(KIT, rel);
  if (!fs.existsSync(p)) throw new Error(`${rel} is missing: run npx tsx tools/demo-dataset/generate.mjs first.`);
  return fs.readFileSync(p, 'utf8');
};
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const E = '12-economics';
const note = (n) => {
  const dir = path.join(KIT, 'episodes');
  const f = fs.readdirSync(dir).find((x) => x.startsWith(`episode-${n}-`));
  if (!f) throw new Error(`episode ${n} note is missing: run the generator first.`);
  return fs.readFileSync(path.join(dir, f), 'utf8');
};
// EpeDataUploader.jsx, processing stage: the full parse that is stored and run.
const upload = (text) => Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
const sheetRows = (rel) => Papa.parse(read(rel), { header: true, skipEmptyLines: true }).data;

// Measured on the generated kit (engine v3.10.0). Tolerances are float noise
// on a USD figure; every number the notes quote is rounded far coarser.
const GOLD = {
  npv: 813119.3194244802,
  npvBase: -847329.7769683539,
  increment: 1660449.096392834,
  fieldRoots: [-0.5978011582608294, 25.30122552436848],
  wellRoots: [-14.26414006639124, 20.60540388996156],
  screeningNpv: 4.051301542010337,
  be: { p10: 75.5826897724885, p50: 84.59687980855904, p90: 97.02442079720501 },
  beBase: 83.62815751079947,
  emv: 1.696,
  evWithPerfect: 1.954,
  evpi: 0.258,
};

// ---------------------------------------------------------------------------
// EPE case assembly from the kit's own sheet
// ---------------------------------------------------------------------------
const typed = sheetRows(`${E}/epe-case-inputs.csv`);
const cfgFromSheet = () => {
  const cfg = { ...CONSOLE_DEFAULTS };
  for (const r of typed.filter((x) => x.section === 'run console')) {
    let v = r.value;
    if (v === '(blank)') v = null;
    else if (v === 'true' || v === 'false') v = v === 'true';
    else if (v !== '' && Number.isFinite(Number(v))) v = Number(v);
    cfg[r.field] = v;
  }
  return cfg;
};
const design = (field) => Number(typed.find((x) => x.section === 'design' && x.field === field).value);

const files = () => ({
  prod: upload(read(`${E}/ekene-production-2p.csv`)),
  capex: upload(read(`${E}/ekene-capex.csv`)),
  opex: upload(read(`${E}/ekene-opex.csv`)),
});
const run = (cfg, f) => computeCashFlow({ cfg, prodRows: f.prod, capexRows: f.capex, opexRows: f.opex });

/** The same field without Ekene-11: its columns, its capital, its opex and its decommissioning removed. */
const withoutEk11 = (f, cfg) => {
  const fixed11 = design('Ekene-11 fixed opex');
  const variable = design('variable opex');
  const prod = f.prod.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('ekene_11_'))));
  const opex = f.opex.map((r, i) => {
    const p = f.prod[i];
    if (p.year !== r.year) throw new Error('opex and production years are not aligned');
    const liquids11 = p.ekene_11_oil_bbl + p.ekene_11_water_bbl;
    const fixed = r.fixed_opex_usd - (liquids11 > 0 ? fixed11 : 0);
    const variableUsd = r.variable_opex_usd - variable * liquids11;
    return { year: r.year, fixed_opex_usd: fixed, variable_opex_usd: variableUsd, total_opex_usd: fixed + variableUsd };
  });
  return {
    f: { prod, capex: [], opex },
    cfg: { ...cfg, abandonment_cost_usd: design('field abandonment') },
  };
};

describe('Episode 26: Petroleum Economics Studio takes the three uploads', () => {
  test('the Run Console defaults this case starts from are the Console\'s own', () => {
    const text = src('src/pages/apps/epe/EpeRunConsole.jsx');
    const block = text.slice(text.indexOf('const DEFAULT_CONFIG = {'), text.indexOf('};', text.indexOf('const DEFAULT_CONFIG = {')));
    let checked = 0;
    for (const [k, v] of Object.entries(CONSOLE_DEFAULTS)) {
      const m = block.match(new RegExp(`\\n\\s*${k}: ([^,\\n]+),`));
      expect(m).not.toBeNull();
      let raw = m[1].trim();
      // the payload turns an empty deck, blank year or blank tag into null
      if (raw === "''" || raw === '[]') raw = 'null';
      const parsed = raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false
        : /^'.*'$/.test(raw) ? raw.slice(1, -1) : Number(raw.replace(/_/g, ''));
      expect([k, parsed]).toEqual([k, v]);
      checked += 1;
    }
    expect(checked).toBe(Object.keys(CONSOLE_DEFAULTS).length);
  });

  test('history rows are the kit\'s monthly production summed (daily rate x days in month)', () => {
    const monthly = Papa.parse(read('08-production/ekene-production-monthly.csv'), { header: true, skipEmptyLines: true }).data;
    const sums = new Map();
    for (const r of monthly) {
      if (!['Ekene-1', 'Ekene-3', 'Ekene-5', 'Ekene-6'].includes(r.well)) continue;
      const y = +r.date.slice(0, 4);
      const m = +r.date.slice(5, 7);
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const key = `${r.well.toLowerCase().replace('-', '_')}|${y}`;
      const a = sums.get(key) ?? { oil: 0, water: 0, gas: 0 };
      a.oil += Number(r.oil_rate_bopd) * days;
      a.water += Number(r.water_rate_bwpd) * days;
      a.gas += Number(r.gas_rate_mscfd) * days;
      sums.set(key, a);
    }
    const prod = files().prod;
    const check = (rows) => {
      let n = 0;
      for (const r of rows.filter((x) => x.year <= 2025)) {
        for (const w of ['ekene_1', 'ekene_3', 'ekene_5', 'ekene_6']) {
          const s = sums.get(`${w}|${r.year}`);
          if (Math.abs(r[`${w}_oil_bbl`] - s.oil) > 0.001 || Math.abs(r[`${w}_water_bbl`] - s.water) > 0.001
            || Math.abs(r[`${w}_gas_mscf`] - s.gas) > 0.001) throw new Error(`${w} ${r.year} does not match the monthly history`);
          n += 1;
        }
        if (r.ekene_11_oil_bbl !== 0) throw new Error(`Ekene-11 has history in ${r.year}`);
      }
      return n;
    };
    expect(check(prod)).toBe(24);   // six years x four producers
    // negative control: one year nudged by one percent is caught
    const tampered = prod.map((r) => (r.year === 2023 ? { ...r, ekene_5_oil_bbl: r.ekene_5_oil_bbl * 1.01 } : r));
    expect(() => check(tampered)).toThrow(/ekene_5 2023/);
  });

  test('the case returns the NPV10, IRR reason and economic limit the note quotes', () => {
    const f = files();
    const cfg = cfgFromSheet();
    expect(cfg).toMatchObject({ fiscal_regime: 'PIA', pia_water_depth_m: 35, oil_price_usd_bbl: 75, gas_price_usd_mscf: 0,
      base_year: 2026, valuation_year: 2026, treat_prior_as_sunk: true, apply_economic_limit: true,
      abandonment_cost_usd: 6800000, abandonment_year: null, production_scenario: '2P' });
    const { kpis, cashFlowData } = run(cfg, f);
    expect(kpis.fiscal_framework).toBe('nta_2025');
    expect(Math.abs(kpis.npv - GOLD.npv)).toBeLessThan(0.01);
    expect(kpis.irr).toBeNull();
    expect(kpis.irr_status).toBe('multiple-roots');
    kpis.irr_roots.forEach((r, i) => expect(Math.abs(r - GOLD.fieldRoots[i])).toBeLessThan(1e-6));
    expect(kpis.economic_limit_year).toBe(2036);
    expect(kpis.abandonment_year).toBe(2036);
    expect(cashFlowData.filter((r) => r.sunk).map((r) => r.year)).toEqual([2020, 2021, 2022, 2023, 2024, 2025]);
    // the breakeven the edge function adds is null on this case (see the README)
    // null before EPE engine 3.11.0 (economic limit trimmed the capex years), a price after
    const be = computeBreakevenOilPrice({ cfg, prodRows: f.prod, capexRows: f.capex, opexRows: f.opex });
    const [vMaj, vMin] = ENGINE_VERSION.split('.').map(Number);
    if (vMaj > 3 || (vMaj === 3 && vMin >= 11)) {
      expect(be).toBeGreaterThan(0);
      expect(Math.abs(computeCashFlow({ cfg: { ...cfg, oil_price_usd_bbl: be }, prodRows: f.prod, capexRows: f.capex, opexRows: f.opex }).kpis.npv))
        .toBeLessThan(5000);
    } else {
      expect(be).toBeNull();
    }

    const text = note(26);
    expect(text).toContain('NPV10 of USD 0.81 MM');
    expect(text).toContain(epeIrrReason(kpis));
    expect(text).toContain('economic limit in 2036');
  });

  test('Ekene-11 is worth the increment the note quotes, and returns its IRR', () => {
    const f = files();
    const cfg = cfgFromSheet();
    const withIt = run(cfg, f);
    const b = withoutEk11(f, cfg);
    const without = run(b.cfg, b.f);
    expect(Math.abs(without.kpis.npv - GOLD.npvBase)).toBeLessThan(0.01);
    expect(without.kpis.economic_limit_year).toBe(2033);
    const inc = withIt.kpis.npv - without.kpis.npv;
    expect(Math.abs(inc - GOLD.increment)).toBeLessThan(0.01);
    // the well's own cash flow: the difference of the two runs, on the engine's IRR contract
    const A = new Map(withIt.cashFlowData.filter((r) => !r.sunk).map((r) => [r.year, r.net_cash_flow]));
    const B = new Map(without.cashFlowData.filter((r) => !r.sunk).map((r) => [r.year, r.net_cash_flow]));
    const years = [...new Set([...A.keys(), ...B.keys()])].sort((x, y) => x - y);
    const flows = years.map((y) => (A.get(y) ?? 0) - (B.get(y) ?? 0));
    const irr = irrResult(flows, years.map((y) => y - years[0]));
    expect(irr.irr_status).toBe('multiple-roots');
    irr.irr_roots.forEach((r, i) => expect(Math.abs(r - GOLD.wellRoots[i])).toBeLessThan(1e-6));
    const text = note(26);
    expect(text).toContain('worth minus USD 0.85 MM');
    expect(text).toContain('Ekene-11 is worth USD 1.66 MM');
    expect(text).toContain('returns 20.61 percent');
  });

  test('negative controls: Ekene-11\'s capital and production move the NPV the right way, well past tolerance', () => {
    const f = files();
    const cfg = cfgFromSheet();
    const npv = run(cfg, f).kpis.npv;
    const noCapex = run(cfg, { ...f, capex: [] }).kpis.npv;
    expect(noCapex - npv).toBeGreaterThan(5e6);
    const noProd = run(cfg, { ...f, prod: f.prod.map((r) => ({ ...r, ekene_11_oil_bbl: 0, ekene_11_gas_mscf: 0 })) }).kpis.npv;
    expect(npv - noProd).toBeGreaterThan(5e6);
    // and the inflation-only trap the note warns about: escalators left at 3 percent move the answer
    const escalated = run({ ...cfg, oil_price_escalator_pct: 3, gas_price_escalator_pct: 3, condensate_price_escalator_pct: 3, opex_escalator_pct: 3 }, f).kpis.npv;
    expect(Math.abs(escalated - npv)).toBeGreaterThan(1e5);
  });
});

describe('Episode 27: NPV Scenario Builder, Quick Mode', () => {
  const quickFrom = () => {
    const rows = sheetRows(`${E}/npv-scenario-builder-ekene-11.csv`);
    const v = (label) => Number(rows.find((r) => r.field === label).value);
    return {
      initialRate: v('Initial Rate (bopd)'), declineRate: v('Decline Rate (%/yr)'),
      oilPrice: v('Oil Price ($/bbl)'), discountRate: v('Discount Rate (%)'),
      capex: v('Total CAPEX ($MM)'), fixedOpex: v('Fixed OPEX ($MM/yr)'), opexPerBbl: v('Variable OPEX ($/bbl)'),
      royaltyRate: v('Royalty (%)'), taxRate: v('Corp. Tax (%)'), startYear: 2027,
    };
  };

  test('every sheet label is a Quick Mode field', () => {
    const text = src('src/components/npv/QuickInput.jsx');
    for (const r of sheetRows(`${E}/npv-scenario-builder-ekene-11.csv`).filter((x) => x.section !== 'result')) {
      expect([r.field, text.includes(`>${r.field}<`) || text.includes(`<Label>${r.field}</Label>`)]).toEqual([r.field, true]);
    }
  });

  test('calculateEconomics returns the NPV the note quotes, and no IRR', () => {
    const m = calculateEconomics(expandQuickInputs(quickFrom())).metrics;
    expect(Math.abs(m.npv - GOLD.screeningNpv)).toBeLessThan(1e-9);
    expect(m.irr).toBeNull();
    expect(m.irrStatus).toBe('no-sign-change');
    expect(note(27)).toContain('NPV USD 4.05 MM');
    // negative control: the decline is not decoration
    const steeper = calculateEconomics(expandQuickInputs({ ...quickFrom(), declineRate: quickFrom().declineRate + 10 })).metrics.npv;
    expect(m.npv - steeper).toBeGreaterThan(1);
  });
});

describe('Episode 28: Probabilistic Breakeven Analyzer', () => {
  test('the reader the gate restates is still the one in the component', () => {
    const text = src('src/components/breakevenanalyzer/InputPanel.jsx');
    expect(text).toContain("k.toLowerCase().includes('date')");
    expect(text).toContain("k.toLowerCase().includes('oil_rate')");
    expect(text).toContain('annualProduction[year] += oilRate * 30.44;');
    expect(text).toContain('const year = date.getFullYear();');
  });

  const inputs = (overrides = {}) => {
    const rows = Papa.parse(read(`${E}/ekene-11-forecast-breakeven.csv`), { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
    const sheet = sheetRows(`${E}/breakeven-inputs.csv`);
    const setting = (f) => Number(sheet.find((r) => r.field === f).p50);
    const variable = (f, id) => {
      const r = sheet.find((x) => x.field === f);
      return { id, name: f, p10: Number(r.p10), p50: Number(r.p50), p90: Number(r.p90), distType: 'Triangular' };
    };
    return {
      iterations: setting('Monte Carlo Iterations'), seed: DEFAULT_SEED,
      discountRate: setting('Discount Rate (%)'), royaltyRate: setting('Royalty Rate (%)'),
      taxRate: setting('Tax Rate (%)'), targetNpv: setting('Target NPV ($MM)'),
      productionData: { data: breakevenProcessProductionData(rows), fileName: 'x' },
      variables: [variable('Total CAPEX ($MM)', 1), variable('Annual OPEX ($MM/year)', 2), variable('Production Efficiency (%)', 3)],
      ...overrides,
    };
  };

  test('the file holds daily rates on mid-month dates, one row per month', () => {
    const rows = Papa.parse(read(`${E}/ekene-11-forecast-breakeven.csv`), { header: true, skipEmptyLines: true }).data;
    expect(rows[0]).toEqual({ date: '2027-04-15', oil_rate_bopd: '450.0000' });
    expect(rows.every((r) => r.date.endsWith('-15'))).toBe(true);
    const annual = breakevenProcessProductionData(Papa.parse(read(`${E}/ekene-11-forecast-breakeven.csv`), { header: true, dynamicTyping: true, skipEmptyLines: true }).data);
    expect(annual[0].year).toBe(2027);
    // nine months of a 450 bopd well is about 120 thousand barrels, not 3.6 thousand
    expect(annual[0].oil_production_bbl).toBeGreaterThan(100000);
    expect(annual[0].oil_production_bbl).toBeLessThan(130000);
  });

  test('generateBreakevenData returns the percentiles the note quotes', () => {
    const r = generateBreakevenData(inputs());
    expect(Math.abs(r.kpis.p10 - GOLD.be.p10)).toBeLessThan(1e-6);
    expect(Math.abs(r.kpis.p50 - GOLD.be.p50)).toBeLessThan(1e-6);
    expect(Math.abs(r.kpis.p90 - GOLD.be.p90)).toBeLessThan(1e-6);
    expect(Math.abs(r.baseBreakeven - GOLD.beBase)).toBeLessThan(1e-6);
    const text = note(28);
    expect(text).toContain('USD 75.58, 84.60 and 97.02 per bbl');
    expect(text).toContain('break even at USD 83.63');
  });

  test('negative control: the same forecast read as monthly volumes breaks even far lower', () => {
    const base = inputs({ iterations: 50 });
    const asVolumes = { ...base, productionData: { data: base.productionData.data.map((y) => ({ ...y, oil_production_bbl: y.oil_production_bbl * 30.44 })) } };
    const r = generateBreakevenData(asVolumes);
    expect(r.baseBreakeven).toBeLessThan(GOLD.beBase / 10);
  });
});

describe('Episode 29: Decision Tree Builder', () => {
  const load = (f) => JSON.parse(read(`${E}/${f}`));

  test('both files import (the builder needs tree.type) and roll back to the EMVs the note quotes', () => {
    const t = load('ekene-11-decision-tree.json');
    const p = load('ekene-11-perfect-information.json');
    expect(t.tree.type).toBe('decision');
    expect(p.tree.type).toBe('chance');
    const rb = rollback(t.tree);
    expect(Math.abs(rb.emv - GOLD.emv)).toBeLessThan(1e-9);
    expect(rb.bestBranchIndex).toBe(0);
    expect(t.tree.branches[0].label).toBe('Drill Ekene-11');
    expect(Math.abs(rollback(p.tree).emv - GOLD.evWithPerfect)).toBeLessThan(1e-9);
    const text = note(29);
    expect(text).toContain('EMV of USD 1.70 MM');
    expect(text).toContain('worth USD 1.95 MM');
    expect(text).toContain('USD 0.26 MM');
  });

  test('evpi on the same payoffs equals the difference of the two trees', () => {
    const t = load('ekene-11-decision-tree.json').tree;
    const chance = t.branches[0].node;
    const outcomes = chance.branches.map((b) => ({ label: b.label, probability: b.probability }));
    const v = evpi(outcomes, [
      { label: 'Drill', cost: 0, payoffs: chance.branches.map((b) => b.node.payoff) },
      { label: 'Do not drill', cost: 0, payoffs: outcomes.map(() => 0) },
    ]);
    expect(Math.abs(v.evpi - GOLD.evpi)).toBeLessThan(1e-9);
    expect(Math.abs(v.emvPrior - GOLD.emv)).toBeLessThan(1e-9);
    // the mid payoff is the EPE increment, in USD MM to two decimals
    expect(chance.branches[1].node.payoff).toBe(Math.round(GOLD.increment / 1e4) / 100);
    // negative control: with the low and high chances swapped the drill EMV falls
    const swapped = JSON.parse(JSON.stringify(t));
    const br = swapped.branches[0].node.branches;
    [br[0].probability, br[2].probability] = [0.45, 0.15];
    expect(GOLD.emv - rollback(swapped).emv).toBeGreaterThan(0.5);
  });
});
