import { normalizeHistory, heatFlowSeries, presentDayHeatFlow, heatFlowProblems, normalizeErosion, erosionProblems } from '../services/history';
import { WizardDataConverter } from '../services/WizardDataConverter';

test('history helpers sort, hold and flag', () => {
  expect(normalizeHistory([{ age: 0, value: 60 }, { age: 150, value: 80 }, { age: 150, value: 81 }])).toEqual([{ age: 150, value: 81 }, { age: 0, value: 60 }]);
  expect(heatFlowSeries({ type: 'constant', value: 60 }, 120)).toEqual([{ age: 0, value: 60 }, { age: 120, value: 60 }]);
  expect(heatFlowSeries({ type: 'variable', history: [{ age: 100, value: 70 }, { age: 50, value: 65 }] })).toEqual([{ age: 0, value: 65 }, { age: 50, value: 65 }, { age: 100, value: 70 }]);
  expect(presentDayHeatFlow({ type: 'variable', history: [{ age: 150, value: 80 }, { age: 0, value: 60 }] })).toBe(60);
  expect(heatFlowProblems({ type: 'variable', history: [{ age: 10, value: 60 }] }, 150)).toEqual(['A variable history needs at least two points.', 'The history starts at 10 Ma; the basin is 150 Ma old, so the oldest value is held before it.']);
  expect(heatFlowProblems({ type: 'constant', value: 60 }, 150)).toEqual([]);
  expect(normalizeErosion([{ age: 5, amount: 0 }, { age: 10, amount: 600 }])).toEqual([{ age: 10, amount: 600 }]);
  expect(erosionProblems([{ age: 200, amount: 600 }], 150)).toEqual(['Erosion at 200 Ma is older than the basin (150 Ma).']);
});

test('the wizard passes a custom erosion event through to the engine input', () => {
  const input = WizardDataConverter.convertWizardDataToSimulationInput({
    layers: [{ id: 'a', name: 'A', thickness: '100', lithology: 'shale', ageStart: '10', ageEnd: '0' }],
    heatFlowId: 'continental_stable',
    erosionOption: 'custom',
    erosionEvent: { age: 8, amount: 250 },
  });
  expect(input.erosionEvents).toEqual([{ age: 8, amount: 250 }]);
  expect(input.settings.surfaceTemp).toBe(20);
});
