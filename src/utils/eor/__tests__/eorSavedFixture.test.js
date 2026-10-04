/**
 * EOR-U1 (PL5): the saved-project fixture of the first release that saves
 * (e2e/fixtures/eor/saved/) opens with every input, source and its unit
 * system, and screens as it did; a payload missing the later keys opens on
 * defaults with nothing assumed.
 */
import fs from 'fs';
import path from 'path';
import { inputsFromPayload } from '@/contexts/EorScreeningContext';
import { screenAllMethods, engineInputOf } from '../../eorScreeningCalculations';

const FIX = path.join(__dirname, '..', '..', '..', '..', 'e2e', 'fixtures', 'eor', 'saved', 'eor-u1-project.json');

it('the EOR-U1 project fixture opens and screens as saved', () => {
  const payload = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const i = inputsFromPayload(payload);
  expect(i.form.gravityApi).toBe('34');
  expect(i.inputMeta.gravityApi.source).toBe('lab');
  expect(i.depthReference).toBe('tvdss');
  expect(i.identification.field).toBe('Ekene');
  expect(i.sampleNote).toBeNull();
  const r = screenAllMethods(engineInputOf(i.form));
  expect(r.filter((m) => m.outcome === 'qualified').map((m) => m.id)).toEqual(['co2', 'hydrocarbon', 'immiscible', 'chemical']);
});

it('a payload with only part of the inputs opens on blanks, not on the sample', () => {
  const i = inputsFromPayload({ id: 'x', name: 'old', schema: 1, inputs: { form: { gravityApi: '30' } } });
  expect(i.form.gravityApi).toBe('30');
  expect(i.form.depthFt).toBe('');
  expect(i.sampleNote).toBeNull();
  expect(i.unitSystem).toBe('oilfield');
  expect(i.intakes).toEqual({ pvt: null, wta: null, mbal: null });
});
