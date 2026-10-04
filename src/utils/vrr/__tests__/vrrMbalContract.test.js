// The contract Material Balance Studio reads a saved VRR project by
// (src/pages/apps/reservoir-balance/lib/vrrPressureIntake.js, MBAL U2):
// `saved_vrr_projects.inputs_data.inputs.pressureSurveys`, a list of
// { date: 'YYYY-MM-DD' | 'YYYY-MM', p_psia } in psia. VRR-U1 adds display
// units, so the test holds that what the user types in SI is saved in psia,
// that a project saved before VRR-U1 still reads, and that the payload is
// the one `.pld` carries.
import fs from 'fs';
import path from 'path';
import { vrrSurveys, takeSurveys } from '@/pages/apps/reservoir-balance/lib/vrrPressureIntake';
import { projectPayload, inputsFromPayload, defaultInputs, TABLE } from '@/contexts/VrrMonitorContext';
import { inputStore } from '../units';
import { parsePressureCSV } from '../csvImport';

const row = (inputs, name = 'Ekene VRR') => ({ id: 'vrr-1', project_name: name, inputs_data: projectPayload({ id: 'vrr-1', name, inputs }) });

describe('Material Balance reads the surveys of a saved VRR project by id', () => {
  it('a survey typed in kPa on an SI project is saved, and read by Material Balance, in psia', () => {
    const inputs = { ...defaultInputs('si'), pressureSurveys: [{ date: '2025-01-15', p_psia: inputStore('pressure', '20684.271879505', 'si') }] };
    expect(vrrSurveys(row(inputs))).toEqual([{ date: '2025-01-15', p_psia: 3000 }]);
  });
  it('a kPa file through the pressure door is saved in psia', () => {
    const { surveys } = parsePressureCSV('Survey date,Pressure (kPa)\n2025-02-01,20684.271879505\n');
    expect(vrrSurveys(row({ ...defaultInputs(), pressureSurveys: surveys }))).toEqual([{ date: '2025-02-01', p_psia: 3000 }]);
  });
  it('the surveys land on the matching rows of a case, with the provenance Material Balance prints', () => {
    const inputs = { ...defaultInputs(), pressureSurveys: [{ date: '2025-01', p_psia: '2950' }, { date: '2025-03-01', p_psia: 2900 }] };
    const rows = [
      { timestep_index: 0, observation_date: '2024-12-01', pressure_psia: 3100 },
      { timestep_index: 1, observation_date: '2025-01-01', pressure_psia: 3000 },
      { timestep_index: 2, observation_date: '2025-03-01', pressure_psia: 2950 },
    ];
    const r = takeSurveys(row(inputs), rows, { now: '2026-10-04T00:00:00Z' });
    expect(r.rows.map((x) => x.pressure_psia)).toEqual([3100, 2950, 2900]);
    expect(r.handoff.record).toBe('Ekene VRR (vrr-1)');
  });
  it('a project saved before VRR-U1 (no units, no identification) opens and still reads', () => {
    const old = { id: 'old', name: 'Old', schema: 1, inputs: { fvf: { Bo: '1.25', Bw: '1.02', Bg: '0.9', Rs: '550' }, periods: [], mode: 'manual', pressureSurveys: [{ date: '2024-06-01', p_psia: 2800 }], pvtMode: 'track' } };
    const restored = inputsFromPayload(old);
    expect(restored).toMatchObject({ unitSystem: 'oilfield', pvtMode: 'track', identification: {}, pvtIntake: null });
    expect(vrrSurveys({ project_name: 'Old', inputs_data: old })).toEqual([{ date: '2024-06-01', p_psia: 2800 }]);
  });
  it('the payload keeps its shape: { id, name, schema: 1, inputs }', () => {
    const p = projectPayload({ id: 'x', name: 'X', inputs: defaultInputs() });
    expect(Object.keys(p).sort()).toEqual(['id', 'inputs', 'modified', 'name', 'schema']);
    expect(p.schema).toBe(1);
  });
  it('saved_vrr_projects travels in .pld and is under the record-sharing rules', () => {
    const fam = fs.readFileSync(path.join(process.cwd(), 'src/lib/portability/familiesCore.js'), 'utf8');
    expect(fam).toContain(`'${TABLE}'`);
    const rules = fs.readFileSync(path.join(process.cwd(), 'src/lib/recordSharing/rules.js'), 'utf8');
    expect(rules).toMatch(/saved_vrr_projects: \{ label: 'project'/);
  });
});
