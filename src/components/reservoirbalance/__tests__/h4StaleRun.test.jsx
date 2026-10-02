/**
 * H4 (Reservoir honesty sweep), on the screen: a case is opened whose PVT
 * was edited after its last stored run. Before the fix the Report tab
 * offered the PDF and the history match card said "Converged"; now the
 * studio says the results are from an earlier run, the status words are
 * withheld and the export is refused. The same case with untouched inputs
 * exports as before (the negative control).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('jspdf', () => jest.fn());
jest.mock('jspdf-autotable', () => jest.fn());

const mockDb = {};
jest.mock('@/pages/apps/reservoir-balance/lib/api', () => ({
  listCases: jest.fn(async () => ({ data: [], error: null })),
  deleteCase: jest.fn(),
  getCaseWithProductionData: jest.fn(async () => ({ data: mockDb.caseData, error: null })),
  createRunConfig: jest.fn(async (caseId, input) => { mockDb.createdRunConfig = { id: 'rc-new', case_id: caseId, ...input }; return { data: mockDb.createdRunConfig, error: null }; }),
  runMBAL: jest.fn(async () => ({ data: { run_id: 'r-new', duration_ms: 5 }, error: null })),
  listRuns: jest.fn(async () => ({ data: mockDb.runs, error: null })),
  getResultByRunId: jest.fn(async () => ({ data: mockDb.result, error: null })),
  getCaseDefaultConfig: jest.fn(async () => ({ data: mockDb.defaultCfg, error: null })),
  getRunConfig: jest.fn(async () => ({ data: mockDb.runConfig, error: null })),
  upsertCaseDefaultConfig: jest.fn(async (caseId, patch) => { mockDb.defaultCfg = { ...mockDb.defaultCfg, ...patch }; return { data: mockDb.defaultCfg, error: null }; }),
  updateCase: jest.fn(async (caseId, patch) => { mockDb.caseData = { ...mockDb.caseData, ...patch }; return { data: mockDb.caseData, error: null }; }),
}));
const mockExportPdf = jest.fn();
jest.mock('@/utils/mbalReportExport', () => {
  const actual = jest.requireActual('@/utils/mbalReportExport');
  return { ...actual, exportMbalPdf: (...a) => mockExportPdf(...a) };
});

import { MaterialBalanceStudioProvider, useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import ReportTab from '@/components/reservoirbalance/ReportTab';
import HistoryMatch from '@/components/reservoirbalance/HistoryMatch';
import { buildRunConfigInput } from '@/pages/apps/reservoir-balance/lib/runStaleness';

const baseCfg = {
  id: 'cfg', is_scenario: false, oil_gravity_api: 35, gas_specific_gravity: 0.7, water_salinity_ppm: 50000,
  pvt_source: 'correlated', pvt_correlations: { pb_rs_bo: 'standing', oil_viscosity: 'beggs_robinson' },
  pvt_lab_table: null, formation_compressibility_psi: 4.95e-6, water_compressibility_psi: 3.62e-6,
  aquifer_model: 'none', aquifer_params: null, gas_cap_ratio_m: null, excluded_timesteps: [],
};

function seed({ editedAfterRun }) {
  mockDb.caseData = {
    id: 'c1', name: 'Ekene E-2000', fluid_system: 'oil', has_aquifer: false, has_gas_cap: false,
    initial_pressure_psia: 3685, reservoir_temperature_f: 175, initial_water_saturation: 0.24,
    bubble_point_psia: 1500, updated_at: '2026-10-01T09:00:00.000Z',
    production_data: [
      { timestep_index: 0, pressure_psia: 3685, cum_oil_stb: 0, cum_gas_scf: 0, cum_water_stb: 0 },
      { timestep_index: 1, pressure_psia: 3600, cum_oil_stb: 20000, cum_gas_scf: 1e7, cum_water_stb: 0 },
    ],
  };
  mockDb.runConfig = { id: 'rc1', is_scenario: true, ...buildRunConfigInput(mockDb.caseData, baseCfg) };
  mockDb.runs = [{ id: 'r1', run_config_id: 'rc1', status: 'completed', started_at: '2026-10-01T10:00:00.000Z' }];
  mockDb.result = {
    run_id: 'r1', drive_mechanism: 'depletion_drive', estimated_ooip_stb: 257e6, warnings: [],
    plot_data: {
      timestep_index: [0, 1], pressure: [3685, 3600], cum_oil_stb: [0, 20000], cum_gas_scf: [0, 1e7], cum_water_stb: [0, 0],
      history_match: {
        converged: true, iterations: 7, rms_error_psi: 3.2, max_abs_error_psi: 6.1, matched_parameters: [],
        observed_pressure_psia: [3685, 3600], simulated_pressure_psia: [3685, 3602], residual_psi: [0, 2], point_in_fit: [false, true],
      },
    },
  };
  // the PVT tab was saved with another correlation after the run
  mockDb.defaultCfg = editedAfterRun
    ? { ...baseCfg, pvt_correlations: { pb_rs_bo: 'vasquez_beggs', oil_viscosity: 'beggs_robinson' } }
    : baseCfg;
}

const Probe = () => {
  const { runStaleness, lastResult, handleRun } = useMaterialBalanceStudio();
  return (
    <div>
      <span data-testid="probe">{lastResult ? (runStaleness.stale ? 'stale' : 'current') : 'none'}</span>
      <button type="button" onClick={handleRun}>rerun</button>
    </div>
  );
};

const mount = () => render(
  <MaterialBalanceStudioProvider caseId="c1">
    <Probe />
    <ReportTab />
    <HistoryMatch />
  </MaterialBalanceStudioProvider>,
);

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => { mockToast.mockClear(); mockExportPdf.mockClear(); });

describe('H4: a stored run made before an input changed', () => {
  it('is named as an earlier run; status words are withheld and the export is refused', async () => {
    seed({ editedAfterRun: true });
    mount();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('stale'));
    expect(screen.getByTestId('mbal-report-stale')).toHaveTextContent(/earlier run/);
    expect(screen.getByTestId('mbal-report-stale')).toHaveTextContent(/PVT correlations/);
    expect(screen.getByTestId('mbal-export-pdf')).toBeDisabled();
    expect(screen.getByTestId('mbal-export-csv')).toBeDisabled();
    fireEvent.click(screen.getByTestId('mbal-export-pdf'));
    expect(mockExportPdf).not.toHaveBeenCalled();
    // the history match keeps its numbers and loses "Converged"
    expect(screen.getByTestId('mbal-hm-status-line')).toHaveTextContent(/made on earlier inputs/);
    expect(screen.queryByText('Converged')).toBeNull();
    expect(screen.queryByText(/Converged in 7 iterations/)).toBeNull();
  });

  it('negative control: untouched inputs export, and the match says converged', async () => {
    seed({ editedAfterRun: false });
    mount();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('current'));
    expect(screen.queryByTestId('mbal-report-stale')).toBeNull();
    expect(screen.getByTestId('mbal-hm-status-line')).toHaveTextContent('Converged in 7 iterations.');
    mockExportPdf.mockResolvedValue({ pages: 7, fileName: 'x.pdf' });
    fireEvent.click(screen.getByTestId('mbal-export-pdf'));
    expect(mockExportPdf).toHaveBeenCalledTimes(1);
    // the report prints the config the run was made on, not today's default
    expect(mockExportPdf.mock.calls[0][0].runConfig.id).toBe('rc1');
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Report exported' })));
  });

  it('a field only the report prints does not withdraw the result (RL8, the other direction)', async () => {
    seed({ editedAfterRun: false });
    mount();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('current'));
    fireEvent.change(screen.getByTestId('mbal-id-analyst'), { target: { value: 'A. Okafor' } });
    fireEvent.click(screen.getByTestId('mbal-study-save'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Report details saved' })));
    // the study record is on the default config now, and the run is still the run of the inputs
    expect(mockDb.defaultCfg.pvt_correlations.study.identification.analyst).toBe('A. Okafor');
    expect(screen.getByTestId('probe')).toHaveTextContent('current');
    expect(screen.getByTestId('mbal-export-pdf')).not.toBeDisabled();
    expect(screen.getByTestId('mbal-preview-identification')).toHaveTextContent('A. Okafor');
  });

  it('a new run on the edited inputs is current again', async () => {
    seed({ editedAfterRun: true });
    mount();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('stale'));
    mockDb.runs = [{ id: 'r-new', run_config_id: 'rc-new', status: 'completed', started_at: '2026-10-02T08:00:00.000Z' }, ...mockDb.runs];
    fireEvent.click(screen.getByText('rerun'));
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('current'));
    // the run was created from the edited default config
    expect(mockDb.createdRunConfig.pvt_correlations.pb_rs_bo).toBe('vasquez_beggs');
    expect(screen.getByTestId('mbal-export-pdf')).not.toBeDisabled();
  });

  it('the PDF builder itself refuses a stale pair', async () => {
    const { exportMbalPdf, buildMbalPdf } = jest.requireActual('@/utils/mbalReportExport');
    const args = { caseData: {}, result: {}, runConfig: {}, staleness: { stale: true, reasons: ['Changed since the run: oil gravity.'] } };
    await expect(exportMbalPdf(args)).rejects.toThrow(/not exported.*earlier run.*oil gravity/);
    expect(() => buildMbalPdf(args)).toThrow(/not exported.*earlier run.*oil gravity/);
  });
});
