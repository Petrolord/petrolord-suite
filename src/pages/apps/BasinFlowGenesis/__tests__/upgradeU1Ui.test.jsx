/**
 * Basin & Charge Modeling upgrade U1: the app state and screens behind the
 * PL4/PL5/PL8 findings, driven on the in-memory backend (the /dev harness
 * twin). Negative controls are recorded in the upgrade doc.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';
import { BasinFlowShell } from '../BasinFlowGenesis';
import { MultiWellProvider, useMultiWell } from '../contexts/MultiWellContext';
import { BasinFlowProvider, useBasinFlow } from '../contexts/BasinFlowContext';
import { GuidedModeProvider, useGuidedMode } from '../contexts/GuidedModeContext';
import MultiWellManager from '../components/multiwell/MultiWellManager';
import { makeInMemoryBackend, referenceBasinRow } from '../services/backend';
import { engineInputsKey } from '../services/honesty';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
installDashboardScope({ userId: null });
beforeEach(() => { try { window.localStorage.clear(); window.sessionStorage.clear(); } catch { /* none */ } });

const selectTab = (el) => { fireEvent.mouseDown(el, { button: 0, ctrlKey: false }); fireEvent.click(el); };

let probe = null;
const Probe = () => { probe = { bf: useBasinFlow(), mw: useMultiWell() }; return null; };
const GuidedProbe = () => { probe = { ...probe, guided: useGuidedMode() }; return null; };

function twoWellBackend() {
  const be = makeInMemoryBackend({ persist: false });
  const a = be._rows()[0];
  a.scenarios = [{ id: 's-a', name: 'Saved on A', timestamp: '2026-09-30T00:00:00Z', stratigraphy: a.stratigraphy, heatFlow: a.heat_flow, results: null, parameters: {} }];
  a.updated_at = '2026-10-01T10:00:00Z';
  const b = { ...referenceBasinRow(), id: 'bf-well-b', name: 'Well B', updated_at: '2026-10-01T09:00:00Z', scenarios: [{ id: 's-b', name: 'Saved on B', timestamp: '2026-09-29T00:00:00Z', results: null, parameters: {} }], stratigraphy: referenceBasinRow().stratigraphy.slice(0, 2) };
  be._rows().push(b);
  return be;
}

describe('BF-U1-002/003 (S2): a model switch never carries the previous model\'s result or scenarios', () => {
  test('the saved scenarios are loaded and kept; switching drops the result and keeps each model\'s own list', async () => {
    const be = twoWellBackend();
    render(<MemoryRouter><MultiWellProvider backend={be}><BasinFlowProvider><Probe /><MultiWellManager /></BasinFlowProvider></MultiWellProvider></MemoryRouter>);
    await waitFor(() => expect(probe.mw.state.activeWellId).toBe('bf-well-ref'), { timeout: 30000 });
    await waitFor(() => expect(probe.bf.state.scenarios.map((s) => s.id)).toEqual(['s-a']), { timeout: 30000 });
    // the debounced auto-save after opening must not wipe the saved list
    await act(async () => { await new Promise((r) => setTimeout(r, 1800)); });
    expect(be._rows().find((r) => r.id === 'bf-well-ref').scenarios.map((s) => s.id)).toEqual(['s-a']);
    await act(async () => { await probe.bf.runSimulation(); });
    expect(probe.bf.state.results?.data).toBeTruthy();
    fireEvent.click(screen.getByText('Well B'));
    await waitFor(() => expect(probe.mw.state.activeWellId).toBe('bf-well-b'), { timeout: 30000 });
    expect(probe.bf.state.results).toBeNull();
    expect(probe.bf.state.scenarios.map((s) => s.id)).toEqual(['s-b']);
    await act(async () => { await new Promise((r) => setTimeout(r, 1800)); });
    expect(be._rows().find((r) => r.id === 'bf-well-b').scenarios.map((s) => s.id)).toEqual(['s-b']);
    expect(be._rows().find((r) => r.id === 'bf-well-ref').scenarios.map((s) => s.id)).toEqual(['s-a']);
  }, 120000);
});

describe('BF-U1-007 (S2): a guided run is a new model computed from its own inputs', () => {
  test('the active model is untouched; the new model is active and its result is of the guided inputs', async () => {
    const be = makeInMemoryBackend({ persist: false });
    const before = JSON.stringify(be._rows()[0].stratigraphy);
    render(<MemoryRouter><MultiWellProvider backend={be}><BasinFlowProvider><Probe /><MultiWellManager /><GuidedModeProvider><GuidedProbe /></GuidedModeProvider></BasinFlowProvider></MultiWellProvider></MemoryRouter>);
    await waitFor(() => expect(probe.mw.state.activeWellId).toBe('bf-well-ref'), { timeout: 30000 });
    act(() => { probe.guided.selectTemplate(require('../data/BasinTemplates').BasinTemplates[0].id); });
    await act(async () => { await probe.guided.runSimulation(); });
    await waitFor(() => expect(be._rows()).toHaveLength(2), { timeout: 30000 });
    const created = be._rows().find((r) => r.id !== 'bf-well-ref');
    expect(created.name).toMatch(/^Guided run/);
    expect(probe.mw.state.activeWellId).toBe(created.id);
    expect(probe.bf.state.results.runOf.key).toBe(engineInputsKey(probe.bf.state));
    await act(async () => { await new Promise((r) => setTimeout(r, 1800)); });
    expect(JSON.stringify(be._rows().find((r) => r.id === 'bf-well-ref').stratigraphy)).toBe(before);
  }, 120000);
});

describe('in the app (Expert mode on the harness backend)', () => {
  const openExpert = async () => {
    const be = makeInMemoryBackend({ persist: false });
    render(<MemoryRouter><BasinFlowShell backend={be} /><ProbeMount /></MemoryRouter>);
    fireEvent.click(await screen.findByTestId('bf-mode-expert'));
    await screen.findByTestId('bf-tab-properties');
    await waitFor(() => expect(screen.getAllByTestId('bf-layer-card')).toHaveLength(4));
    return be;
  };
  const ProbeMount = () => null;

  test('BF-U1-006 (S2): a layer is made a source rock with its TOC, HI and kerogen, and its conductivity edited, in Expert mode', async () => {
    await openExpert();
    const card = screen.getAllByTestId('bf-layer-card').find((c) => c.getAttribute('data-layer-name') === 'Upper Shale');
    fireEvent.click(within(card).getByTestId('bf-layer-details-toggle'));
    fireEvent.click(within(card).getByTestId('bf-layer-source'));
    fireEvent.change(within(card).getByTestId('bf-layer-toc'), { target: { value: '3.5' } });
    fireEvent.change(within(card).getByTestId('bf-layer-hi'), { target: { value: '450' } });
    fireEvent.change(within(card).getByTestId('bf-layer-kerogen'), { target: { value: 'type3' } });
    fireEvent.change(within(card).getByTestId('bf-layer-k'), { target: { value: '1.6' } });
    expect(within(card).getByTestId('bf-layer-source-badge')).toHaveTextContent('Source rock: TOC 3.5 wt %, HI 450');
    expect(within(card).getByTestId('bf-layer-custom')).toBeInTheDocument();
    fireEvent.click(within(card).getByTestId('bf-layer-library'));
    expect(within(card).queryByTestId('bf-layer-custom')).toBeNull();
  }, 120000);

  test('BF-U1-017: an age box can be cleared and retyped without snapping to 0', async () => {
    await openExpert();
    const card = screen.getAllByTestId('bf-layer-card')[0];
    const box = within(card).getByTestId('bf-layer-age-start');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '' } });
    expect(box.value).toBe('');
    fireEvent.change(box, { target: { value: '8' } });
    fireEvent.change(box, { target: { value: '85.' } });
    expect(box.value).toBe('85.');
    fireEvent.change(box, { target: { value: '85.5' } });
    expect(box.value).toBe('85.5');
  }, 120000);

  test('BF-U1-013/012: no misfit without a run; a run then an edit marks the result out of date', async () => {
    await openExpert();
    selectTab(screen.getByTestId('bf-tab-calibration'));
    await screen.findByTestId('bf-cal-ro-rms');
    expect(screen.getByTestId('bf-cal-ro-rms')).toHaveTextContent('n/a');
    expect(screen.getByTestId('bf-cal-no-run')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bf-simulate'));
    await waitFor(() => expect(screen.getByTestId('bf-sim-status')).toHaveTextContent('Complete'), { timeout: 30000 });
    fireEvent.click(screen.getByTestId('bf-sim-view'));
    await screen.findByTestId('bf-results-tab-summary');
    expect(screen.queryByTestId('bf-results-stale')).toBeNull();
    selectTab(screen.getByTestId('bf-tab-properties'));
    const th = screen.getAllByTestId('bf-layer-thickness')[0];
    fireEvent.focus(th);
    fireEvent.change(th, { target: { value: '1700' } });
    selectTab(screen.getByTestId('bf-tab-results'));
    expect(await screen.findByTestId('bf-results-stale')).toHaveTextContent(/inputs changed after this result/);
  }, 90000);
});
