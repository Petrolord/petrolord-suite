/**
 * Risked Reserves Valuation U2-002, the store: where a valuation's MEFS,
 * value per barrel and development cost come from, kept in its `econ`
 * block (no new column: the block rides in the saved row's JSON payload).
 */
import { valueProspect } from '@/utils/prospectValuation';
import {
  blankProspect, fromRcpProspect, upgradeProspect, inputProblem, engineInput, resolveEconomics, syncEconomics,
  setInput, setValueBasis, setMefsBasis, setModelField, toRow, fromRow, payloadOf, valuationCsv, valueBasisWord, DEFAULT_ECONOMICS,
} from '../services/rrvStore';
import { ECON_MODEL_DEFAULTS, derivedMefs, npvOfSize } from '../services/rrvEconomics';
import { RRV_SEED_PROSPECTS, RRV_T1_BROWSER_LIST } from '../services/rrvFixtures';

const UUID = '7f3c1a52-9d1e-4b7a-8c55-2f6a0b9e1d11';
const north = () => fromRcpProspect({ id: UUID, ...RRV_SEED_PROSPECTS[0] }, { now: new Date('2026-10-02T15:00:00Z') });

describe('the starting economics are consistent by construction (RRV-U1-016 closed)', () => {
  test('a new prospect starts on the economic model: derived MEFS, and a discovery of exactly the MEFS is worth zero', () => {
    const p = blankProspect(1);
    expect(p.econ).toEqual({ value: 'model', mefs: 'derived', model: { ...ECON_MODEL_DEFAULTS }, modelTouched: {} });
    expect(p.mefs).toBeCloseTo(derivedMefs(ECON_MODEL_DEFAULTS).mefs, 12);
    expect(Math.abs(p.unitValue * p.mefs - p.devCost)).toBeLessThan(1e-6);
    expect(inputProblem(p)).toBeNull();
    // the default valuation, before and after (reported to the owner):
    // before U2-002  MEFS 10, 8 $/boe, 100 $MM: value at the MEFS -20 $MM, Pc 22.5%, EMV 13.6 $MM
    // after          MEFS 20.6, 21.0 $/boe, 432.1 $MM: value at the MEFS 0, Pc 15.0%, EMV 46.4 $MM
    const before = valueProspect({ pg: 0.25, p90: 10, p50: 25, p10: 60, ...DEFAULT_ECONOMICS });
    expect([before.pc, before.emv].map((x) => Number(x.toFixed(3)))).toEqual([0.225, 13.559]);
    const after = valueProspect(engineInput(p));
    expect(Number(p.mefs.toFixed(2))).toBe(20.58);
    expect(Number(p.unitValue.toFixed(2))).toBe(21.0);
    expect(Number(p.devCost.toFixed(1))).toBe(432.1);
    expect([after.pc, after.emv].map((x) => Number(x.toFixed(3)))).toEqual([0.15, 46.382]);
    expect(after.emv).toBeCloseTo(after.pc * npvOfSize(after.meanIfCommercial, ECON_MODEL_DEFAULTS) - 25, 8);
  });

  test('an imported prospect with no economics starts the same way; one valued in ReservoirCalc Pro keeps what was sent, with the MEFS at D / u', () => {
    expect(north().econ).toMatchObject({ value: 'model', mefs: 'derived' });
    const sent = fromRcpProspect({ id: UUID, ...RRV_SEED_PROSPECTS[0], inputs: { ...RRV_SEED_PROSPECTS[0].inputs, economics: { unitValue: 11.5, devCost: 240 } } });
    expect(sent.econ).toMatchObject({ value: 'entered', mefs: 'derived' });
    expect(sent).toMatchObject({ unitValue: 11.5, devCost: 240 });
    expect(sent.mefs).toBeCloseTo(240 / 11.5, 12);
    expect(valueBasisWord(sent)).toBe('sent by ReservoirCalc Pro');
    expect(valueBasisWord(north())).toBe('economic model');
  });

  test('a valuation saved before U2-002 opens exactly as it was valued: entered values and a typed MEFS', () => {
    for (const old of RRV_T1_BROWSER_LIST) {
      const q = upgradeProspect(old);
      expect(q.econ).toMatchObject({ value: 'entered', mefs: 'typed' });
      expect(q).toMatchObject({ mefs: old.mefs, unitValue: old.unitValue, devCost: old.devCost, wellCost: old.wellCost });
    }
    // the Step 1 contradiction is still told on such a row
    const r = resolveEconomics(upgradeProspect(RRV_T1_BROWSER_LIST[1]));
    expect(r.mefs).toBe(10);
    expect(r.derivedMefs).toBeCloseTo(12.5, 12); // 100 / 8: the size that pays
  });
});

describe('typing takes a derived value over; the bases switch back', () => {
  test('a typed MEFS stops following the economics; Derived brings it back', () => {
    const p = blankProspect(1);
    const typed = setInput(p, 'mefs', 30);
    expect(typed.econ.mefs).toBe('typed');
    expect(typed.mefs).toBe(30);
    expect(typed.touched.mefs).toBe(true);
    // the line still meets the engine at the typed MEFS
    expect(typed.unitValue * 30 - typed.devCost).toBeCloseTo(npvOfSize(30, ECON_MODEL_DEFAULTS), 8);
    expect(resolveEconomics(typed).derivedMefs).toBeCloseTo(p.mefs, 12);
    const back = setMefsBasis(typed, 'derived');
    expect(back.mefs).toBeCloseTo(p.mefs, 12);
    expect(back.touched.mefs).toBeUndefined();
  });

  test('a typed value per barrel leaves the model for entered values; the derived MEFS follows as D / u', () => {
    const p = blankProspect(1);
    const typed = setInput(p, 'unitValue', 10);
    expect(typed.econ.value).toBe('entered');
    expect(typed.unitValue).toBe(10);
    expect(typed.devCost).toBe(p.devCost); // the other number stays as it stood
    expect(typed.mefs).toBeCloseTo(p.devCost / 10, 12);
    const model = setValueBasis(typed, 'model');
    expect(model).toMatchObject({ mefs: p.mefs, unitValue: p.unitValue, devCost: p.devCost });
    expect(model.touched.unitValue).toBeUndefined();
  });

  test('an assumption of the model moves the MEFS, u and D together, and is marked as the user\'s', () => {
    const p = blankProspect(1);
    const dearer = setModelField(p, 'capex', 600);
    expect(dearer.econ.modelTouched).toEqual({ capex: true });
    expect(dearer.mefs).toBeGreaterThan(p.mefs);
    expect(dearer.mefs).toBeCloseTo(derivedMefs({ ...ECON_MODEL_DEFAULTS, capex: 600 }).mefs, 12);
    expect(Math.abs(dearer.unitValue * dearer.mefs - dearer.devCost)).toBeLessThan(1e-6);
    expect(setModelField(p, 'nonsense', 1)).toBe(p);
  });

  test('new volumes move a derived value line (the mean commercial size moved), and never a typed one', () => {
    const p = blankProspect(1);
    const bigger = setInput(p, 'p10', 200);
    expect(bigger.mefs).toBeCloseTo(p.mefs, 12); // the model's MEFS does not depend on the prospect
    expect(bigger.unitValue).toBeCloseTo(p.unitValue, 6); // and its line is straight above the MEFS here
    const entered = setInput(setInput(p, 'unitValue', 9), 'devCost', 90);
    expect(setInput(entered, 'p10', 200)).toMatchObject({ unitValue: 9, devCost: 90, mefs: 10 });
  });
});

describe('a blank or impossible economics is named, never valued', () => {
  test('a blank model assumption', () => {
    const p = setModelField(blankProspect(1), 'price', '');
    expect(p.mefs).toBe('');
    expect(inputProblem(p)).toMatch(/Economic model: enter price/);
  });
  test('a model in which no size pays', () => {
    const p = setModelField(blankProspect(1), 'price', 5);
    expect(inputProblem(p)).toMatch(/no field size pays/);
    expect(p.unitValue).toBe('');
  });
  test('entered: a zero value per barrel with a development cost has no MEFS to derive', () => {
    const p = setInput(blankProspect(1), 'unitValue', 0);
    expect(inputProblem(p)).toMatch(/No field size pays: the value per barrel is zero/);
    // with the MEFS typed the prospect values (every commercial outcome loses the development cost)
    expect(inputProblem(setInput(p, 'mefs', 12))).toBeNull();
  });
  test('a blank typed MEFS is asked for', () => {
    expect(inputProblem(setInput(blankProspect(1), 'mefs', ''))).toMatch(/Enter the MEFS/);
  });
});

describe('saved state and export', () => {
  test('the economics block rides in the row\'s JSON payload and reads back to the same valuation (no new column)', () => {
    const p = setModelField(setInput(north(), 'wellCost', 30), 'capex', 350);
    const row = { id: 'row-1', user_id: 'u1', version: 1, schema_version: 1, ...toRow(p) };
    expect(Object.keys(row).sort()).toEqual(['id', 'name', 'prospect_key', 'rcp_prospect_id', 'schema_version', 'user_id', 'valuation', 'version']);
    expect(row.valuation.econ).toMatchObject({ value: 'model', mefs: 'derived', model: { capex: 350 }, modelTouched: { capex: true } });
    const back = fromRow(JSON.parse(JSON.stringify(row)));
    expect(payloadOf(back)).toEqual(payloadOf(p));
    expect(valueProspect(engineInput(back)).emv).toBe(valueProspect(engineInput(p)).emv);
  });

  test('syncEconomics leaves a valuation with no economics block alone', () => {
    const bare = { mefs: 10, unitValue: 8, devCost: 100 };
    expect(syncEconomics(bare)).toBe(bare);
  });

  test('the CSV says which basis each row is on', () => {
    const a = blankProspect(1);
    const b = setInput(setInput(blankProspect(2), 'unitValue', 9), 'mefs', 14);
    const rows = [a, b].map((p) => ({ p, v: valueProspect(engineInput(p)) }));
    const csv = valuationCsv(rows, { generatedAt: new Date('2026-10-02T15:00:00Z') }).split('\n');
    expect(csv.some((l) => /^# A derived MEFS is the size at which a discovery is worth zero/.test(l))).toBe(true);
    const head = csv.find((l) => l.startsWith('prospect,')).split(',');
    expect(head.slice(-2)).toEqual(['mefs_basis', 'value_basis']);
    expect(csv[csv.length - 2].split(',').slice(-2)).toEqual(['derived', 'economic model']);
    expect(csv[csv.length - 1].split(',').slice(-2)).toEqual(['typed', 'entered']);
  });
});
