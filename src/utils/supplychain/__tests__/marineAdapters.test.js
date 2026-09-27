/**
 * Marine Logistics Planner adapters (SC4).
 *
 * The engine is validated in packages/engines/__tests__/supplychain.marine.test.js
 * against an independent oracle. These check the seam: that the Ekene demo
 * reaches the engine exactly as the engine's own Ekene cases state it (built
 * here from the fixture the way the oracle builds them), that a blank control
 * reaches it as absent (so the engine refuses by name), and that a pasted data
 * set is read or refused plainly.
 */
import fs from 'fs';
import path from 'path';
import * as ml from '@/utils/supplychain/engine/marineLogistics';
import {
  EKENE_MARINE, ENGINE_COMMIT, VIEWS, applyDataSet, berthCurve, buildDeckArgs, buildFleetArgs, buildShoreArgs,
  buildVariabilityArgs, buildVoyageArgs, defaultInputs, ekeneDemoInputs, inputsFromPayload, installationsToCsv,
  isRefusal, parseDataSetJson, parseDataText, parseDeckItemsCsv, parseInstallationsCsv, runView, toNum,
} from '@/utils/supplychain/marineAdapters';

const ENG = path.resolve(__dirname, '../../../../packages/engines');
const fx = JSON.parse(fs.readFileSync(path.join(ENG, 'test-data/supplychain/ekene-marine/marine.json'), 'utf8'));
const goldens = JSON.parse(fs.readFileSync(path.join(ENG, 'test-data/supplychain/goldens/marine_cases.json'), 'utf8'));
const golden = (id) => goldens.cases.find((c) => c.id === id).args;
const demo = ekeneDemoInputs();

// The engine's Ekene cases, built from the fixture as the oracle builds them.
const P = fx.products;
const WX = { factor: fx.weather.factor, appliesTo: fx.weather.appliesTo };
const vinst = fx.installations.map((x) => ({ id: x.id, name: x.name, fieldHours: x.fieldHours, cargo: x.voyageCargo }));
const finst = fx.installations.map((x) => ({ id: x.id, name: x.name, fieldHours: x.fieldHours, minVisits: x.minVisits, demand: x.demand }));
const finstD = finst.map((x, i) => ({ ...x, distanceFromBaseNm: fx.installations[i].distanceFromBaseNm }));
const baseV = {
  vessel: fx.vessels.psv, products: P, installations: vinst, route: fx.milkRun, portHours: fx.portHours, weather: WX, fuelPricePerT: fx.fuelPricePerT,
};
const baseF = {
  vessel: fx.vessels.psv, products: P, installations: finst, route: fx.milkRun, portHours: fx.portHours, weather: WX, fuelPricePerT: fx.fuelPricePerT,
  periodDays: fx.period.periodDays, vesselAvailableDays: fx.period.vesselAvailableDays, voyageRounding: 'up', vesselRounding: 'up',
};
const baseMc = {
  ...baseF,
  weather: { factor: fx.variability.weatherFactor, appliesTo: fx.weather.appliesTo },
  demandFactor: fx.variability.demandFactor,
  plannedVessels: fx.variability.plannedVessels,
  iterations: fx.variability.iterations,
  seed: fx.variability.seed,
};
const { name: _deckName, ...sbNoName } = fx.shoreBase;

describe('the Ekene demo', () => {
  it('is the engines fixture, read as it is', () => {
    expect(EKENE_MARINE).toEqual(fx);
    expect(fx.installations).toHaveLength(4);
  });

  it('names the engine commit the vendoring pin records', () => {
    const vendor = JSON.parse(fs.readFileSync(path.join(ENG, 'VENDOR.json'), 'utf8'));
    expect(ENGINE_COMMIT).toBe(vendor.canonical.commit);
  });

  it('passes each Ekene case to the engine exactly', () => {
    expect(buildVoyageArgs(demo)).toEqual(baseV);
    expect(buildFleetArgs(demo)).toEqual(baseF);
    expect(buildVariabilityArgs(demo)).toEqual(baseMc);
    expect(buildDeckArgs(demo, 'first-fit-decreasing-area')).toEqual({ deck: fx.deck, items: fx.deckItems, voyages: 1, rule: 'first-fit-decreasing-area' });
    expect(buildDeckArgs(demo, 'first-fit')).toEqual({ deck: fx.deck, items: fx.deckItems, voyages: 1, rule: 'first-fit' });
    expect(buildShoreArgs(demo)).toEqual({ ...sbNoName, model: 'M/M/c', targetMeanWaitHours: 1 });
  });

  it('agrees with the engine goldens of the same names', () => {
    expect(buildVoyageArgs(demo)).toEqual(golden('ekene-voyage-milk-run-psv'));
    expect(buildFleetArgs(demo)).toEqual(golden('ekene-fleet-psv-milk-run'));
    expect(buildVariabilityArgs(demo)).toEqual(golden('ekene-variability-psv-milk-run'));
    expect(buildDeckArgs(demo, 'first-fit-decreasing-area')).toEqual(golden('ekene-deck-one-voyage-ffd'));
    expect(buildDeckArgs(demo, 'first-fit')).toEqual(golden('ekene-deck-one-voyage-first-fit'));
    expect(buildShoreArgs(demo)).toEqual(golden('ekene-base-mmc-target-one-hour'));
  });

  it('sends distances only on dedicated voyages, as the engine reads them', () => {
    const d = ekeneDemoInputs();
    d.fleet.mode = 'dedicated';
    expect(buildFleetArgs(d)).toEqual({ ...baseF, installations: finstD, route: { mode: 'dedicated' } });
    expect(buildFleetArgs(d)).toEqual(golden('ekene-fleet-psv-dedicated'));
    d.voyage.mode = 'dedicated';
    expect(buildVoyageArgs(d)).toEqual(golden('ekene-voyage-dedicated-psv'));
    d.voyage.vessel = 'ahts';
    d.voyage.mode = 'milk-run';
    expect(buildVoyageArgs(d)).toEqual(golden('ekene-voyage-milk-run-ahts'));
  });

  it('runs every view through the engine with no refusal', () => {
    for (const key of Object.keys(VIEWS)) {
      const r = runView(key, demo);
      expect({ key, error: r.error }).toEqual({ key, error: undefined });
    }
  });

  it('gives the planted Ekene situations', () => {
    const v = runView('voyage', demo).voyages[0];
    expect(v.binding.constraint).toBe('deck area');
    expect(v.feasible).toBe(true);
    const f = runView('fleet', demo);
    expect(f.vessels).toBe(2);
    expect(f.voyageSets[0].drivenBy).toBe('deck area');
    expect(runView('deckFf', demo).overflow.map((o) => o.unit)).toEqual(['pipe-bundle#2']);
    expect(runView('deckFfd', demo).overflow).toHaveLength(11);
    const one = ekeneDemoInputs();
    one.shore.berths = 1;
    expect(runView('shore', one).field).toBe('arrivalsPerDay');
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
    expect(fields).toEqual({
      voyage: 'products', fleet: 'products', variability: 'products', deckFfd: 'deck.areaM2', deckFf: 'deck.areaM2', shore: 'berths',
    });
  });

  it('shows the engine refusal word for word', () => {
    const inputs = ekeneDemoInputs();
    inputs.voyage.fuelPricePerT = '';
    const r = runView('voyage', inputs);
    expect(r).toEqual(ml.voyagePlan({ ...baseV, fuelPricePerT: undefined }));
    expect(r.field).toBe('fuelPricePerT');
  });

  it('leaves every unstated choice absent, so the engine asks for it', () => {
    const cases = [
      ['voyage', (i) => { i.voyage.vessel = ''; }, 'vessel'],
      ['voyage', (i) => { i.voyage.mode = ''; }, 'route'],
      ['voyage', (i) => { i.voyage.appliesTo = []; }, 'weather.appliesTo'],
      ['fleet', (i) => { i.fleet.vesselRounding = ''; }, 'vesselRounding'],
      ['fleet', (i) => { i.fleet.voyageRounding = ''; }, 'voyageRounding'],
      ['variability', (i) => { i.variability.demandMode = ''; }, 'demandFactor'],
      ['variability', (i) => { i.variability.seed = ''; }, 'seed'],
      ['shore', (i) => { i.shore.concurrent = ''; }, 'service.concurrent'],
      ['shore', (i) => { i.shore.model = ''; }, 'model'],
      ['deckFfd', (i) => { i.deck.voyages = ''; }, 'voyages'],
    ];
    for (const [view, edit, field] of cases) {
      const inputs = ekeneDemoInputs();
      edit(inputs);
      expect({ view, field: runView(view, inputs).field }).toEqual({ view, field });
    }
  });

  it('sends a tank for every product as stated, so a missing one is refused by name', () => {
    const inputs = ekeneDemoInputs();
    delete inputs.cluster.vessels[0].tanks.barite;
    expect(runView('voyage', inputs).field).toBe('vessel.tanks.barite');
  });

  it('reads blank as absent and text as a number the engine can refuse', () => {
    expect(toNum('')).toBeUndefined();
    expect(toNum(' 2.5 ')).toBe(2.5);
    expect(Number.isNaN(toNum('abc'))).toBe(true);
  });

  it('asks nothing of a target it was not given', () => {
    const inputs = ekeneDemoInputs();
    inputs.shore.targetMeanWaitHours = '';
    const r = runView('shore', inputs);
    expect(r.target).toBeUndefined();
    expect(buildShoreArgs(inputs)).not.toHaveProperty('targetMeanWaitHours');
  });
});

describe('the berth curve', () => {
  it('is one engine call per berth count, from the first count with a steady state', () => {
    const r = runView('shore', demo);
    const curve = berthCurve(demo, r.offeredLoad);
    expect(curve[0].berths).toBe(Math.floor(r.offeredLoad) + 1);
    for (const p of curve) {
      const direct = ml.shoreBase({ ...sbNoName, model: 'M/M/c', berths: p.berths });
      expect(p.meanWaitHours).toBe(direct.meanWaitHours);
    }
    expect(curve.find((p) => p.berths === 2).meanWaitHours).toBe(r.meanWaitHours);
  });
});

describe('importing', () => {
  it('reads the fixture pasted as JSON into the same inputs as the demo', () => {
    const parsed = parseDataText(JSON.stringify(fx));
    expect(parsed.error).toBeUndefined();
    const inputs = applyDataSet(parsed.dataSet, defaultInputs(), 'ekene');
    expect(inputs.cluster).toEqual(demo.cluster);
    expect(inputs.deck.items).toEqual(demo.deck.items);
  });

  it('refuses a JSON key the planner does not read, at any level', () => {
    expect(parseDataSetJson(JSON.stringify({ ...fx, stowageFactor: 0.8 })).error).toMatch(/The data set has the key "stowageFactor"/);
    const v = JSON.parse(JSON.stringify(fx));
    v.vessels.psv.cruiseSpeed = 12;
    expect(parseDataSetJson(JSON.stringify(v)).error).toMatch(/vessels\.psv has the key "cruiseSpeed"/);
    const x = JSON.parse(JSON.stringify(fx));
    x.installations[1].demand.fuel = 3;
    expect(parseDataSetJson(JSON.stringify(x)).error).toMatch(/installations\[1\]\.demand has the key "fuel"/);
    expect(parseDataSetJson('{').error).toMatch(/could not be read/);
  });

  it('leaves the controls a partial data set does not state as they were', () => {
    const next = applyDataSet({ installations: fx.installations.slice(0, 2) }, demo, 'paste');
    expect(next.cluster.installations).toHaveLength(2);
    expect(next.cluster.vessels).toEqual(demo.cluster.vessels);
    expect(next.voyage).toEqual(demo.voyage);
    expect(next.cluster.source).toBe('paste');
  });

  it('round-trips the installations through CSV to equal engine results', () => {
    const csv = installationsToCsv(demo.cluster.installations);
    const back = parseInstallationsCsv(csv);
    expect(back.error).toBeUndefined();
    const inputs = ekeneDemoInputs();
    inputs.cluster.installations = back.installations;
    expect(runView('voyage', inputs)).toEqual(runView('voyage', demo));
    expect(runView('fleet', inputs)).toEqual(runView('fleet', demo));
  });

  it('refuses a CSV column it does not read, by name', () => {
    expect(parseInstallationsCsv('id,distance\nA,1').error).toMatch(/Column "distance" is not one the planner reads/);
    expect(parseInstallationsCsv('name\nA').error).toMatch(/needs an id column/);
    expect(parseInstallationsCsv('id,fieldHours\nA,1\nA,2').error).toMatch(/repeats the id A/);
    expect(parseDeckItemsCsv('id,heightM\nA,1').error).toMatch(/Column "heightM" is not one the planner reads/);
  });

  it('reads deck cargo from CSV', () => {
    const csv = ['id,name,lengthM,widthM,weightT,quantity', ...fx.deckItems.map((x) => [x.id, `"${x.name}"`, x.lengthM, x.widthM, x.weightT, x.quantity].join(','))].join('\n');
    const back = parseDeckItemsCsv(csv);
    const inputs = ekeneDemoInputs();
    inputs.deck.items = back.items;
    expect(runView('deckFfd', inputs)).toEqual(runView('deckFfd', demo));
  });
});

describe('saved studies', () => {
  it('round-trips a payload, and refuses one that is not a marine study', () => {
    const payload = JSON.parse(JSON.stringify({ name: 'x', schema: 1, engine: ENGINE_COMMIT, inputs: demo }));
    expect(inputsFromPayload(payload)).toEqual(demo);
    expect(inputsFromPayload({ inputs: { register: { items: [] } } })).toBeNull();
    expect(inputsFromPayload(null)).toBeNull();
  });
});
