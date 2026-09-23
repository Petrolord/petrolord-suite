// Wave D8 domain: ECONOMICS (episodes 26 to 29, kit folder 12-economics).
//
// The field on production (08-production) gets a value, and Ekene-11 (the
// well Episode 10 designs, d8spine.mjs) gets a decision. Every volume is
// DERIVED: history is the kit's own monthly file summed, the base forecast is
// the ekene-dynamic fixture's own flood model carried past the end of history,
// and Ekene-11 is the d8spine forecast. Every dollar is computed by a
// canonical engine (see ./economics/model.mjs); nothing here discounts a cash
// flow itself. What is claimed is asserted on the way through, and the gate
// __tests__/domain.economics.test.js re-runs the same engines on the files the
// kit ships.

import * as fs from 'fs';
import * as path from 'path';

import { EKENE11 } from '../d8spine.mjs';
import { LOCKED } from '../spine.mjs';
import {
  computeBreakevenOilPrice,
} from '../../../packages/engines/engines/economics/cashflow.ts';
import { calculateEconomics, expandQuickInputs } from '../../../packages/engines/engines/economics/screening.js';
import { generateBreakevenData, DEFAULT_SEED } from '../../../packages/engines/engines/economics/breakeven.js';
import { rollback, evpi } from '../../../packages/engines/engines/economics/decisionTree.js';
import { epeIrrReason } from '../../../src/pages/apps/epe/epeIrrReason.js';
import {
  DESIGN, OUTCOMES, PRODUCERS, HISTORY_END, ECON_LIMIT_BOPD,
  buildPerWell, caseTexts, buildCfg, typedFields, runEpe, parseLikeUploader, irrResult, col,
  breakevenProcessProductionData, parseLikeBreakeven, daysBetween, addMonths,
} from './economics/model.mjs';

const DIR = '12-economics';
const mm = (usd, d = 2) => (usd / 1e6).toFixed(d);
// A sheet cell that holds a comma or a quote is quoted (RFC 4180).
const cell = (x) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
const sheet = (header, rows) => `${[header, ...rows].map((r) => r.map(cell).join(',')).join('\n')}\n`;
const money = (usd) => `${usd < 0 ? 'minus ' : ''}USD ${mm(Math.abs(usd))} MM`;

export async function build(ctx) {
  const { write, csv, say, assertClose, OUT, ROOT } = ctx;
  const FIX = path.join(ROOT, 'packages', 'engines', 'test-data', 'ekene-dynamic');
  const rates = JSON.parse(fs.readFileSync(path.join(FIX, 'rates.json'), 'utf8'));
  const flood = JSON.parse(fs.readFileSync(path.join(FIX, 'waterflood.json'), 'utf8'));
  const monthlyText = fs.readFileSync(path.join(OUT, '08-production', 'ekene-production-monthly.csv'), 'utf8');
  const GOR = LOCKED.rsi_scf_stb / 1000;   // Mscf per stb, the ratio the history's gas carries

  // ---------------------------------------------------------------------------
  // 1. The forecast rules, checked against the fixture they come from
  // ---------------------------------------------------------------------------
  {
    const rows = flood.surveillance_rows;
    for (const w of rates.wells) {
      const fr = w.flood_response;
      const rampEnd = addMonths(rates.flood_start, fr.lagMonths + fr.ramp_months);
      const mine = rows.filter((r) => r.well === w.name).sort((a, b) => a.date.localeCompare(b.date));
      let checked = 0;
      for (let i = 1; i < mine.length; i += 1) {
        if (mine[i - 1].date < rampEnd) continue;
        const g0 = mine[i - 1].oil_bbl + mine[i - 1].water_bbl;
        const g1 = mine[i].oil_bbl + mine[i].water_bbl;
        const expect = Math.exp(-fr.post_ramp_decline_per_day * daysBetween(mine[i - 1].date, mine[i].date));
        assertClose(`${w.name} post-ramp gross decline ${mine[i].date}`, g1 / g0, expect, 1e-12);
        checked += 1;
      }
      if (checked < 12) throw new Error(`ASSERT ${w.name}: only ${checked} post-ramp months to check the decline on`);
      // the water cut reaches wcMax exactly at the end of history, and the model holds it there
      const dec = mine.find((r) => r.date === HISTORY_END);
      assertClose(`${w.name} water cut at end of history`, dec.water_bbl / (dec.oil_bbl + dec.water_bbl), fr.wcMax, 1e-12);
      // gas is the solution GOR on the oil
      assertClose(`${w.name} history GOR`, dec.gas_mcf / dec.oil_bbl, GOR, 1e-12);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Annual volumes: history from the kit, forecasts derived
  // ---------------------------------------------------------------------------
  const mid = buildPerWell(monthlyText, rates, GOR, 1);
  {
    // The kit's monthly file summed must equal the fixture summed the long
    // way (primary Arps rows before the flood, surveillance rows after).
    for (const w of PRODUCERS) {
      const byYear = new Map();
      const add = (date, oil, water, gas) => {
        const y = +date.slice(0, 4);
        const d = daysBetween(date, addMonths(date, 1));
        const a = byYear.get(y) ?? { oil: 0, water: 0, gas: 0 };
        a.oil += oil * d; a.water += water * d; a.gas += gas * d;
        byYear.set(y, a);
      };
      for (const m of rates.wells.find((x) => x.name === w).monthly) {
        if (m.date < rates.flood_start) add(m.date, m.oil_bpd, 0, m.oil_bpd * GOR);
      }
      for (const r of flood.surveillance_rows) if (r.well === w) add(r.date, r.oil_bbl, r.water_bbl, r.gas_mcf);
      for (const [y, a] of byYear) {
        const k = mid.hist.get(w).get(y);
        for (const s of ['oil', 'water', 'gas']) assertClose(`${w} ${y} ${s} history`, k[s], a[s], 0.01);
      }
    }
  }
  const lastOil = PRODUCERS.reduce((s, w) => s + mid.monthly.get(w)[0].oil, 0);
  const ek11 = mid.monthly.get('Ekene-11');
  assertClose('Ekene-11 first-month rate is the d8spine qi', ek11[0].oil, EKENE11.forecast.qi_bopd, 1e-12);
  const ek11Eur = [...mid.perWell.get('Ekene-11').values()].reduce((s, a) => s + a.oil, 0);
  const ek11LastDate = ek11[ek11.length - 1].date;

  // ---------------------------------------------------------------------------
  // 3. Petroleum Economics Studio: the three uploads and the typed case
  // ---------------------------------------------------------------------------
  const full = caseTexts(mid.perWell, { withEk11: true });
  write(`${DIR}/ekene-production-2p.csv`, full.prod);
  write(`${DIR}/ekene-capex.csv`, full.capex);
  write(`${DIR}/ekene-opex.csv`, full.opex);
  const abandonment = full.rows.abandonment_usd;
  const cfg = buildCfg(abandonment);

  // The history rows of the production file, read back the way the uploader
  // reads them, equal the kit's monthly history summed.
  {
    const rows = parseLikeUploader(full.prod);
    for (const r of rows) {
      if (r.year > 2025) continue;
      for (const w of PRODUCERS) {
        const h = mid.hist.get(w).get(r.year);
        assertClose(`production file ${r.year} ${w} oil`, r[col(w, 'oil_bbl')], h.oil, 0.0005);
        assertClose(`production file ${r.year} ${w} water`, r[col(w, 'water_bbl')], h.water, 0.0005);
        assertClose(`production file ${r.year} ${w} gas`, r[col(w, 'gas_mscf')], h.gas, 0.0005);
      }
      if (r[col('Ekene-11', 'oil_bbl')] !== 0) throw new Error(`ASSERT Ekene-11 has history in ${r.year}`);
    }
  }

  const epe = runEpe(cfg, full.prod, full.capex, full.opex);
  const K = epe.kpis;
  const breakeven = computeBreakevenOilPrice({
    cfg, prodRows: parseLikeUploader(full.prod), capexRows: parseLikeUploader(full.capex), opexRows: parseLikeUploader(full.opex),
  });
  // Known engine limitation (reported, not fixed here): with the economic
  // limit on, the low end of computeBreakevenOilPrice's bracket (USD 0.5)
  // trims every valued year, capital included, so the NPV there is exactly 0
  // and the bisection declines to answer. The results screen then shows no
  // breakeven line for this case. Asserted so a fix is noticed.
  if (breakeven !== null) throw new Error(`ASSERT EPE breakeven is null on this case (got ${breakeven}); update the note`);
  const baseCase = caseTexts(mid.perWell, { withEk11: false });
  const epeBase = runEpe(buildCfg(baseCase.rows.abandonment_usd), baseCase.prod, null, baseCase.opex);
  const increment = K.npv - epeBase.kpis.npv;
  if (K.fiscal_framework !== 'nta_2025') throw new Error(`ASSERT framework ${K.fiscal_framework}, expected nta_2025`);
  if (!(increment > 0)) throw new Error(`ASSERT Ekene-11 adds value on the mid case (increment ${increment})`);

  // Negative controls: take Ekene-11's capital out and the NPV must rise by
  // more than its after-tax present cost could hide; take its production out
  // and the NPV must fall.
  const noCapex = runEpe(cfg, full.prod, null, full.opex).kpis.npv;
  if (!(noCapex - K.npv > 5e6)) throw new Error(`ASSERT dropping Ekene-11 capex raises NPV by > 5 MM (got ${noCapex - K.npv})`);
  const noProdText = full.prod.split('\n').map((line) => line.split(',').filter((_, i) => {
    const h = full.rows.prodHeader[i];
    return !h || !h.startsWith('ekene_11_');
  }).join(',')).join('\n');
  const noProd = runEpe(cfg, noProdText, full.capex, full.opex).kpis.npv;
  if (!(K.npv - noProd > 5e6)) throw new Error(`ASSERT dropping Ekene-11 production lowers NPV by > 5 MM (got ${K.npv - noProd})`);

  // What the increment looks like to a screening engine: effective royalty
  // and take rates on the increment (evaluation years only).
  const byYear = (rows) => new Map(rows.filter((r) => !r.sunk).map((r) => [r.year, r]));
  const A = byYear(epe.cashFlowData);
  const B = byYear(epeBase.cashFlowData);
  const years = [...new Set([...A.keys(), ...B.keys()])].sort((a, b) => a - b);
  const d = (k) => years.reduce((s, y) => s + (A.get(y)?.[k] ?? 0) - (B.get(y)?.[k] ?? 0), 0);
  const dRev = d('gross_revenue');
  const dRoy = d('royalty');
  const dTake = d('tax') + d('hcdt') + d('nddc');
  const dPreTax = dRev - dRoy - d('opex') - d('depreciation');
  const royaltyPct = Math.round((dRoy / dRev) * 1000) / 10;
  const takePct = Math.round((dTake / dPreTax) * 1000) / 10;
  const incrFlows = years.map((y) => (A.get(y)?.net_cash_flow ?? 0) - (B.get(y)?.net_cash_flow ?? 0));
  const incrIrr = irrResult(incrFlows, years.map((y) => y - years[0]));

  // the input sheet for the typed case
  {
    const src = (f) => {
      if (['oil_price_usd_bbl', 'gas_price_usd_mscf'].includes(f)) return 'design value';
      if (f === 'abandonment_cost_usd') return 'design value: field 6.0 MM plus Ekene-11 0.8 MM';
      return 'Run Console setting';
    };
    const rows = [
      ['upload', 'production slot', 'ekene-production-2p.csv', '', 'choose 2P in the Scenario tag box before uploading'],
      ['upload', 'CAPEX slot', 'ekene-capex.csv', '', 'Ekene-11 AFE 11.8 MM (d8spine) and a 0.6 MM hook-up, both 2027'],
      ['upload', 'OPEX slot', 'ekene-opex.csv', '', 'fixed plus variable; total_opex_usd is the column the engine reads'],
      ...typedFields(abandonment).map(([f, v, unit, why]) => ['run console', f, v === null ? '(blank)' : String(v), unit, `${src(f)}: ${why}`]),
      ['escalation', 'Customize per stream', 'open it', '', 'set all four escalators to 0 here; the inflation box alone does not change them'],
      ['design', 'field fixed opex', String(DESIGN.field_fixed_opex_usd), 'USD/yr', 'design value: the field\'s share of Ekene Alpha, the export line and injection'],
      ['design', 'Ekene-11 fixed opex', String(DESIGN.ekene11_fixed_opex_usd), 'USD/yr', 'design value, in the years it produces'],
      ['design', 'field abandonment', String(DESIGN.field_abandonment_usd), 'USD', 'design value: the four producers, two injectors and the field\'s share of Ekene Alpha'],
      ['design', 'Ekene-11 abandonment', String(DESIGN.ekene11_abandonment_usd), 'USD', 'design value: plugging Ekene-11'],
      ['design', 'variable opex', String(DESIGN.variable_opex_usd_per_bbl_liquid), 'USD/bbl liquid', 'design value, on oil plus water'],
      ['result', 'NPV10 (field with Ekene-11)', K.npv.toFixed(0), 'USD', 'engine result on these files'],
      ['result', 'IRR', K.irr === null ? `none (${K.irr_status})` : K.irr.toFixed(2), '%', 'engine result on these files'],
      ['result', 'economic limit year', String(K.economic_limit_year), '', 'engine result on these files'],
      ['result', 'breakeven oil price', '(not shown)', 'USD/bbl', 'the engine returns none with the economic limit on; see README'],
    ];
    write(`${DIR}/epe-case-inputs.csv`, sheet(['section', 'field', 'value', 'unit', 'source'], rows));
  }

  // ---------------------------------------------------------------------------
  // 4. NPV Scenario Builder, Quick Mode, on the Ekene-11 increment
  // ---------------------------------------------------------------------------
  // Quick Mode is an exponential decline on a year-start rate x 365 for 20
  // years. Its decline slider moves in whole percent, so the decline is the
  // whole percent whose 20-year volume on that rule is closest to the
  // hyperbolic's own 20-year volume.
  const quickVolume = (qi, pct) => Array.from({ length: 20 }, (_, i) => qi * 365 * (1 - pct / 100) ** i).reduce((a, b) => a + b, 0);
  const hyp20 = (() => {
    const { qi_bopd: qi, di_per_day: Di, b } = EKENE11.forecast;
    const t = daysBetween(EKENE11.first_oil, addMonths(EKENE11.first_oil, 240));
    return (qi / (Di * (1 - b))) * (1 - (1 + b * Di * t) ** (1 - 1 / b));
  })();
  let declinePct = 1;
  for (let p = 1; p <= 50; p += 1) {
    if (Math.abs(quickVolume(450, p) - hyp20) < Math.abs(quickVolume(450, declinePct) - hyp20)) declinePct = p;
  }
  const ek11ProducingYears = mid.perWell.get('Ekene-11').size;
  const opexPerBbl = Math.round((DESIGN.variable_opex_usd_per_bbl_liquid
    + (DESIGN.ekene11_fixed_opex_usd * ek11ProducingYears) / ek11Eur) * 100) / 100;
  const quick = {
    initialRate: EKENE11.forecast.qi_bopd,
    declineRate: declinePct,
    oilPrice: DESIGN.oil_price_usd_bbl,
    discountRate: DESIGN.discount_rate_pct,
    capex: (EKENE11.dc_cost_usd + DESIGN.ekene11_tie_in_usd) / 1e6,
    fixedOpex: 0,
    opexPerBbl,
    royaltyRate: royaltyPct,
    taxRate: takePct,
    startYear: 2027,
  };
  const scr = calculateEconomics(expandQuickInputs(quick)).metrics;
  // Quick Mode books the first year at the full initial rate for 365 days, so
  // even the two capital years are cash positive and there is no IRR.
  if (scr.irrStatus !== 'no-sign-change') throw new Error(`ASSERT the screening run never goes negative (status ${scr.irrStatus}); rewrite the note`);
  // The EPE increment has two roots: the well's return and a negative one
  // that the decommissioning bill at the end creates.
  if (incrIrr.irr_status !== 'multiple-roots' || incrIrr.irr_roots.length !== 2) {
    throw new Error(`ASSERT the Ekene-11 increment has two IRR roots (${JSON.stringify(incrIrr)}); rewrite the note`);
  }
  const wellIrr = Math.max(...incrIrr.irr_roots);
  write(`${DIR}/npv-scenario-builder-ekene-11.csv`, sheet(['section', 'field', 'value', 'unit', 'source'], [
    ['Production Parameters', 'Initial Rate (bopd)', quick.initialRate, 'bopd', 'd8spine Ekene-11 qi'],
    ['Production Parameters', 'Decline Rate (%/yr)', quick.declineRate, '%/yr', `the whole percent whose 20-year Quick Mode volume is closest to the hyperbolic's (${Math.round(hyp20)} stb)`],
    ['Market Conditions', 'Oil Price ($/bbl)', quick.oilPrice, 'USD/bbl', 'design value, as the EPE case'],
    ['Market Conditions', 'Discount Rate (%)', quick.discountRate, '%', 'as the EPE case'],
    ['Costs (CAPEX / OPEX)', 'Total CAPEX ($MM)', quick.capex, 'USD MM', 'Ekene-11 AFE 11.8 plus hook-up 0.6'],
    ['Costs (CAPEX / OPEX)', 'Fixed OPEX ($MM/yr)', 0, 'USD MM/yr', 'folded into the per-barrel figure so the 20-year run carries no cost after the well is gone'],
    ['Costs (CAPEX / OPEX)', 'Variable OPEX ($/bbl)', quick.opexPerBbl, 'USD/bbl', `4.00 variable plus Ekene-11's fixed opex spread over its ${Math.round(ek11Eur)} stb`],
    ['Fiscal Terms', 'Royalty (%)', quick.royaltyRate, '%', 'PIA royalties over revenue on the EPE increment'],
    ['Fiscal Terms', 'Corp. Tax (%)', quick.taxRate, '%', 'HCT, CIT, development levy, HCDT and NDDC over pre-tax profit on the EPE increment'],
    ['result', 'NPV (screening, mid-year)', scr.npv.toFixed(4), 'USD MM', 'engine result on these inputs'],
    ['result', 'IRR', 'none (no-sign-change)', '%', 'engine result: every year is cash positive in Quick Mode, see the episode note'],
  ]));

  // ---------------------------------------------------------------------------
  // 5. Probabilistic Breakeven Analyzer
  // ---------------------------------------------------------------------------
  // Its CSV reader multiplies each row's rate by 30.44 days and adds it to the
  // row's calendar year, so the file carries DAILY oil rates, one row per
  // month. Dates are the 15th: the reader takes the year in local time, and a
  // first-of-month date would fall into the previous year west of Greenwich.
  const beText = csv(['date', 'oil_rate_bopd'], ek11.map((r) => [`${r.date.slice(0, 8)}15`, r.oil.toFixed(4)]));
  write(`${DIR}/ekene-11-forecast-breakeven.csv`, beText);
  const beRows = breakevenProcessProductionData(parseLikeBreakeven(beText));
  {
    const annual = mid.perWell.get('Ekene-11');
    for (const r of beRows) {
      const months = ek11.filter((m) => +m.date.slice(0, 4) === r.year);
      const exact = months.reduce((s, m) => s + m.oil * 30.44, 0);
      assertClose(`breakeven ${r.year} volume on the reader's 30.44-day month`, r.oil_production_bbl, exact, 0.01 * months.length);
      assertClose(`breakeven ${r.year} volume against the calendar`, r.oil_production_bbl, annual.get(r.year).oil, 0.02 * annual.get(r.year).oil);
    }
  }
  const beInputs = {
    iterations: 2000, seed: DEFAULT_SEED, discountRate: DESIGN.discount_rate_pct, targetNpv: 0,
    royaltyRate: royaltyPct, taxRate: takePct,
    productionData: { data: beRows, fileName: 'ekene-11-forecast-breakeven.csv' },
    variables: [
      { id: 1, name: 'Total CAPEX ($MM)', p10: 11.2, p50: 12.4, p90: 14.3, distType: 'Triangular' },
      { id: 2, name: 'Annual OPEX ($MM/year)', p10: 0.15, p50: 0.2, p90: 0.28, distType: 'Triangular' },
      { id: 3, name: 'Production Efficiency (%)', p10: 88, p50: 93, p90: 97, distType: 'Triangular' },
    ],
  };
  const be = generateBreakevenData(beInputs);
  write(`${DIR}/breakeven-inputs.csv`, sheet(['section', 'field', 'p10', 'p50', 'p90', 'unit', 'source'], [
    ['variable', 'Total CAPEX ($MM)', 11.2, 12.4, 14.3, 'USD MM', 'P50 is the AFE 11.8 plus hook-up 0.6; the spread is a design value (minus 10, plus 15 percent)'],
    ['variable', 'Annual OPEX ($MM/year)', 0.15, 0.2, 0.28, 'USD MM/yr', 'design value: Ekene-11 fixed 0.10 plus its variable opex at its average rate'],
    ['variable', 'Production Efficiency (%)', 88, 93, 97, '%', 'design value: uptime of a platform well'],
    ['setting', 'Discount Rate (%)', '', DESIGN.discount_rate_pct, '', '%', 'as the EPE case'],
    ['setting', 'Royalty Rate (%)', '', royaltyPct, '', '%', 'as the NPV Scenario Builder sheet'],
    ['setting', 'Tax Rate (%)', '', takePct, '', '%', 'as the NPV Scenario Builder sheet'],
    ['setting', 'Target NPV ($MM)', '', 0, '', 'USD MM', 'the default'],
    ['setting', 'Monte Carlo Iterations', '', 2000, '', '', 'down from the default 5000 so the run is quick on camera; Run Seed left at its default'],
    ['result', 'breakeven oil price percentiles', be.kpis.p10.toFixed(2), be.kpis.p50.toFixed(2), be.kpis.p90.toFixed(2), 'USD/bbl', 'engine result on these inputs'],
  ]));

  // ---------------------------------------------------------------------------
  // 6. Decision Tree Builder: drill Ekene-11 or not
  // ---------------------------------------------------------------------------
  const outcomeNpv = OUTCOMES.map((o) => {
    const pw = buildPerWell(monthlyText, rates, GOR, o.qiScale);
    const t = caseTexts(pw.perWell, { withEk11: true });
    return runEpe(buildCfg(t.rows.abandonment_usd), t.prod, t.capex, t.opex).kpis.npv - epeBase.kpis.npv;
  });
  assertClose('the mid outcome is the EPE increment', outcomeNpv[1], increment, 1e-6);
  const pay = (usd) => Math.round(usd / 1e4) / 100;   // USD MM to two decimals, as typed
  let id = 1;
  const nid = () => `n${id++}`;
  const drillChance = () => ({
    id: nid(), type: 'chance', label: 'Ekene-11 initial rate',
    branches: OUTCOMES.map((o, i) => ({
      label: o.label, probability: o.probability,
      node: { id: nid(), type: 'terminal', label: `${o.label}: NPV10 increment`, payoff: pay(outcomeNpv[i]) },
    })),
  });
  const tree = {
    id: nid(), type: 'decision', label: 'Ekene-11',
    branches: [
      { label: 'Drill Ekene-11', cost: 0, node: drillChance() },
      { label: 'Do not drill', cost: 0, node: { id: nid(), type: 'terminal', label: 'Base case (no change)', payoff: 0 } },
    ],
  };
  id = 1;
  const perfect = {
    id: nid(), type: 'chance', label: 'Initial rate known before the decision',
    branches: OUTCOMES.map((o, i) => ({
      label: o.label, probability: o.probability,
      node: {
        id: nid(), type: 'decision', label: `Knowing ${o.label.toLowerCase()}`,
        branches: [
          { label: 'Drill Ekene-11', cost: 0, node: { id: nid(), type: 'terminal', label: 'NPV10 increment', payoff: pay(outcomeNpv[i]) } },
          { label: 'Do not drill', cost: 0, node: { id: nid(), type: 'terminal', label: 'Base case (no change)', payoff: 0 } },
        ],
      },
    })),
  };
  write(`${DIR}/ekene-11-decision-tree.json`, `${JSON.stringify({ projectName: 'Ekene-11 drill decision', tree }, null, 2)}\n`);
  write(`${DIR}/ekene-11-perfect-information.json`, `${JSON.stringify({ projectName: 'Ekene-11 with perfect information', tree: perfect }, null, 2)}\n`);
  const rb = rollback(tree);
  const rbP = rollback(perfect);
  const V = evpi(OUTCOMES.map((o) => ({ label: o.label, probability: o.probability })), [
    { label: 'Drill Ekene-11', cost: 0, payoffs: outcomeNpv.map(pay) },
    { label: 'Do not drill', cost: 0, payoffs: OUTCOMES.map(() => 0) },
  ]);
  assertClose('tree EMV equals the engine EVPI prior EMV', rb.emv, V.emvPrior, 1e-9);
  assertClose('perfect-information tree equals EV with perfect information', rbP.emv, V.evWithPerfect, 1e-9);
  if (rb.bestBranchIndex !== 0) throw new Error('ASSERT the tree recommends drilling');
  if (!(V.evpi > 0)) throw new Error('ASSERT perfect information has value (the low case loses money)');

  // ---------------------------------------------------------------------------
  // 7. README
  // ---------------------------------------------------------------------------
  const r2 = (x) => x.toFixed(2);
  write(`${DIR}/README.md`, [
    '# Economics: the field, valued, and Ekene-11, decided', '',
    'Four applications, one set of numbers. Every volume comes from the field on production',
    '(`08-production`) and from the Ekene-11 plan; every dollar was computed by the Suite\'s own',
    'engines on these exact files when the kit was generated.', '',
    '## Where the volumes come from', '',
    '- **History, 2020 to 2025**: the kit\'s monthly file `08-production/ekene-production-monthly.csv`,',
    '  each daily rate times the days in its month, summed by year. The generator checks every',
    '  year against the production fixture summed independently.',
    `- **Base forecast, from January 2026**: each producer carries on under the fixture's own`,
    `  waterflood model. After its response ramp, gross liquid declines at ${rates.wells[0].flood_response.post_ramp_decline_per_day}`,
    '  per day (checked month by month over the post-ramp history), and the water cut, which the',
    '  model grows to its maximum exactly at the end of history, holds there. Gas is oil times a',
    `  GOR of ${LOCKED.rsi_scf_stb} scf/stb, as in the history. Each well stops at ${ECON_LIMIT_BOPD} bopd, the fixture's own economic limit.`,
    `  The field starts 2026 at ${lastOil.toFixed(1)} bopd.`,
    `- **Ekene-11**: first oil ${EKENE11.first_oil}, hyperbolic, qi ${EKENE11.forecast.qi_bopd} bopd, Di ${EKENE11.forecast.di_per_day} per day,`,
    `  b ${EKENE11.forecast.b}, to ${ECON_LIMIT_BOPD} bopd in ${ek11LastDate.slice(0, 7)}: ${Math.round(ek11Eur).toLocaleString('en-US')} stb. It is forecast dry (no water),`,
    '  which is a simplification of this kit.', '',
    '## Design values (not taught anywhere; chosen for this kit)', '',
    '| Item | Value |', '|---|---|',
    `| Oil price | USD ${DESIGN.oil_price_usd_bbl}/bbl flat, no escalation (the Run Console default price) |`,
    '| Gas price | 0: associated gas is platform fuel and permitted flare, so it earns nothing |',
    `| Discount rate | ${DESIGN.discount_rate_pct} percent, year-end, valued at 1 January ${DESIGN.base_year}, no inflation |`,
    `| Field fixed opex | USD ${DESIGN.field_fixed_opex_usd.toLocaleString('en-US')} a year |`,
    `| Ekene-11 fixed opex | USD ${DESIGN.ekene11_fixed_opex_usd.toLocaleString('en-US')} a year while it produces |`,
    `| Variable opex | USD ${DESIGN.variable_opex_usd_per_bbl_liquid} per barrel of oil plus water |`,
    `| Ekene-11 capital | USD ${EKENE11.dc_cost_usd.toLocaleString('en-US')} drilling and completion (the Drilling episode's AFE) plus USD ${DESIGN.ekene11_tie_in_usd.toLocaleString('en-US')} hook-up, both 2027 |`,
    `| Decommissioning | USD ${DESIGN.field_abandonment_usd.toLocaleString('en-US')} for the field plus USD ${DESIGN.ekene11_abandonment_usd.toLocaleString('en-US')} for Ekene-11, post tax, in the last economic year |`,
    '| Fiscal regime | PIA, shallow water, PML, converted lease, 35 m water depth; base year 2026 puts it under the NTA 2025 framework |', '',
    '## What the engines return', '',
    '| | |', '|---|---|',
    `| Field NPV10 with Ekene-11 (EPE) | ${money(K.npv)} |`,
    `| Field NPV10 without Ekene-11 | ${money(epeBase.kpis.npv)} |`,
    `| Ekene-11 increment (EPE, full fiscal) | ${money(increment)}; its cash flow has two IRR roots, ${r2(wellIrr)} percent (the well's return) and ${r2(Math.min(...incrIrr.irr_roots))} percent (made by the decommissioning bill) |`,
    `| Field economic limit | ${K.economic_limit_year} with Ekene-11, ${epeBase.kpis.economic_limit_year} without |`,
    '| EPE breakeven oil price | not reported on this case: with the economic limit on, the engine\'s bracket collapses (see Episode 26) |',
    `| Ekene-11, NPV Scenario Builder Quick Mode | USD ${r2(scr.npv)} MM, no IRR (every year cash positive) |`,
    `| Ekene-11 breakeven price, 10th / 50th / 90th percentile | USD ${r2(be.kpis.p10)} / ${r2(be.kpis.p50)} / ${r2(be.kpis.p90)} per bbl |`,
    `| Decision tree EMV, drill | USD ${r2(rb.emv)} MM (${OUTCOMES.map((o, i) => `${o.probability} x ${r2(pay(outcomeNpv[i]))}`).join(' + ')}) |`,
    `| EVPI on the initial rate | USD ${r2(V.evpi)} MM |`, '',
    '## Files', '',
    '| File | Application |', '|---|---|',
    '| `ekene-production-2p.csv` | Petroleum Economics Studio, production slot, tagged 2P (one column per well and stream) |',
    '| `ekene-capex.csv` | Petroleum Economics Studio, CAPEX slot |',
    '| `ekene-opex.csv` | Petroleum Economics Studio, OPEX slot |',
    '| `epe-case-inputs.csv` | what to set in the Run Console, and the results to expect |',
    '| `npv-scenario-builder-ekene-11.csv` | NPV Scenario Builder, Quick Mode fields |',
    '| `ekene-11-forecast-breakeven.csv` | Probabilistic Breakeven Analyzer, production upload (daily rates, one row per month) |',
    '| `breakeven-inputs.csv` | Probabilistic Breakeven Analyzer, variables and settings |',
    '| `ekene-11-decision-tree.json` | Decision Tree Builder, Import |',
    '| `ekene-11-perfect-information.json` | Decision Tree Builder, Import: the same outcomes known in advance |',
  ].join('\n'));

  // ---------------------------------------------------------------------------
  // 8. Report and episode notes
  // ---------------------------------------------------------------------------
  say(`  economics: EPE NPV10 ${mm(K.npv, 4)} MM with Ekene-11, ${mm(epeBase.kpis.npv, 4)} MM without `
    + `(increment ${mm(increment, 4)} MM), economic limit ${K.economic_limit_year}, IRR ${K.irr_status}`);
  say(`  economics: screening NPV ${scr.npv.toFixed(4)} MM, IRR ${scr.irrStatus}; breakeven P50 ${be.kpis.p50.toFixed(2)} USD/bbl; `
    + `increment IRR roots ${incrIrr.irr_roots.map((x) => x.toFixed(2)).join(' and ')} %; tree EMV ${rb.emv.toFixed(4)} MM, EVPI ${V.evpi.toFixed(4)} MM`);

  // The IRR line the results screen prints, from the screen's own helper.
  const irrScreen = epeIrrReason(K);
  if (K.irr !== null || K.irr_status !== 'multiple-roots') {
    throw new Error(`ASSERT the field case has no single IRR (status ${K.irr_status}); rewrite the note`);
  }
  const irrWords = `The IRR reads n/a with the reason "${irrScreen}" That is right: the field is already cash positive in 2026, `
    + 'goes negative in 2027 when Ekene-11 is paid for, and pays for its decommissioning at the end, so no one rate describes it. '
    + 'Read the NPV. The breakeven oil price line stays empty on this case: with the economic limit on, the engine cannot bracket it. ';
  const episodes = [
    { n: 26, app: 'Petroleum Economics Studio', files: [
      [`${DIR}/ekene-production-2p.csv`, 'production slot; choose 2P in the Scenario tag box before you upload'],
      [`${DIR}/ekene-capex.csv`, 'CAPEX slot: Ekene-11 drilling and completion plus hook-up, 2027'],
      [`${DIR}/ekene-opex.csv`, 'OPEX slot: fixed and variable, 2020 to the last forecast year'],
      [`${DIR}/epe-case-inputs.csv`, 'every Run Console field to change, with the reason'],
      [`${DIR}/README.md`, 'where each number comes from'],
    ], note: 'Create a case and upload the three files. In the Run Console set these first: Reserves scenario 2P, fiscal regime PIA 2021 (Nigeria) '
      + '(shallow water, PML and converted are already selected; set water depth to 35 m), oil price 75 (the default), gas price 0, '
      + 'discount rate 10, inflation 0, base year 2026, valuation year 2026 with Treat years before valuation as sunk ticked, '
      + `Apply economic limit test ticked, abandonment cost ${abandonment.toLocaleString('en-US')} with the year blank. `
      + 'Then press Customize per stream and set all four escalators to 0: the inflation box does not change them, '
      + 'and left at 3 percent they escalate the price and the opex. '
      + `The run returns an NPV10 of ${money(K.npv)} for the field with Ekene-11 under the NTA 2025 framework, `
      + `and an economic limit in ${K.economic_limit_year}. ${irrWords}`
      + `The same field without Ekene-11 is worth ${money(epeBase.kpis.npv)} and reaches its limit in ${epeBase.kpis.economic_limit_year}: `
      + 'its remaining oil does not pay for its decommissioning. '
      + `So Ekene-11 is worth ${money(increment)} to the field, partly its own oil and partly the years it keeps the field alive. `
      + `Its own cash flow (the difference between the two runs) returns ${r2(wellIrr)} percent. `
      + 'The history rows (2020 to 2025) are the kit\'s monthly production summed; they show in the table and are not valued.' },
    { n: 27, app: 'NPV Scenario Builder', files: [
      [`${DIR}/npv-scenario-builder-ekene-11.csv`, 'the Quick Mode fields for Ekene-11 alone'],
    ], note: `Quick Mode. Initial rate ${quick.initialRate} bopd, decline ${quick.declineRate} percent a year, oil price ${quick.oilPrice}, `
      + `discount rate ${quick.discountRate}, CAPEX ${quick.capex} $MM, fixed OPEX 0, variable OPEX ${quick.opexPerBbl} $/bbl, `
      + `royalty ${quick.royaltyRate} percent, tax ${quick.taxRate} percent. Calculate: NPV USD ${r2(scr.npv)} MM. `
      + 'The IRR shows N/A, and the reason is the method: Quick Mode books the first year at the full 450 bopd for 365 days, '
      + 'so even the two years that carry the capital are cash positive and there is no rate to find. '
      + `EPE put the same well at ${money(increment)}. The gap is the screening method, and it is worth saying out loud: `
      + 'Quick Mode declines exponentially from a year-start rate for twenty years with no economic limit, splits the capital '
      + 'evenly over two years, discounts mid-year, expenses capital at once for tax and carries no decommissioning. '
      + 'It also cannot see what the well does for the rest of the field, which is keeping it alive past its own limit. '
      + 'Royalty and tax here are the effective PIA rates on the EPE increment, so the fiscal take is the same size. '
      + 'Use it to screen; use EPE to decide.' },
    { n: 28, app: 'Probabilistic Breakeven Analyzer', files: [
      [`${DIR}/ekene-11-forecast-breakeven.csv`, 'Ekene-11 daily oil rate, one row per month'],
      [`${DIR}/breakeven-inputs.csv`, 'the three variables and the settings to type'],
    ], note: 'Upload the forecast first: the rates are daily bopd, one row per month, which is what the analyzer expects '
      + '(it multiplies each row by 30.44 days). Then set the three variables: CAPEX 11.2, 12.4 and 14.3 $MM; '
      + 'annual OPEX 0.15, 0.20 and 0.28 $MM; production efficiency 88, 93 and 97 percent. '
      + `Discount rate ${DESIGN.discount_rate_pct}, royalty ${royaltyPct}, tax ${takePct}, target NPV 0, Monte Carlo iterations 2000 (the default is 5000), Run Seed left as it is. `
      + `The breakeven oil price comes back at USD ${r2(be.kpis.p10)}, ${r2(be.kpis.p50)} and ${r2(be.kpis.p90)} per bbl at the 10th, `
      + `50th and 90th percentiles, and the three medians on their own break even at USD ${r2(be.baseBreakeven)}. `
      + `That is above the design price of USD ${DESIGN.oil_price_usd_bbl} at which EPE and the NPV Scenario Builder both value the well positively, `
      + 'and the difference is the method, which is the point of this episode: the analyzer books all the capital in the first '
      + 'production year and expenses it there, and a year\'s tax loss is not carried forward, so most of the tax relief on '
      + `the capital is lost at a ${takePct} percent take. It also charges the same OPEX every year to ${ek11LastDate.slice(0, 4)}. Read it as a strict screen. `
      + 'The tornado shows which belief moves it most.' },
    { n: 29, app: 'Decision Tree Builder', files: [
      [`${DIR}/ekene-11-decision-tree.json`, 'Import: drill Ekene-11 or not, three initial-rate outcomes'],
      [`${DIR}/ekene-11-perfect-information.json`, 'Import second: the same outcomes known before deciding'],
    ], note: `Import the decision tree. The three outcomes are Ekene-11's initial rate at 315, 450 and 585 bopd with chances `
      + `${OUTCOMES.map((o) => o.probability).join(', ')}, and each payoff is the EPE increment for that rate in $MM: `
      + `${OUTCOMES.map((o, i) => r2(pay(outcomeNpv[i]))).join(', ')}. `
      + `The tree recommends Drill Ekene-11 with an EMV of USD ${r2(rb.emv)} MM. `
      + `Then import the perfect-information tree: knowing the rate first is worth USD ${r2(rbP.emv)} MM, because you would skip the low case. `
      + `The difference, USD ${r2(V.evpi)} MM, is the expected value of perfect information: the most any test or pilot that `
      + 'tells you the rate before you drill could be worth.' },
  ];

  return {
    episodes,
    folders: [[DIR, 'the field valued in EPE, Ekene-11 screened, its breakeven and its drill decision']],
    // for the gate's reference; the generator ignores extra keys
    gates: { K, epeBase: epeBase.kpis, increment, breakeven, scr, be: be.kpis, beBase: be.baseBreakeven, rb: rb.emv, evpi: V.evpi, incrIrr },
  };
}
