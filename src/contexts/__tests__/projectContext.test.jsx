/**
 * Suite Projects P1: the provider and the switcher.
 * - With the database answering "no projects" (P0 not applied) the scope stays
 *   off and nothing renders: the Suite behaves exactly as before.
 * - A user with only the Default project and no clients (the demo account
 *   today) gets the scope on but NO switcher: screens are unchanged.
 * - A consultant with a client sees "Client › Project", and ?project= in the
 *   URL opens that project.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockAuth = { user: { id: 'u1' }, organization: { id: 'o1' }, role: 'owner', isImpersonating: false, loading: false };
jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/lib/projects/projectsService', () => ({
  bootstrapProjects: jest.fn(),
  listProjects: jest.fn(),
  listClients: jest.fn(),
  listMyMemberships: jest.fn(async () => []),
  saveCurrentProject: jest.fn(async () => {}),
  adminOpenProject: jest.fn(async () => {}),
  createClient: jest.fn(), updateClient: jest.fn(), createProject: jest.fn(), updateProject: jest.fn(),
}));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const svc = require('@/lib/projects/projectsService');
const scope = require('@/lib/projects/projectScope');
const { ProjectProvider, useProject } = require('@/contexts/ProjectContext');
const ProjectSwitcher = require('@/components/projects/ProjectSwitcher').default;

function Probe() {
  const p = useProject();
  return <div data-testid="probe">{JSON.stringify({ available: p.available, show: p.showSwitcher, label: p.label })}</div>;
}
const mount = (url = '/dashboard') => render(
  <MemoryRouter initialEntries={[url]}>
    <ProjectProvider><Probe /><ProjectSwitcher /></ProjectProvider>
  </MemoryRouter>,
);
const probe = () => JSON.parse(screen.getByTestId('probe').textContent);

const DEF = { id: 'd', name: 'Default', is_default: true, client_id: null, status: 'active', visibility: 'organisation', owner_user_id: 'u1', organization_id: 'o1' };
const PA = { id: 'pa', name: 'OML 42', is_default: false, client_id: 'c1', status: 'active', visibility: 'organisation', owner_user_id: 'u1', organization_id: 'o1' };
const C1 = { id: 'c1', name: 'Breeze Energy', status: 'active', colour: '#123456' };

beforeEach(() => { scope._resetProjectScope(); jest.clearAllMocks(); window.history.pushState({}, '', '/'); });

test('P0 not applied: projects stay off and nothing renders', async () => {
  svc.bootstrapProjects.mockResolvedValue(null);
  mount();
  await waitFor(() => expect(svc.bootstrapProjects).toHaveBeenCalled());
  await waitFor(() => expect(probe().available).toBe(false));
  expect(scope.getProjectScope().enabled).toBe(false);
  expect(screen.queryByTestId('project-switcher')).toBeNull();
});

test('only the Default project and no clients: scope on, no switcher (screens unchanged)', async () => {
  svc.bootstrapProjects.mockResolvedValue({ defaultProjectId: 'd', currentProjectId: 'd', organizationId: 'o1' });
  svc.listProjects.mockResolvedValue([DEF]);
  svc.listClients.mockResolvedValue([]);
  mount();
  await waitFor(() => expect(probe().available).toBe(true));
  expect(probe().show).toBe(false);
  expect(scope.getProjectScope()).toEqual({ enabled: true, projectId: 'd', defaultProjectId: 'd' });
  expect(screen.queryByTestId('project-switcher')).toBeNull();
});

test('a consultant with a client sees "Client › Project"; ?project= opens it', async () => {
  svc.bootstrapProjects.mockResolvedValue({ defaultProjectId: 'd', currentProjectId: 'd', organizationId: 'o1' });
  svc.listProjects.mockResolvedValue([DEF, PA]);
  svc.listClients.mockResolvedValue([C1]);
  window.history.pushState({}, '', '/dashboard?project=pa');
  mount('/dashboard?project=pa');
  await waitFor(() => expect(probe().available).toBe(true));
  expect(probe().show).toBe(true);
  expect(screen.getByTestId('project-switcher-label').textContent).toBe('Breeze Energy › OML 42');
  expect(scope.getProjectScope().projectId).toBe('pa');
  // the deep link becomes the remembered current project
  expect(svc.saveCurrentProject).toHaveBeenCalledWith('u1', 'pa');
});

test('a failure loading projects never blocks the Suite', async () => {
  svc.bootstrapProjects.mockRejectedValue(new Error('network'));
  mount();
  await waitFor(() => expect(svc.bootstrapProjects).toHaveBeenCalled());
  await waitFor(() => expect(probe().available).toBe(false));
  expect(scope.getProjectScope().enabled).toBe(false);
});
