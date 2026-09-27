/**
 * Marine Logistics Planner views (SC4).
 *
 * One test per view: on the Ekene demo, what the view prints equals what a
 * DIRECT call of the vendored engine returns on the fixture's own figures
 * (the fixture is read from disk here and the arguments built as the engine
 * oracle builds its Ekene cases, independently of the app's adapters). Then
 * the page itself: it mounts blank, loads the demo, and prints an engine
 * refusal word for word.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import {
  render, screen, fireEvent,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn(() => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import * as ml from '../../../../packages/engines/engines/supplychain/marineLogistics.js';
import MarineLogisticsPlanner from '@/pages/apps/MarineLogisticsPlanner';
import { MarineLogisticsProvider } from '@/contexts/MarineLogisticsContext';
import {
  defaultInputs, ekeneDemoInputs, fmtNum, fmtShare,
} from '@/utils/supplychain/marineAdapters';
import InstallationsView from '@/components/marine/InstallationsView';
import VoyagePlanView from '@/components/marine/VoyagePlanView';
import FleetSizingView from '@/components/marine/FleetSizingView';
import FleetVariabilityView from '@/components/marine/FleetVariabilityView';
import DeckPlanView from '@/components/marine/DeckPlanView';
import ShoreBaseView from '@/components/marine/ShoreBaseView';
import { helpContent } from '@/components/marine/MarineLogisticsHelpGuide';

const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../packages/engines/test-data/supplychain/ekene-marine/marine.json'), 'utf8'));
const WX = { factor: fx.weather.factor, appliesTo: fx.weather.appliesTo };
const vinst = fx.installations.map((x) => ({ id: x.id, name: x.name, fieldHours: x.fieldHours, cargo: x.voyageCargo }));
const finst = fx.installations.map((x) => ({ id: x.id, name: x.name, fieldHours: x.fieldHours, minVisits: x.minVisits, demand: x.demand }));
const baseV = {
  vessel: fx.vessels.psv, products: fx.products, installations: vinst, route: fx.milkRun, portHours: fx.portHours, weather: WX, fuelPricePerT: fx.fuelPricePerT,
};
const baseF = {
  vessel: fx.vessels.psv, products: fx.products, installations: finst, route: fx.milkRun, portHours: fx.portHours, weather: WX, fuelPricePerT: fx.fuelPricePerT,
  periodDays: fx.period.periodDays, vesselAvailableDays: fx.period.vesselAvailableDays, voyageRounding: 'up', vesselRounding: 'up',
};
const { name: _baseName, ...sb } = fx.shoreBase;

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});

const mountView = (View, inputs = ekeneDemoInputs()) => render(
  <MemoryRouter><MarineLogisticsProvider initialInputs={inputs}><View /></MarineLogisticsProvider></MemoryRouter>,
);
const text = (id) => screen.getByTestId(id).textContent;
const whole = (x) => fmtNum(x, Number.isInteger(x) ? 0 : 4);

describe('each view on the Ekene demo prints what the engine returns', () => {
  it('installations and demand: the fixture cluster', () => {
    mountView(InstallationsView);
    expect(text('installation-count')).toBe('4 installations');
    expect(text('product-count')).toBe('6 products');
    expect(text('vessel-count')).toBe('2 vessels');
    for (const x of fx.installations) {
      expect(screen.getByTestId(`installation-row-${x.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('inst-demand-area-1')).toHaveValue(fx.installations[1].demand.deckAreaM2);
    expect(screen.getByTestId('inst-cargo-mud-1')).toHaveValue(fx.installations[1].voyageCargo.bulk.mud);
    expect(screen.getByTestId('milkrun-stops')).toHaveValue(fx.milkRun.stops.join(', '));
    fx.milkRun.legsNm.forEach((nm, i) => expect(screen.getByTestId(`milkrun-leg-${i}`)).toHaveValue(nm));
    expect(screen.getByTestId('vessel-deckUsableFraction-0')).toHaveValue(fx.vessels.psv.deckUsableFraction);
  });

  it('voyage plan: the binding constraint named and utilisation per constraint', () => {
    mountView(VoyagePlanView);
    const r = ml.voyagePlan(baseV);
    const v = r.voyages[0];
    expect(v.binding.constraint).toBe('deck area');
    expect(text('voyage-milk-run-binding')).toBe(`${v.binding.constraint}, ${fmtShare(v.binding.utilisation, 2)}`);
    expect(text('voyage-milk-run-hours')).toBe(fmtNum(v.hours.total, 4));
    expect(text('voyage-milk-run-days')).toBe(fmtNum(v.days, 4));
    expect(text('voyage-milk-run-fuel')).toBe(`${fmtNum(v.fuelT.total, 4)} t, ${fmtNum(v.fuelCost, 2)}`);
    expect(text('voyage-milk-run-feasible')).toBe('Fits the vessel');
    v.constraints.forEach((c, i) => {
      expect(text(`voyage-milk-run-util-${i}`)).toBe(fmtShare(c.utilisation, 2));
      expect(text(`voyage-milk-run-capacity-${i}`)).toContain(fmtNum(c.capacity, 2));
    });
    expect(text('voyage-milk-run-reasons-reason-0')).toBe(v.reasons[0]);
    expect(text('voyage-total-cost')).toBe(fmtNum(r.totals.fuelCost, 2));
  });

  it('fleet sizing: stated rounding rules and the driver named', () => {
    mountView(FleetSizingView);
    const r = ml.fleetSize(baseF);
    expect(text('fleet-vessels')).toBe(whole(r.vessels));
    expect(text('fleet-vessels-exact')).toBe(fmtNum(r.vesselsExact, 4));
    expect(text('fleet-vessel-days')).toBe(fmtNum(r.vesselDays, 4));
    expect(text('fleet-capacity-days')).toBe(fmtNum(r.capacityDays, 4));
    expect(text('fleet-utilisation')).toBe(fmtShare(r.fleetUtilisation, 2));
    expect(text('fleet-cost')).toBe(fmtNum(r.fuelCost, 2));
    const s = r.voyageSets[0];
    expect(text('fleet-set-milk-run-driver')).toBe(s.drivenBy);
    expect(s.drivenBy).toBe('deck area');
    expect(text('fleet-set-milk-run-exact')).toBe(fmtNum(s.voyagesExact, 4));
    expect(text('fleet-set-milk-run-voyages')).toBe(whole(s.voyages));
    expect(text('fleet-basis')).toContain(r.basis.rule);
    expect(screen.getByTestId('fleet-voyage-rounding')).toHaveValue('up');
    expect(screen.getByTestId('fleet-vessel-rounding')).toHaveValue('up');
  });

  it('fleet variability: seeded Monte Carlo, P90 labelled as the low figure', () => {
    mountView(FleetVariabilityView);
    const r = ml.fleetVariability({
      ...baseF,
      weather: { factor: fx.variability.weatherFactor, appliesTo: fx.weather.appliesTo },
      demandFactor: fx.variability.demandFactor,
      plannedVessels: fx.variability.plannedVessels,
      iterations: fx.variability.iterations,
      seed: fx.variability.seed,
    });
    expect(text('variability-short')).toBe(fmtShare(r.probabilityShort, 2));
    expect(text('variability-expected-short')).toBe(fmtNum(r.expectedShortVesselDays, 4));
    for (const k of ['mean', 'p90', 'p50', 'p10', 'min', 'max']) {
      expect(text(`variability-days-${k}`)).toBe(fmtNum(r.vesselDays[k], 4));
      expect(text(`variability-vessels-${k}`)).toBe(fmtNum(r.vesselsRequired[k], 4));
    }
    expect(screen.getByTestId('variability-row-p90').textContent).toContain('P90 (low, the 10th percentile)');
    expect(screen.getByTestId('variability-row-p10').textContent).toContain('P10 (high, the 90th percentile)');
    expect(r.vesselDays.p90).toBeLessThanOrEqual(r.vesselDays.p10);
    r.vesselsDistribution.forEach((d) => expect(text(`variability-dist-${d.vessels}`)).toBe(fmtShare(d.probability, 2)));
    expect(text('variability-definition')).toContain(r.percentileDefinition);
  });

  it('deck plan: first-fit decreasing against first fit, overflow named per unit', () => {
    mountView(DeckPlanView);
    const ffd = ml.deckPlan({ deck: fx.deck, items: fx.deckItems, voyages: 1, rule: 'first-fit-decreasing-area' });
    const ff = ml.deckPlan({ deck: fx.deck, items: fx.deckItems, voyages: 1, rule: 'first-fit' });
    expect(text('deck-total-area')).toBe(fmtNum(ffd.totalAreaM2, 4));
    for (const [k, r] of [['ffd', ffd], ['ff', ff]]) {
      expect(text(`deck-${k}-used`)).toBe(String(r.voyagesUsed));
      expect(text(`deck-${k}-bound`)).toBe(String(r.lowerBound));
      expect(text(`deck-${k}-overflow-count`)).toBe(String(r.overflow.length));
      expect(text(`deck-${k}-voyage-1-area`)).toBe(fmtNum(r.voyages[0].areaM2, 4));
      r.overflow.forEach((o) => expect(text(`deck-${k}-overflow-${o.unit}`)).toBe(o.reason));
      expect(r.neverFit).toEqual([]);
      expect(screen.queryByTestId(`deck-${k}-never-fit`)).toBeNull();
    }
    expect(ff.overflow.map((o) => o.unit)).toEqual(['pipe-bundle#2']);
    expect(text('deck-ff-overflow-pipe-bundle#2')).toMatch(/; usable area stops it$/);
    expect(ffd.overflow).toHaveLength(11);
  });

  it('deck plan: units no voyage can carry are listed apart and left out of the lower bound', () => {
    const inputs = ekeneDemoInputs();
    inputs.deck.items = [
      ...inputs.deck.items,
      { id: 'jacket-leg', name: 'Oversize jacket leg', lengthM: 40, widthM: 20, weightT: 90, quantity: 1 },
      { id: 'anchor', name: 'Heavy anchor', lengthM: 2, widthM: 2, weightT: 2500, quantity: 1 },
    ];
    mountView(DeckPlanView, inputs);
    const items = [
      ...fx.deckItems,
      { id: 'jacket-leg', name: 'Oversize jacket leg', lengthM: 40, widthM: 20, weightT: 90, quantity: 1 },
      { id: 'anchor', name: 'Heavy anchor', lengthM: 2, widthM: 2, weightT: 2500, quantity: 1 },
    ];
    for (const [k, rule] of [['ffd', 'first-fit-decreasing-area'], ['ff', 'first-fit']]) {
      const r = ml.deckPlan({ deck: fx.deck, items, voyages: 1, rule });
      expect([...r.neverFit].sort()).toEqual(['anchor', 'jacket-leg']);
      expect(text(`deck-${k}-bound`)).toBe(String(r.lowerBound));
      expect(text(`deck-${k}-never-fit-units`)).toBe(r.neverFit.join(', '));
      for (const u of r.neverFit) {
        expect(screen.getByTestId(`deck-${k}-overflow-never-${u}`)).toBeInTheDocument();
        expect(text(`deck-${k}-overflow-${u}`)).toBe(r.overflow.find((o) => o.unit === u).reason);
      }
      r.overflow.filter((o) => !r.neverFit.includes(o.unit))
        .forEach((o) => expect(screen.queryByTestId(`deck-${k}-overflow-never-${o.unit}`)).toBeNull());
    }
  });

  it('shore base: M/M/c with the berth target, and M/D/c labelled approximate', () => {
    mountView(ShoreBaseView);
    const r = ml.shoreBase({ ...sb, model: 'M/M/c', targetMeanWaitHours: 1 });
    expect(text('shore-utilisation')).toBe(fmtShare(r.berthUtilisation, 2));
    expect(text('shore-wait')).toBe(fmtNum(r.meanWaitHours, 4));
    expect(text('shore-pwait')).toBe(fmtShare(r.probabilityWait, 2));
    expect(text('shore-queue')).toBe(fmtNum(r.meanQueue, 4));
    expect(text('shore-service')).toBe(fmtNum(r.serviceHours, 4));
    expect(text('shore-target-reason')).toBe(r.target.reason);
    expect(text('shore-model-label')).toMatch(/Erlang C/);
    fireEvent.change(screen.getByTestId('shore-model'), { target: { value: 'M/D/c' } });
    const d = ml.shoreBase({ ...sb, model: 'M/D/c', targetMeanWaitHours: 1 });
    expect(text('shore-wait')).toBe(fmtNum(d.meanWaitHours, 4));
    expect(text('shore-pwait')).toBe('not given for M/D/c');
    expect(text('shore-model-label')).toMatch(/approximate/);
    expect(text('shore-target-reason')).toBe(d.target.reason);
  });
});

describe('refusals and edits', () => {
  it('prints the engine refusal word for word on a blank study', () => {
    mountView(ShoreBaseView, defaultInputs());
    expect(text('shore-refusal-message')).toBe(ml.shoreBase({ service: {} }).error);
  });

  it('refuses one berth as saturated in the engine\'s words', () => {
    mountView(ShoreBaseView);
    fireEvent.change(screen.getByTestId('shore-berths'), { target: { value: '1' } });
    expect(text('shore-refusal-message')).toBe(ml.shoreBase({ ...sb, berths: 1, model: 'M/M/c', targetMeanWaitHours: 1 }).error);
  });

  it('reruns the engine when an input changes, and names the overload', () => {
    mountView(VoyagePlanView);
    fireEvent.change(screen.getByTestId('voyage-weather'), { target: { value: '1.5' } });
    const r = ml.voyagePlan({ ...baseV, weather: { ...WX, factor: 1.5 } });
    expect(text('voyage-milk-run-hours')).toBe(fmtNum(r.voyages[0].hours.total, 4));
  });

  it('refuses a weather factor below 1 in the engine\'s words', () => {
    mountView(FleetSizingView);
    fireEvent.change(screen.getByTestId('fleet-weather'), { target: { value: '0.9' } });
    expect(text('fleet-refusal-message')).toBe(ml.fleetSize({ ...baseF, weather: { ...WX, factor: 0.9 } }).error);
  });
});

describe('the page', () => {
  const mount = () => render(<MemoryRouter><MarineLogisticsPlanner /></MemoryRouter>);

  it('mounts blank with the saved-study rail, the help guide and the engine commit', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Marine Logistics Planner/i })).toBeInTheDocument();
    expect(screen.getByText('Saved study')).toBeInTheDocument();
    expect(screen.getByTitle('Documentation')).toBeInTheDocument();
    expect(text('engine-line')).toMatch(/petrolord-engines [0-9a-f]{7}, engines\/supplychain\/marineLogistics.js/);
    expect(screen.getByTestId('empty-cluster')).toBeInTheDocument();
  });

  it('loads the Ekene demo', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('load-ekene'));
    expect(text('installation-count')).toBe('4 installations');
    expect(text('engine-line')).toMatch(/^Ekene demo \(synthetic\)/);
  });

  it('refuses a pasted table with a column it does not read', async () => {
    mount();
    fireEvent.change(await screen.findByTestId('data-paste'), { target: { value: 'id,distance\nA,1' } });
    fireEvent.click(screen.getByTestId('import-data'));
    expect(text('data-parse-error')).toMatch(/Column "distance" is not one the planner reads/);
  });
});

describe('copy rule on the help text', () => {
  it('has no em dashes and none of the banned contrastives', () => {
    mountView(DeckPlanView);
    const all = `${helpContent.map((h) => `${h.title} ${h.content}`).join(' ')} ${document.body.textContent}`;
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/rather than|instead of|, never|, not /i);
  });
});
