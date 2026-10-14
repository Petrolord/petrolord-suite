/**
 * Suite Projects P1/P2: the Projects page renders for a consultant (clients,
 * projects grouped by client, settings) and saves settings through
 * useProject().saveSettings; a non-manager sees settings read-only.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockProject = {};
jest.mock('@/contexts/ProjectContext', () => ({ useProject: () => mockProject }));
jest.mock('@/contexts/SupabaseAuthContext', () => {
  const R = jest.requireActual('react');
  return { useAuth: () => ({ user: { id: 'u1' } }), AuthContext: R.createContext({ user: { id: 'u1' } }) };
});
jest.mock('@/lib/projects/projectsService', () => ({
  MOVABLE: [{ table: 'geo_wells', label: 'Wells' }],
  APP_MOVABLE: [{ table: 'saved_well_test_projects', label: 'Saved well test projects', nameColumn: 'project_name' }],
  listMovable: jest.fn(async () => [{ id: 'w1', name: 'LEGACY-1' }]),
  moveToProject: jest.fn(async () => 1),
}));
jest.mock('@/lib/crs/settingsService', () => ({ setProjectCrs: jest.fn(async () => ({})) }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const ProjectsPage = require('@/pages/ProjectsPage').default;

const DEF = { id: 'd', name: 'Default', is_default: true, client_id: null, status: 'active', visibility: 'organisation', owner_user_id: 'u1' };
const PA = { id: 'pa', name: 'OML 42', is_default: false, client_id: 'c1', status: 'active', visibility: 'members', owner_user_id: 'u1', settings: {} };
const C1 = { id: 'c1', name: 'Breeze Energy', status: 'active', colour: '#123456' };

function setProject(over = {}) {
  Object.keys(mockProject).forEach((k) => delete mockProject[k]);
  Object.assign(mockProject, {
    available: true, loading: false, projects: [DEF, PA], clients: [C1], current: PA, currentClient: C1,
    defaultProjectId: 'd', isDefault: false, settings: { units: null, crs: null, datum: null, timescale: null },
    canManage: () => true, saveSettings: jest.fn(async () => ({})), switchProject: jest.fn(), refresh: jest.fn(),
    createClient: jest.fn(), updateClient: jest.fn(), createProject: jest.fn(), updateProject: jest.fn(), ...over,
  });
}
const mount = () => render(<MemoryRouter><ProjectsPage /></MemoryRouter>);

test('a consultant sees clients, grouped projects and the project settings', async () => {
  setProject();
  mount();
  expect(screen.getByTestId('projects-current-label').textContent).toBe('Breeze Energy › OML 42');
  expect(screen.getByTestId('projects-group-c1')).toBeTruthy();
  expect(screen.getByTestId('projects-group-internal')).toBeTruthy();
  expect(screen.getByTestId('projects-settings')).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId('projects-move-pick-w1')).toBeTruthy());
});

test('saving the datum and the chart edition goes through saveSettings only', async () => {
  setProject();
  mount();
  fireEvent.change(screen.getByTestId('projects-settings-datum-ref'), { target: { value: 'RT' } });
  fireEvent.click(screen.getByTestId('projects-settings-datum-save'));
  await waitFor(() => expect(mockProject.saveSettings).toHaveBeenCalledWith({ datum: { refKind: 'RT', verticalDatum: null, srdM: null } }));
  fireEvent.change(screen.getByTestId('projects-settings-timescale-select'), { target: { value: 'ICS 2023/09' } });
  fireEvent.click(screen.getByTestId('projects-settings-timescale-save'));
  await waitFor(() => expect(mockProject.saveSettings).toHaveBeenCalledWith({ timescale: 'ICS 2023/09' }));
});

test('a member who does not manage the project reads settings without save buttons', () => {
  setProject({ canManage: () => false });
  mount();
  expect(screen.queryByTestId('projects-settings-datum-save')).toBeNull();
  expect(screen.getByTestId('projects-settings-datum-ref').disabled).toBe(true);
});

test('before projects are on, the page says so and shows nothing else', () => {
  setProject({ available: false });
  mount();
  expect(screen.getByTestId('projects-unavailable')).toBeTruthy();
  expect(screen.queryByTestId('projects-settings')).toBeNull();
});
