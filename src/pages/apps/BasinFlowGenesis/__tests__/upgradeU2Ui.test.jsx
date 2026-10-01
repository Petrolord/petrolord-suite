/**
 * Basin & Charge Modeling upgrade U2: the screens behind the built items,
 * driven on the in-memory backend (the /dev harness twin).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';
import { BasinFlowShell } from '../BasinFlowGenesis';
import { makeInMemoryBackend, referenceBasinRow } from '../services/backend';
import { SimulationEngine } from '../services/SimulationEngine';
import BurialHistoryPlot from '../components/plots/BurialHistoryPlot';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
installDashboardScope({ userId: null });
beforeEach(() => { try { window.localStorage.clear(); window.sessionStorage.clear(); } catch { /* none */ } });

const selectTab = (el) => { fireEvent.mouseDown(el, { button: 0, ctrlKey: false }); fireEvent.click(el); };

const refInputs = () => { const r = referenceBasinRow(); return { stratigraphy: r.stratigraphy, heatFlow: r.heat_flow, erosionEvents: r.erosion_events, settings: r.settings }; };

describe('U2-001 the burial history names the eroded section it draws', () => {
  test('600 m (1,969 ft) deposited at 20 Ma and removed at 10 Ma; none without erosion', async () => {
    const r = await SimulationEngine.run(refInputs());
    const { unmount } = render(<BurialHistoryPlot results={r} units={{ depth: 'ft' }} />);
    expect(screen.getByTestId('bf-burial-eroded-note')).toHaveTextContent('Eroded section: 1969 ft deposited at 20 Ma, removed at 10 Ma (hatched)');
    unmount();
    const none = await SimulationEngine.run({ ...refInputs(), erosionEvents: [] });
    render(<BurialHistoryPlot results={none} units={{ depth: 'm' }} />);
    expect(screen.queryByTestId('bf-burial-eroded-note')).toBeNull();
  }, 120000);
});

describe('in the app (Expert mode on the harness backend)', () => {
  const openExpert = async () => {
    const be = makeInMemoryBackend({ persist: false });
    render(<MemoryRouter><BasinFlowShell backend={be} /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('bf-mode-expert'));
    await screen.findByTestId('bf-tab-properties');
    await waitFor(() => expect(screen.getAllByTestId('bf-layer-card')).toHaveLength(4), { timeout: 30000 });
    return be;
  };

  test('U2-010: a template asks by model name, replaces the layers, and Undo puts them back', async () => {
    await openExpert();
    const before = screen.getAllByTestId('bf-layer-card').map((c) => c.getAttribute('data-layer-name'));
    selectTab(screen.getByTestId('bf-tab-templates'));
    const tpl = require('../data/BasinTemplates').BasinTemplates[0];
    fireEvent.click(await screen.findByTestId(`bf-template-use-${tpl.id}`));
    const dlg = await screen.findByTestId('bf-template-confirm');
    expect(dlg).toHaveTextContent(/Replace the layers of Reference Basin/);
    fireEvent.click(within(dlg).getByTestId('bf-template-confirm-apply'));
    selectTab(screen.getByTestId('bf-tab-properties'));
    await waitFor(() => expect(screen.getAllByTestId('bf-layer-card')).toHaveLength(tpl.defaultStratigraphy.length));
    expect(screen.getByTestId('bf-undo-bar')).toHaveTextContent(`Template ${tpl.name} replaced 4 layers.`);
    fireEvent.click(screen.getByTestId('bf-undo-replace'));
    await waitFor(() => expect(screen.getAllByTestId('bf-layer-card').map((c) => c.getAttribute('data-layer-name'))).toEqual(before));
    expect(screen.queryByTestId('bf-undo-bar')).toBeNull();
  }, 180000);

  test('U2-008: two saved scenarios compare side by side', async () => {
    await openExpert();
    fireEvent.click(screen.getByTestId('bf-simulate'));
    await waitFor(() => expect(screen.getByTestId('bf-sim-status')).toHaveTextContent('Complete'), { timeout: 60000 });
    fireEvent.click(screen.getByTestId('bf-sim-view'));
    fireEvent.click(screen.getByTestId('bf-save-scenario'));
    fireEvent.click(screen.getByTestId('bf-save-scenario'));
    selectTab(screen.getByTestId('bf-tab-scenarios'));
    expect(await screen.findByTestId('bf-scenario-compare-hint')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox', { name: /^Compare / });
    expect(boxes).toHaveLength(2);
    fireEvent.click(boxes[0]); fireEvent.click(boxes[1]);
    const table = await screen.findByTestId('bf-scenario-compare');
    expect(within(table).getAllByTestId('bf-compare-col')).toHaveLength(2);
    expect(within(table).getAllByTestId('bf-compare-col-state')[0]).toHaveTextContent('Result computed from these inputs.');
    expect(within(table).getByTestId('bf-compare-row-hf')).toHaveAttribute('data-differs', 'no');
    expect(within(table).getByTestId('bf-compare-row-ro-source_shale')).toHaveTextContent(/Source Shale/);
  }, 180000);
});

describe('U2-018 the worked example opens from the welcome screen', () => {
  test('a new model with six layers, its calibration and Horner, in Expert mode', async () => {
    const be = makeInMemoryBackend({ persist: false });
    render(<MemoryRouter><BasinFlowShell backend={be} /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('bf-worked-example'));
    await screen.findByTestId('bf-tab-properties');
    await waitFor(() => expect(screen.getAllByTestId('bf-layer-card')).toHaveLength(6), { timeout: 30000 });
    await waitFor(() => expect(be._rows().some((r) => r.name === 'Worked example: rift-margin well' && r.calibration_data?.bht?.method === 'horner')).toBe(true));
    selectTab(screen.getByTestId('bf-tab-calibration'));
    expect(await screen.findByTestId('bf-cal-bht-method')).toHaveValue('horner');
    expect(screen.getByTestId('bf-cal-bht-circ')).toHaveValue(6);
  }, 180000);
});

describe('U2-015 the pressure tab and its handoff', () => {
  test('the reference basin reports its pressure and the link carries the handoff id', async () => {
    const be = makeInMemoryBackend({ persist: false });
    render(<MemoryRouter><BasinFlowShell backend={be} /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('bf-mode-expert'));
    await waitFor(() => expect(screen.getAllByTestId('bf-layer-card')).toHaveLength(4), { timeout: 30000 });
    fireEvent.click(screen.getByTestId('bf-simulate'));
    await waitFor(() => expect(screen.getByTestId('bf-sim-status')).toHaveTextContent('Complete'), { timeout: 60000 });
    fireEvent.click(screen.getByTestId('bf-sim-view'));
    selectTab(await screen.findByTestId('bf-results-tab-pressure'));
    expect(await screen.findByTestId('bf-pressure-note')).toHaveTextContent(/compaction disequilibrium/);
    const link = screen.getByTestId('bf-send-pressure');
    expect(link.getAttribute('href')).toMatch(/pore-pressure-studio\?bfPressure=\w+/);
    fireEvent.click(link);
    const id = link.getAttribute('href').split('bfPressure=')[1];
    const { readBasinPressure } = require('@/lib/basinPressure');
    expect(readBasinPressure(id).ok).toBe(true);
  }, 180000);
});
