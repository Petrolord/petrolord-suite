/**
 * Basin & Charge Modeling upgrade U2 (docs/upgrade/BasinFlowGenesis-UPGRADE.md,
 * Step 2 build): the services behind each built item. Every test calls the
 * shipped code; the negative controls are recorded in the upgrade doc.
 */
import { SimulationEngine } from '../services/SimulationEngine';
import { burialChartRows, erodedSections, alignSeriesByAge, layerKey } from '../services/resultsView';
import { referenceBasinRow } from '../services/backend';

const ref = () => { const r = referenceBasinRow(); return { stratigraphy: r.stratigraphy, heatFlow: r.heat_flow, erosionEvents: r.erosion_events, settings: r.settings }; };

let refRun;
beforeAll(async () => { refRun = await SimulationEngine.run(ref()); }, 120000);

describe('U2-001 the eroded section on the burial history (BF-T1-E3)', () => {
  test('the reference basin draws its 600 m eroded section from 20 Ma until the 10 Ma event, on top of the column', () => {
    const er = erodedSections(refRun);
    expect(er).toHaveLength(1);
    expect(er[0]).toMatchObject({ depositAge: 20, erodeAge: 10 });
    expect(er[0].amountM).toBeCloseTo(600, 6);
    const rows = burialChartRows(refRun, (m) => m / 0.3048);
    const at = (age) => rows.find((r) => r.age === age);
    expect(at(15)[er[0].key][0]).toBe(0);
    expect(at(15)[er[0].key][1]).toBeCloseTo(600 / 0.3048, 6);
    expect(at(11)[er[0].key]).toBeDefined();
    expect(at(10)[er[0].key]).toBeUndefined();
    expect(at(25)[er[0].key]).toBeUndefined();
  });

  test('a result with no erosion, or saved before U2, draws without one', () => {
    const old = { ...refRun, meta: { ...refRun.meta, phantoms: undefined }, data: { ...refRun.data, phantoms: undefined } };
    expect(erodedSections(old)).toEqual([]);
    expect(burialChartRows(old).every((r) => !Object.keys(r).some((k) => k.startsWith('__eroded')))).toBe(true);
  });
});
