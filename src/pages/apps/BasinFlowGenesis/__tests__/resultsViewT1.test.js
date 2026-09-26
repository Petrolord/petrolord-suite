import { ageTicks, ageAxisProps, isoline, eventsChartRows, MATURITY_WINDOWS } from '../services/resultsView';

const layers = [
  { name: 'Base Sand', lithology: 'sandstone', ageStart: 150, ageEnd: 140 },
  { name: 'Source Shale', lithology: 'shale', ageStart: 140, ageEnd: 120, sourceRock: { isSource: true } },
  { name: 'Mid Sand', lithology: 'sandstone', ageStart: 120, ageEnd: 80 },
  { name: 'Upper Shale', lithology: 'shale', ageStart: 80, ageEnd: 20 },
];

describe('Basin T1 view helpers', () => {
  test('the time axis is numeric, oldest on the left, round ticks', () => {
    const a = ageAxisProps(150);
    expect(a).toMatchObject({ type: 'number', reversed: true, domain: [0, 150] });
    expect(ageTicks(150)).toEqual([0, 20, 40, 60, 80, 100, 120, 140]);
    expect(ageTicks(12)).toEqual([0, 2, 4, 6, 8, 10, 12]);
  });
  test('isoline interpolates the crossing depth between layer mid-depths', () => {
    const results = {
      meta: { layers: layers.slice(0, 2) },
      data: {
        timeSteps: [10, 0],
        burial: [[{ age: 10, top: 1000, bottom: 2000 }, { age: 0, top: 1000, bottom: 2000 }], [{ age: 10, top: 0, bottom: 1000 }, { age: 0, top: 0, bottom: 1000 }]],
        maturity: [[{ age: 10, value: 1.0 }, { age: 0, value: 1.5 }], [{ age: 10, value: 0.5 }, { age: 0, value: 0.9 }]],
      },
    };
    // age 10: 0.5 at 500 m, 1.0 at 1500 m, so 0.55 at 600 m; age 0: 0.9 at 500, 1.5 at 1500, 1.3 at ~1166.7
    const l055 = isoline(results, 'maturity', 0.55);
    expect(l055).toHaveLength(1);
    expect(l055[0].age).toBe(10);
    expect(l055[0].depth).toBeCloseTo(600, 9);
    // above the shallowest mid-depth the profile is extended to the surface: 0.3 %Ro at 100 m at age 10
    const l03 = isoline(results, 'maturity', 0.3);
    expect(l03[0].age).toBe(10);
    expect(l03[0].depth).toBeCloseTo(100, 9);
    const l13 = isoline(results, 'maturity', 1.3);
    expect(l13).toHaveLength(1);
    expect(l13[0].age).toBe(0);
    expect(l13[0].depth).toBeCloseTo(1166.667, 2);
  });
  test('maturity windows follow Tissot and Welte', () => {
    expect(MATURITY_WINDOWS.map((w) => [w.from, w.to])).toEqual([[0.55, 1.3], [1.3, 2.0], [2.0, 4.0]]);
  });
  test('events chart: roles from the layers, windows and the critical moment from the series', () => {
    const gen = [{ age: 100, value: 0 }, { age: 90, value: 1 }, { age: 80, value: 5 }, { age: 70, value: 6 }];
    const exp = [{ age: 100, value: 0 }, { age: 90, value: 0 }, { age: 80, value: 3 }, { age: 70, value: 3.5 }];
    const { rows, criticalMoment } = eventsChartRows({ meta: { layers }, data: { generation: [[], gen, [], []], expulsion: [[], exp, [], []] } });
    const by = Object.fromEntries(rows.map((r) => [r.key, r.intervals.map((i) => i.layer)]));
    expect(by.source).toEqual(['Source Shale']);
    expect(by.reservoir).toEqual(['Base Sand', 'Mid Sand']);
    expect(by.seal).toEqual(['Upper Shale']);
    expect(by.overburden).toEqual(['Mid Sand', 'Upper Shale']);
    expect(rows.find((r) => r.key === 'generation').intervals[0].interval).toEqual([90, 70]);
    expect(criticalMoment).toBe(80);
  });
});
