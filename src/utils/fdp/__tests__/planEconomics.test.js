/**
 * EC6-0 gates for the FDP Accelerator's headline economics.
 *
 * The defects these lock, all of them live before this wave:
 *   - an empty plan showed NPV $3,314.2MM in green, because the Economics
 *     tab ran an illustrative twenty year profile at $75/bbl whatever the
 *     plan said;
 *   - the summary rail and the exported PDF printed NPV $0, because nothing
 *     ever called updateEconomics;
 *   - a scenario was priced at a $100MM fallback, because the engine read
 *     `concept.capex` and the form writes drillingCapex, facilitiesCapex and
 *     subseaCapex;
 *   - the Schedule tab promised a critical path and computed none.
 */
import { computePlanEconomics, planEconomicsPayload, selectedConcept, selectedScenario } from '@/utils/fdp/planEconomics';
import { scheduleAnalysis, toNetwork } from '@/utils/fdp/scheduleNetwork';
import { planReservesP50 } from '@/utils/fdp/fdpCalculations';
import { runScenario } from '@/utils/fdp/scenarioCalculations';

const plan = ({ costs = [], concepts = [], scenarios = [], reserves = [] } = {}) => ({
  costs: { items: costs },
  concepts: { list: concepts, selectedId: concepts[0]?.id ?? null },
  scenarios: { list: scenarios, selectedId: scenarios[0]?.id ?? null },
  subsurface: { reserves: { summary: { p50: 0 }, breakdown: reserves } },
});

const concept = {
  id: 1, name: 'FPSO', drillingCapex: 400, facilitiesCapex: 1200, subseaCapex: 300,
  opex: 60, peakProduction: 50,
};
const scenario = { id: 10, name: 'Base', conceptId: 1, oilPrice: 70, discountRate: 10 };
const costItems = [
  { id: 'c1', type: 'CAPEX', amount: 1900 },
  { id: 'c2', type: 'OPEX', amount: 60 },
];

describe('an empty plan reports no economics at all', () => {
  test('no NPV, and it names every missing piece', () => {
    const e = computePlanEconomics(plan());
    expect(e.available).toBe(false);
    expect(e.metrics).toBeUndefined();
    expect(e.missing).toEqual([
      'a CAPEX cost item', 'a development concept', 'an economic scenario',
    ]);
  });

  test('the payload written to the plan carries no NPV either', () => {
    const payload = planEconomicsPayload(computePlanEconomics(plan()));
    expect(payload.available).toBe(false);
    expect(payload.npv).toBe(0);
    expect(payload.irr).toBeNull();
  });

  test('a plan with costs but no concept still reports nothing', () => {
    const e = computePlanEconomics(plan({ costs: costItems }));
    expect(e.available).toBe(false);
    expect(e.missing).toContain('a development concept');
  });

  test('a concept with no peak rate is named, not defaulted to 50 kbpd', () => {
    const e = computePlanEconomics(plan({
      costs: costItems, concepts: [{ ...concept, peakProduction: '' }], scenarios: [scenario],
    }));
    expect(e.available).toBe(false);
    expect(e.missing).toContain('a peak production rate on the concept');
  });
});

describe('a costed plan reports its own economics', () => {
  const state = plan({ costs: costItems, concepts: [concept], scenarios: [scenario] });
  const e = computePlanEconomics(state);

  test('the case is the plan, not an illustration', () => {
    expect(e.available).toBe(true);
    expect(e.inputs.capexMM).toBe(1900);
    expect(e.inputs.annualOpexMM).toBe(60);
    expect(e.basis.oilPrice).toBe(70);
    expect(e.basis.years).toBe(20);
    expect(e.cashflow).toHaveLength(21);
  });

  test('changing the plan changes the number', () => {
    const richer = computePlanEconomics(plan({
      costs: [{ id: 'c1', type: 'CAPEX', amount: 900 }, { id: 'c2', type: 'OPEX', amount: 60 }],
      concepts: [concept],
      scenarios: [scenario],
    }));
    expect(richer.metrics.npv).toBeGreaterThan(e.metrics.npv);
  });

  test('the sensitivity sweep is about this case', () => {
    expect(e.sensitivity.map((s) => s.name)).toEqual(['Oil Price', 'CAPEX', 'OPEX', 'Production']);
    e.sensitivity.forEach((s) => expect(s.baseNPV).toBeCloseTo(e.metrics.npv, 6));
  });

  test('the payload is what the summary rail and the PDF read', () => {
    const payload = planEconomicsPayload(e);
    expect(payload.available).toBe(true);
    expect(payload.capex).toBe(1900);
    expect(payload.npv).toBeCloseTo(e.metrics.npv, 9);
  });
});

describe('the scenario card is priced on the concept the form writes', () => {
  test('the three capex fields are read, not the field nobody writes', () => {
    const r = runScenario(scenario, concept);
    expect(r.metrics.npv).toBeCloseTo(1791.4, 0);
    expect(r.metrics.irr).toBeCloseTo(30.0, 0);
  });

  test('a concept with no capex at all is refused rather than priced at 100', () => {
    expect(() => runScenario(scenario, { id: 2, opex: 60, peakProduction: 50 }))
      .toThrow(/carries no capex/);
  });

  test('a concept is found whether its id was stored as a number or a string', () => {
    const state = plan({ concepts: [concept], scenarios: [scenario] });
    expect(selectedConcept({ ...state, concepts: { list: [concept], selectedId: '1' } }).id).toBe(1);
    expect(selectedScenario({ ...state, scenarios: { list: [scenario], selectedId: 10 } }).id).toBe(10);
  });
});

describe('reserves are read from the table, per fluid', () => {
  const state = plan({
    reserves: [
      { id: 'r1', name: 'A', fluid: 'Oil', p90: 60, p50: 85, p10: 120 },
      { id: 'r2', name: 'B', fluid: 'Gas', p90: 15, p50: 30, p10: 45 },
    ],
  });

  test('oil and gas are never added together', () => {
    expect(planReservesP50(state)).toBe(85);
    expect(planReservesP50(state, 'Gas')).toBe(30);
  });

  test('a plan that carries only a summary still reads', () => {
    expect(planReservesP50({ subsurface: { reserves: { summary: { p50: 115 } } } })).toBe(115);
  });
});

describe('the schedule runs the critical path method', () => {
  const activities = [
    { id: 'a', name: 'FEED', start: '2026-01-01', end: '2026-03-01', duration: 59, dependencies: [] },
    { id: 'b', name: 'Procure', start: '2026-03-02', end: '2026-06-30', duration: 120, dependencies: ['a'] },
    { id: 'c', name: 'Drill', start: '2026-03-02', end: '2026-05-01', duration: 60, dependencies: ['a'] },
    { id: 'd', name: 'First oil', start: '2026-07-01', end: '2026-07-01', duration: 0, dependencies: ['b', 'c'] },
  ];

  test('the longest chain is critical and the short leg carries float', () => {
    const a = scheduleAnalysis(activities);
    expect(a.available).toBe(true);
    expect(a.durationDays).toBe(179);
    expect(a.paths).toEqual([['a', 'b', 'd']]);
    expect(a.activities.find((x) => x.id === 'c').float).toBe(60);
    expect(a.activities.filter((x) => x.isCritical).map((x) => x.id)).toEqual(['a', 'b', 'd']);
  });

  test('the schedule rows map to the fields the engine reads', () => {
    expect(toNetwork(activities)[0].startDate).toBe('2026-01-01');
    expect(scheduleAnalysis(activities).calendarDays).toBe(181);
  });

  test('a broken network is reported, not swallowed', () => {
    const cyclic = [
      { id: 'a', duration: 2, dependencies: ['c'] },
      { id: 'b', duration: 3, dependencies: ['a'] },
      { id: 'c', duration: 1, dependencies: ['b'] },
    ];
    const a = scheduleAnalysis(cyclic);
    expect(a.available).toBe(false);
    expect(a.error).toMatch(/dependency cycle/);
  });

  test('with no dependencies every activity starts on day 0, and the panel is told', () => {
    const a = scheduleAnalysis(activities.map((x) => ({ ...x, dependencies: [] })));
    expect(a.anyDependencies).toBe(false);
    expect(a.durationDays).toBe(120);
  });

  test('an empty schedule is empty, not zero-length nonsense', () => {
    expect(scheduleAnalysis([]).empty).toBe(true);
  });
});
