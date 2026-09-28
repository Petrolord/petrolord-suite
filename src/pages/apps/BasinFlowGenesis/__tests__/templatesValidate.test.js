// W7F: the Passive Margin (and Continental Rift) templates failed
// validation because each ended with a zero-thickness basement row, and the
// continuity warning flagged every boundary of every template because it
// assumed oldest-first rows. Negative control: on the old templates and
// validator the first test fails for passive_margin and rift, and the second
// finds gap warnings.
import { BasinTemplates } from '../data/BasinTemplates';
import { ValidationEngine } from '../services/ValidationEngine';
import { StepValidator } from '../services/StepValidator';
import { WizardDataConverter } from '../services/WizardDataConverter';
import { SimulationEngine } from '../services/SimulationEngine';

describe.each(BasinTemplates.map((t) => [t.id, t]))('template %s', (_id, t) => {
  test('passes both validators', () => {
    expect(StepValidator.validateStratigraphy({ layers: t.defaultStratigraphy })).toEqual({ isValid: true });
    const v = ValidationEngine.validateProject({ stratigraphy: t.defaultStratigraphy, heatFlow: { type: 'constant', value: 60 } });
    expect(v.errors).toEqual([]);
    expect(v.isValid).toBe(true);
  });

  test('a contiguous template raises no gap warnings in either row order', () => {
    expect(ValidationEngine.validateStratigraphy(t.defaultStratigraphy).warnings).toEqual([]);
    expect(ValidationEngine.validateStratigraphy([...t.defaultStratigraphy].reverse()).warnings).toEqual([]);
  });

  test('runs through the engine to finite results', async () => {
    const input = WizardDataConverter.convertWizardDataToSimulationInput({
      layers: t.defaultStratigraphy, heatFlowId: undefined, erosionOption: 'none',
    });
    const res = await SimulationEngine.run(input);
    expect(res.meta.layers).toHaveLength(t.defaultStratigraphy.length);
    expect(Number.isFinite(res.meta.maxDepth) && res.meta.maxDepth > 0).toBe(true);
    expect(Object.keys(res.data).length).toBeGreaterThan(0);
    // every number in the history is finite (JSON.stringify would hide NaN)
    const bad = [];
    const walk = (v) => {
      if (typeof v === 'number') { if (!Number.isFinite(v)) bad.push(v); }
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(res.data);
    expect(bad).toEqual([]);
  });
});

test('a real gap still warns', () => {
  const layers = [
    { name: 'A', thickness: 100, lithology: 'shale', ageStart: 10, ageEnd: 0 },
    { name: 'B', thickness: 100, lithology: 'shale', ageStart: 30, ageEnd: 20 },
  ];
  expect(ValidationEngine.validateStratigraphy(layers).warnings).toHaveLength(1);
});
