/**
 * Materials & Spares Planner adapters (SC3).
 *
 * The engine is validated in packages/engines/__tests__/supplychain.inventory.test.js
 * against an independent oracle. These check the seam: that the Ekene demo
 * reaches the engine exactly as the fixture states each case, that a blank
 * control reaches it as absent (so the engine refuses by name), and that a
 * pasted register is read or refused plainly.
 */
import fs from 'fs';
import path from 'path';
import * as inv from '@/utils/supplychain/engine/inventory';
import {
  EKENE_REGISTER, ENGINE_COMMIT, VIEWS, buildAbcArgs, buildCriticalityArgs, buildDiscountArgs, buildEoqArgs,
  buildLeadTimeArgs, buildPoissonArgs, buildSafetyArgs, buildSlowArgs, buildSparesArgs, defaultInputs,
  ekeneDemoInputs, fillFromItem, inputsFromPayload, isRefusal, parseRegisterCsv, parseRegisterJson,
  parseRegisterText, registerToCsv, runView, toNum,
} from '@/utils/supplychain/materialsAdapters';

const FIXTURE = path.resolve(__dirname, '../../../../packages/engines/test-data/supplychain/ekene-materials/register.json');
const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const strip = ({ item, note, ...rest }) => rest; // eslint-disable-line no-unused-vars
const demo = ekeneDemoInputs();

describe('the Ekene demo', () => {
  it('is the engines fixture, read as it is', () => {
    expect(EKENE_REGISTER).toEqual(fixture);
    expect(fixture.items).toHaveLength(18);
  });

  it('names the engine commit the vendoring pin records', () => {
    const vendor = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../packages/engines/VENDOR.json'), 'utf8'));
    expect(ENGINE_COMMIT).toBe(vendor.canonical.commit);
  });

  it('passes each stated case to the engine exactly', () => {
    const c = fixture.cases;
    expect(buildEoqArgs(demo)).toEqual(strip(c.eoq));
    expect(buildDiscountArgs(demo)).toEqual(strip(c.quantityDiscount));
    expect(buildSafetyArgs(demo)).toEqual(strip(c.safetyStock));
    expect(buildPoissonArgs(demo)).toEqual(strip(c.poissonStock));
    expect(buildSparesArgs(demo)).toEqual(strip(c.insuranceSpares));
    expect(buildLeadTimeArgs(demo)).toEqual(strip(c.leadTimeRisk));
  });

  it('passes the stated policy and the items to the engine exactly', () => {
    const p = fixture.policy;
    expect(buildCriticalityArgs(demo)).toEqual({
      ...p.criticality, items: fixture.items.map(({ id, name, scores }) => ({ id, name, scores })),
    });
    expect(buildAbcArgs(demo)).toEqual({
      ...p.abc, items: fixture.items.map(({ id, name, annualUsage, unitCost }) => ({ id, name, annualUsage, unitCost })),
    });
    expect(buildSlowArgs(demo)).toEqual({
      ...p.slowMoving,
      items: fixture.items.map(({ id, name, onHand, unitCost, monthsSinceLastIssue, monthlyUsage }) => ({
        id, name, onHand, unitCost, monthsSinceLastIssue, monthlyUsage,
      })),
    });
  });

  it('runs every view through the engine with no refusal', () => {
    for (const key of Object.keys(VIEWS)) {
      const r = runView(key, demo);
      expect({ key, error: r.error }).toEqual({ key, error: undefined });
    }
  });

  it('gives the planted Ekene situations', () => {
    const crit = runView('criticality', demo);
    expect(crit.items.find((x) => x.id === 'PSV-KIT').class).toBe('V');
    expect(crit.items.find((x) => x.id === 'PSV-KIT').forcedBy).toEqual(['safety']);
    expect(runView('abc', demo).items.find((x) => x.id === 'CEM-G').class).toBe('B');
    expect(runView('slow', demo).items.find((x) => x.id === 'HEAT-TRC').band).toBe('obsolete');
  });
});

describe('no hidden defaults', () => {
  it('starts blank, and every blank calculation is refused by the engine by name', () => {
    const blank = defaultInputs();
    const fields = {};
    for (const key of Object.keys(VIEWS)) {
      const r = runView(key, blank);
      expect(isRefusal(r)).toBe(true);
      fields[key] = r.field;
    }
    // The first input each function checks, named in its refusal.
    expect(fields).toEqual({
      criticality: 'criteria',
      abc: 'items',
      eoq: 'annualDemand',
      discount: 'annualDemand',
      safety: 'demandMean',
      poisson: 'demandRate',
      spares: 'failuresPerYear',
      leadTime: 'iterations',
      slow: 'bands',
    });
  });

  it('shows the engine refusal word for word', () => {
    const inputs = ekeneDemoInputs();
    inputs.eoq.orderCost = '';
    const r = runView('eoq', inputs);
    expect(r).toEqual(inv.eoq({ ...strip(fixture.cases.eoq), orderCost: undefined }));
    expect(r.error).toBe('orderCost must be a finite number above 0; got undefined');
  });

  it('leaves an unstated choice absent, so the engine asks for it', () => {
    const inputs = ekeneDemoInputs();
    inputs.abc.boundaryRule = '';
    expect(runView('abc', inputs).field).toBe('boundaryRule');
    inputs.safety.minimumMode = '';
    expect(runView('safety', inputs).field).toBe('minimumSafetyFactor');
    inputs.eoq.holdingMode = '';
    expect(runView('eoq', inputs).field).toBe('holdingCostPerUnitYear');
    inputs.leadTime.demandMode = '';
    expect(runView('leadTime', inputs).field).toBe('demandPerDay');
  });

  it('passes a stated "no floor" as null and a stated floor as its number', () => {
    const inputs = ekeneDemoInputs();
    inputs.safety.minimumMode = 'none';
    expect(buildSafetyArgs(inputs).minimumSafetyFactor).toBeNull();
    inputs.safety.minimumMode = 'value';
    inputs.safety.minimumSafetyFactor = '1.5';
    expect(buildSafetyArgs(inputs).minimumSafetyFactor).toBe(1.5);
  });

  it('reads typed text as numbers and blank as absent', () => {
    expect(toNum('')).toBeUndefined();
    expect(toNum('  ')).toBeUndefined();
    expect(toNum(null)).toBeUndefined();
    expect(toNum('12.5')).toBe(12.5);
    expect(toNum(0)).toBe(0);
    expect(Number.isNaN(toNum('abc'))).toBe(true);
  });
});

describe('the register import', () => {
  it('reads CSV with quoted names and score columns', () => {
    const csv = 'id,name,annualUsage,unitCost,onHand,monthsSinceLastIssue,monthlyUsage,score_safety\nV-1,"Valve, 2 in",12,850,6,2,1,4';
    const r = parseRegisterCsv(csv);
    expect(r.items).toEqual([{
      id: 'V-1', name: 'Valve, 2 in', annualUsage: '12', unitCost: '850', onHand: '6', monthsSinceLastIssue: '2', monthlyUsage: '1', scores: { safety: '4' },
    }]);
  });

  it('round-trips the Ekene register through CSV to the same engine results', () => {
    const csv = registerToCsv(demo.register.items);
    const parsed = parseRegisterText(csv);
    const inputs = { ...demo, register: { ...demo.register, items: parsed.items } };
    expect(runView('abc', inputs)).toEqual(runView('abc', demo));
    expect(runView('criticality', inputs)).toEqual(runView('criticality', demo));
    expect(runView('slow', inputs)).toEqual(runView('slow', demo));
  });

  it('reads the fixture itself as pasted JSON', () => {
    const r = parseRegisterText(JSON.stringify(fixture));
    expect(r.items).toHaveLength(18);
    expect(r.currency).toBe('US$');
  });

  it('refuses a column it does not read, by name', () => {
    expect(parseRegisterCsv('id,anualUsage\nX,1').error).toMatch(/Column "anualUsage" is not one the planner reads/);
    expect(parseRegisterJson('[{"id":"X","holdingrate":1}]').error).toMatch(/"holdingrate"/);
  });

  it('refuses rows with no id or a repeated id', () => {
    expect(parseRegisterCsv('id,name\n,x').error).toMatch(/Row 2 has no id/);
    expect(parseRegisterCsv('id,name\nA,x\nA,y').error).toMatch(/repeats the id A/);
    expect(parseRegisterText('').error).toMatch(/Paste a register/);
    expect(parseRegisterJson('{bad').error).toMatch(/could not be read/);
  });
});

describe('copying an item into a calculation', () => {
  const item = demo.register.items.find((x) => x.id === 'BARYTE');
  it('copies the named figures and nothing else', () => {
    expect(fillFromItem('eoq', item)).toEqual({ itemId: 'BARYTE', annualDemand: item.annualUsage, unitCost: item.unitCost });
    expect(fillFromItem('safety', item)).toEqual({ itemId: 'BARYTE', demandMean: item.monthlyUsage });
    expect(fillFromItem('eoq', undefined)).toEqual({});
  });
});

describe('the saved payload', () => {
  it('round-trips a study', () => {
    expect(inputsFromPayload({ inputs: demo })).toEqual(demo);
  });
  it('refuses a payload that is not a materials study', () => {
    expect(inputsFromPayload(null)).toBeNull();
    expect(inputsFromPayload({ inputs: { tanks: [] } })).toBeNull();
  });
});
