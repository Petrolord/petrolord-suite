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
