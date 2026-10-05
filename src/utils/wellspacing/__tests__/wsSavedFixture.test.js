/**
 * WS-U1 (PL5): a project as the first saving release writes it opens in a
 * later build with every input, and gives the same cases. The fixture is
 * written once from the intake case (UPDATE_SAVED_FIXTURE=1 rewrites it on
 * purpose); later releases must open it unchanged.
 */
import fs from 'fs';
import path from 'path';
import { inputsFromPayload, projectPayload } from '../model';
import { runSpacingCases } from '@/utils/wellSpacingCalculations';
import { intakeCase } from './wsTestKit';

const FILE = path.join(__dirname, '..', '..', '..', '..', 'e2e', 'fixtures', 'well-spacing', 'saved', 'project-2026-10-ws-u1.json');

it('the WS-U1 saved project opens with its inputs and the same 40-acre NPV', () => {
  if (process.env.UPDATE_SAVED_FIXTURE === '1' || !fs.existsSync(FILE)) {
    const p = { ...projectPayload({ id: 'ws-fixture-1', name: 'Ekene spacing (WS-U1)', inputs: intakeCase() }), modified: '2026-10-05T12:00:00.000Z' };
    fs.writeFileSync(FILE, `${JSON.stringify(p, null, 2)}\n`);
  }
  const payload = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  expect(payload.schema).toBe(1);
  const inputs = inputsFromPayload(payload);
  expect(inputs.form.permeability).toBe('182.4');
  expect(inputs.intakes.wells.wells).toHaveLength(4);
  expect(inputs.identification.analyst).toBe('A. Analyst');
  const r = runSpacingCases(inputs.form);
  const r40 = r.spacingResults.find((x) => x.spacing === 40);
  expect(r40.npv).toBeCloseTo(1632.3, 1);
  expect(r40.drainage.distanceFt).toBe(1320);
});
