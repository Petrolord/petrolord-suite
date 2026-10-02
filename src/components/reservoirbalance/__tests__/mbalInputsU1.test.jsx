/**
 * Material Balance Studio inputs (MBAL-U1): typable number fields in the
 * display unit (PL3, PL11) and the Aquifer Model save.
 *
 * MBAL-U1-005 (S2): the Carter-Tracy form had no field for the reservoir
 * radius, the area, the water viscosity or the salinity, and Save rebuilt
 * aquifer_params from a list that left them out. A case that held a radius
 * lost it on the next save, and the engine then fell back on 2,980 ft
 * (640 acres) without the screen ever showing it.
 *
 * MBAL-U1-003 (S1), the screen half: saving an aquifer model sets the case
 * flag the engine's history match reads.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

const mockDb = { cfg: null, saved: null, casePatch: null, pvtSaved: null };
jest.mock('@/pages/apps/reservoir-balance/lib/api', () => ({
  getCaseDefaultConfig: jest.fn(async () => ({ data: mockDb.cfg, error: null })),
  upsertCaseDefaultConfig: jest.fn(async (caseId, patch) => { mockDb.saved = patch; return { data: { id: 'cfg', ...mockDb.cfg, ...patch }, error: null }; }),
  updateCase: jest.fn(async (caseId, patch) => { mockDb.casePatch = patch; return { data: patch, error: null }; }),
  getPvtPreview: jest.fn(async () => ({ data: null, error: { message: 'no preview on this test' } })),
  savePvtConfig: jest.fn(async (caseId, fields) => { mockDb.pvtSaved = fields; return { data: { id: 'cfg', ...fields }, error: null }; }),
  listProductionData: jest.fn(async () => ({ data: [], error: null })),
}));
jest.mock('@/lib/customSupabaseClient', () => {
  const supabase = { from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }) };
  return { supabase, default: supabase };
});
jest.mock('@/lib/pvtSource', () => ({ readFluidProjectPvt: jest.fn() }));
const mockApplyCasePatch = jest.fn();
let mockUnits;
jest.mock('@/contexts/MaterialBalanceStudioContext', () => ({
  useMaterialBalanceStudio: () => ({ units: mockUnits, applyCasePatch: mockApplyCasePatch }),
}));

import { MemoryRouter } from 'react-router-dom';
import AquiferModel, { paramsToSaveFor, MODEL_PARAM_KEYS } from '../AquiferModel';
import PvtRock from '../PvtRock';
import UnitField, { numberForInput } from '../UnitField';
import { createMbalUnits, MBAL_METRIC_VIEW, OILFIELD_UNITS } from '@/pages/apps/reservoir-balance/lib/mbalUnits';

const METRIC = createMbalUnits(MBAL_METRIC_VIEW);
const CT_PARAMS = {
  aquifer_permeability_md: 200, aquifer_thickness_ft: 100, aquifer_porosity: 0.25, theta_degrees: 140, radius_ratio: 5,
  aquifer_radius_ft: 9200, aquifer_water_viscosity_cp: 0.55, aquifer_total_compressibility_psi: 7e-6,
};

beforeEach(() => { mockToast.mockClear(); mockApplyCasePatch.mockClear(); mockDb.saved = null; mockDb.casePatch = null; mockUnits = OILFIELD_UNITS; });

describe('aquifer_params as saved', () => {
  test('MBAL-U1-005: Carter-Tracy keeps the radius, the area, the viscosity and the salinity', () => {
    const saved = paramsToSaveFor('carter_tracy', { ...CT_PARAMS, reservoir_area_acres: 640, water_salinity_ppm: 30000 });
    expect(saved).toMatchObject({ aquifer_radius_ft: 9200, reservoir_area_acres: 640, aquifer_water_viscosity_cp: 0.55, water_salinity_ppm: 30000, radius_ratio: 5 });
    // the list the old Save used: the four keys above were not on it
    const OLD_KEYS = ['aquifer_permeability_md', 'aquifer_thickness_ft', 'aquifer_porosity', 'theta_degrees', 'radius_ratio', 'aquifer_total_compressibility_psi'];
    const lostBefore = MODEL_PARAM_KEYS.carter_tracy.filter((k) => !OLD_KEYS.includes(k));
    expect(lostBefore).toEqual(['aquifer_radius_ft', 'reservoir_area_acres', 'aquifer_water_viscosity_cp', 'water_salinity_ppm']);
  });
  test('each model saves its own keys; blanks are left out; no model and the pot model save none', () => {
    expect(paramsToSaveFor('fetkovich', { ...CT_PARAMS, initial_aquifer_water_in_place_rb: 5e8, aquifer_pi_rb_d_psi: 12 }))
      .toEqual({ initial_aquifer_water_in_place_rb: 5e8, aquifer_pi_rb_d_psi: 12, aquifer_total_compressibility_psi: 7e-6 });
    expect(paramsToSaveFor('carter_tracy', { aquifer_permeability_md: 200, aquifer_radius_ft: null, radius_ratio: null })).toEqual({ aquifer_permeability_md: 200 });
    expect(paramsToSaveFor('none', CT_PARAMS)).toBeNull();
    expect(paramsToSaveFor('pot', CT_PARAMS)).toBeNull();
  });
});

describe('the Aquifer Model tab', () => {
  const open = async (cfg, caseData = { id: 'c1', has_aquifer: false, fluid_system: 'oil' }) => {
    mockDb.cfg = cfg;
    render(<AquiferModel caseId="c1" caseData={caseData} onConfigChange={jest.fn()} />);
    await screen.findByTestId('mbal-aq-radius');
  };

  test('a saved radius is shown, survives a save of another field, and the case flag is set', async () => {
    await open({ id: 'cfg', aquifer_model: 'carter_tracy', aquifer_params: CT_PARAMS });
    expect(screen.getByTestId('mbal-aq-radius')).toHaveValue('9200');
    expect(screen.getByTestId('mbal-aq-muw')).toHaveValue('0.55');
    fireEvent.change(screen.getByTestId('mbal-aq-k'), { target: { value: '250' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save/ })); });
    await waitFor(() => expect(mockDb.saved).not.toBeNull());
    expect(mockDb.saved.aquifer_model).toBe('carter_tracy');
    expect(mockDb.saved.aquifer_params).toMatchObject({ aquifer_permeability_md: 250, aquifer_radius_ft: 9200, aquifer_water_viscosity_cp: 0.55, radius_ratio: 5 });
    // MBAL-U1-003: the flag the history match reads follows the model
    expect(mockDb.casePatch).toEqual({ has_aquifer: true });
    expect(mockApplyCasePatch).toHaveBeenCalledWith({ has_aquifer: true });
  });

  test('a case whose flag already agrees is not written again', async () => {
    await open({ id: 'cfg', aquifer_model: 'carter_tracy', aquifer_params: CT_PARAMS }, { id: 'c1', has_aquifer: true, fluid_system: 'oil' });
    fireEvent.change(screen.getByTestId('mbal-aq-k'), { target: { value: '250' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save/ })); });
    await waitFor(() => expect(mockDb.saved).not.toBeNull());
    expect(mockDb.casePatch).toBeNull();
  });

  test('metric view: the radius shows in metres and is saved in feet', async () => {
    mockUnits = METRIC;
    await open({ id: 'cfg', aquifer_model: 'carter_tracy', aquifer_params: CT_PARAMS });
    expect(screen.getByTestId('mbal-aq-radius')).toHaveValue('2804.16'); // 9,200 ft
    expect(screen.getByTestId('mbal-aq-h')).toHaveValue('30.48'); // 100 ft
    fireEvent.change(screen.getByTestId('mbal-aq-radius'), { target: { value: '3048' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save/ })); });
    await waitFor(() => expect(mockDb.saved).not.toBeNull());
    expect(mockDb.saved.aquifer_params.aquifer_radius_ft).toBeCloseTo(10000, 6);
    expect(mockDb.saved.aquifer_params.aquifer_thickness_ft).toBe(100); // untouched fields keep the stored value exactly
  });
});

describe('MBAL-U1-011: the PVT tab of a case whose PVT comes with its data rows', () => {
  // the engine takes pvt_source "lab_table" with Bo, Rs and Bg on every data row and no separate table
  const cfg = {
    id: 'cfg', oil_gravity_api: 35, gas_specific_gravity: 0.7, water_salinity_ppm: 0, pvt_source: 'lab_table', pvt_lab_table: null,
    pvt_correlations: { pb_rs_bo: 'standing' }, formation_compressibility_psi: 4e-6, water_compressibility_psi: 3e-6, gas_cap_ratio_m: 0,
  };
  const rows = (withBo) => [0, 1, 2].map((i) => ({ timestep_index: i, pressure_psia: 2740 - 100 * i, bo_rb_stb: withBo ? 1.4 - 0.01 * i : null, rs_scf_stb: 650, bg_rb_mscf: 0.93 }));
  const open = async (withBo) => {
    mockDb.cfg = cfg;
    mockDb.pvtSaved = null;
    render(<MemoryRouter><PvtRock caseId="c1" caseData={{ id: 'c1', fluid_system: 'oil', reservoir_temperature_f: 200, initial_pressure_psia: 2740, production_data: rows(withBo) }} onConfigChange={jest.fn()} /></MemoryRouter>);
    await screen.findByTestId('mbal-pvt-cf');
    await waitFor(() => expect(screen.getByTestId('mbal-pvt-cf')).toHaveValue('0.000004'));
  };

  test('it is valid as it stands: the tab says where the PVT comes from, and a compressibility can be saved', async () => {
    await open(true);
    expect(screen.getByTestId('mbal-pvt-rows-carry')).toHaveTextContent('The PVT of this case comes with its data rows (Bo, Rs and Bg on the Data tab)');
    expect(screen.queryByText(/Lab table is empty/)).toBeNull();
    fireEvent.change(screen.getByTestId('mbal-pvt-cf'), { target: { value: '5e-6' } });
    const save = await screen.findByTestId('mbal-pvt-save');
    expect(save).toBeEnabled();
    await act(async () => { fireEvent.click(save); });
    await waitFor(() => expect(mockDb.pvtSaved).not.toBeNull());
    expect(mockDb.pvtSaved.formation_compressibility_psi).toBe(5e-6);
    expect(mockDb.pvtSaved.pvt_source).toBe('lab_table');
  });

  test('negative control: with no Bo on the rows the empty table is still an error and Save stays off', async () => {
    await open(false);
    expect(screen.queryByTestId('mbal-pvt-rows-carry')).toBeNull();
    expect(screen.getAllByText(/Lab table is empty/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByTestId('mbal-pvt-cf'), { target: { value: '5e-6' } });
    expect(await screen.findByTestId('mbal-pvt-save')).toBeDisabled();
  });
});

describe('UnitField: a number a person can type', () => {
  const Field = ({ units = OILFIELD_UNITS, quantity = 'pressure', initial = 3685, onCommit }) => {
    const [v, setV] = React.useState(initial);
    return <UnitField label="Initial pressure" quantity={quantity} units={units} value={v} onCommit={(n) => { setV(n); onCommit?.(n); }} testId="f" />;
  };

  test('partial entries stay on screen and nothing snaps to zero', () => {
    const commits = [];
    render(<Field onCommit={(n) => commits.push(n)} />);
    const input = screen.getByTestId('f');
    fireEvent.focus(input);
    for (const t of ['', '-', '2', '2.', '2.5', '2.5e', '2.5e3']) {
      fireEvent.change(input, { target: { value: t } });
      expect(input).toHaveValue(t);
    }
    expect(commits).toEqual([null, 2, 2, 2.5, 2500]); // '', then each complete number; '-' and '2.5e' commit nothing
  });

  test('an empty box commits null and stays empty after blur', () => {
    const commits = [];
    render(<Field onCommit={(n) => commits.push(n)} />);
    const input = screen.getByTestId('f');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(commits).toEqual([null]);
    expect(input).toHaveValue('');
  });

  test('the display unit at the door: kPa typed, psia committed; the label names the unit', () => {
    const commits = [];
    render(<Field units={METRIC} onCommit={(n) => commits.push(n)} />);
    const input = screen.getByTestId('f');
    expect(input).toHaveValue('25407.18'); // 3,685 psia
    expect(screen.getByText(/kPa abs/)).toBeInTheDocument();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '6894.757293168361' } });
    expect(commits[0]).toBeCloseTo(1000, 9);
  });

  test('numberForInput prints a stored number without float noise', () => {
    expect(numberForInput(0.1 + 0.2)).toBe('0.3');
    expect(numberForInput(4e-6)).toBe('0.000004');
    expect(numberForInput(null)).toBe('');
    expect(numberForInput('abc')).toBe('');
    expect(numberForInput(500.00000000000006)).toBe('500');
  });
});
