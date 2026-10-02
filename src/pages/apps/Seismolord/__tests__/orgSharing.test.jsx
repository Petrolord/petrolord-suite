/**
 * Seismolord U2-008: organisation sharing of projects (seismic_projects, the
 * explorer folders), on the in-memory mirror of the sharing migration
 * (20261002100000_suite_record_sharing.sql). Volumes stay shared one by one
 * (seismic_volumes.organization_id, unchanged), so a shared project opens for
 * a colleague only as far as they can read its volumes, and says so.
 * The workspace itself is walked in the browser by e2e/org-sharing.spec.js.
 * Negative control on origin/main be1fb3ef4: projects were owner-only; a
 * colleague saw shared volumes in the flat list with no project.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SeismicExplorer from '../components/workspace/SeismicExplorer';
import ProjectSharingDialog from '../components/workspace/ProjectSharingDialog';
import { makeInMemoryProjectsBackend } from '../services/volumesService';
import { HARNESS_ME, HARNESS_COLLEAGUE, HARNESS_ORG } from '@/lib/recordSharing';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) } } }));
if (typeof global.DOMRect === 'undefined') {
  global.DOMRect = class DOMRect {
    constructor(x = 0, y = 0, width = 0, height = 0) { Object.assign(this, { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height }); }
    static fromRect(r = {}) { return new DOMRect(r.x, r.y, r.width, r.height); }
  };
}

const T = 'seismic_projects';
const vol = (id, name, extra = {}) => ({ id, name, status: 'ready', survey_meta: null, is_own: true, organization_id: null, project_id: null, ...extra });
const tree = (projects, volumes, extra = {}) => ({
  volumes, projects, activeVolumeId: null, horizons: [], visibleIds: new Set(), faults: [], visibleFaultIds: new Set(),
  wells: [], visibleWellIds: new Set(), savedTraverses: [], slicePlanes: [], horizonColorById: {}, userId: HARNESS_ME,
  projectOwnerNames: { [HARNESS_COLLEAGUE]: 'Ada Colleague' }, ...extra,
});
const actions = () => { const fns = {}; return new Proxy({}, { get: (_, n) => { fns[n] = fns[n] || jest.fn(); return fns[n]; } }); };

describe('the projects door', () => {
  test('the list carries the user\'s own project and the ones colleagues shared; only the owner deletes', async () => {
    const be = makeInMemoryProjectsBackend({ shared: true });
    const list = await be.listProjects();
    expect(list.map((p) => [p.name, p.user_id, p.visibility, p.org_access])).toEqual([
      ['Keta shelf, team project', HARNESS_COLLEAGUE, 'organization', 'edit'],
      ['Regional 2D lines (Ada)', HARNESS_COLLEAGUE, 'organization', 'view'],
      ['Keta 3D interpretation', HARNESS_ME, 'private', 'view'],
    ]);
    await expect(be.deleteProject({ id: 'sp-ada-view' })).rejects.toThrow('Only the owner can delete a project.');
    await expect(be.renameProject({ id: 'sp-ada-view' }, 'mine now')).rejects.toThrow('Shared by Ada Colleague for viewing. Save a copy to work on your own version.');
    // a project colleagues can edit is renamed only while this user holds it
    await expect(be.renameProject({ id: 'sp-ada-edit' }, 'renamed')).rejects.toThrow(/^Start editing first/);
    expect((await be.sharing.take(T, 'sp-ada-edit')).ok).toBe(true);
    expect(await be.renameProject({ id: 'sp-ada-edit' }, 'Keta shelf, team')).toMatchObject({ name: 'Keta shelf, team', updated_by: HARNESS_ME, user_id: HARNESS_COLLEAGUE });
    expect(be._sharing.db.listChanges(T, HARNESS_COLLEAGUE, 'sp-ada-edit').data[0]).toMatchObject({ action: 'updated', changed_by: HARNESS_ME, summary: 'Renamed', changed_fields: ['name'] });
  });

  test('before the migration the list is the user\'s own projects and a rename works as before', async () => {
    const be = makeInMemoryProjectsBackend({ shared: true, sharing: { applied: false } });
    expect((await be.listProjects()).map((p) => p.name)).toEqual(['Keta 3D interpretation']);
    expect((await be.renameProject({ id: 'sp-own' }, 'Renamed')).name).toBe('Renamed');
    expect((await be.sharing.capability(T)).available).toBe(false);
  });
});

describe('the explorer', () => {
  test('own projects first, then "Shared with me"; a shared project lists only the volumes this user can read', async () => {
    const be = makeInMemoryProjectsBackend({ shared: true });
    const projects = await be.listProjects();
    const volumes = [
      vol('v-own', 'My survey', { project_id: 'sp-own' }),
      vol('v-ada', 'Ada shared survey', { is_own: false, organization_id: HARNESS_ORG, project_id: 'sp-ada-edit' }),
    ];
    const a = actions();
    render(<MemoryRouter><SeismicExplorer tree={tree(projects, volumes)} actions={a} /></MemoryRouter>);
    const text = document.body.textContent;
    expect(text.indexOf('Keta 3D interpretation')).toBeLessThan(text.indexOf('Shared with me'));
    expect(text.indexOf('Shared with me')).toBeLessThan(text.indexOf('Keta shelf, team project'));
    expect(text.indexOf('Keta shelf, team project')).toBeLessThan(text.indexOf('Ada shared survey'));
    expect(screen.getByText('No volume of this project is shared with your organisation yet.')).toBeInTheDocument();   // Regional 2D lines (Ada)
    const share = screen.getAllByTestId('seis-project-share').find((el) => el.getAttribute('data-project-name') === 'Regional 2D lines (Ada)');
    expect(share).toHaveAttribute('title', 'Shared by Ada Colleague: sharing and history');
    fireEvent.click(share);
    expect(a.openProjectSharing).toHaveBeenCalledWith(expect.objectContaining({ id: 'sp-ada-view' }));
  });
});

describe('the sharing dialog', () => {
  const Dialog = ({ be, id, volumes }) => {
    const [projects, setProjects] = React.useState(null);
    React.useEffect(() => { be.listProjects().then(setProjects); }, [be]);
    if (!projects) return null;
    return (
      <ProjectSharingDialog project={projects.find((p) => p.id === id)} volumes={volumes} store={be.sharing} onClose={() => {}}
        onChange={(next) => setProjects((l) => l.map((p) => (p.id === next.id ? { ...p, ...next } : p)))} onSaveCopy={() => {}} onReload={() => {}} />
    );
  };

  test('the owner shares a project and is told which of its volumes colleagues will not see', async () => {
    const be = makeInMemoryProjectsBackend();
    const volumes = [vol('v1', 'Keta 3D', { project_id: 'sp-own' }), vol('v2', 'Keta 3D far', { project_id: 'sp-own', organization_id: HARNESS_ORG })];
    await act(async () => { render(<Dialog be={be} id="sp-own" volumes={volumes} />); });
    await act(async () => { fireEvent.click(await screen.findByTestId('share-switch')); });
    await waitFor(() => expect(be._sharing.db._rows(T)[0]).toMatchObject({ visibility: 'organization', organization_id: HARNESS_ORG }));
    expect(await screen.findByTestId('seis-project-volumes-note')).toHaveTextContent('1 of 2 volumes in this project is private (Keta 3D). Colleagues will not see it until you share it from its menu ("Share with organization").');
    expect(be._sharing.db.select(T, HARNESS_COLLEAGUE).data.map((p) => p.name)).toEqual(['Keta 3D interpretation']);
  });

  test('a colleague sees who shared it, how far it opens, and Save a copy; no switch', async () => {
    const be = makeInMemoryProjectsBackend({ shared: true });
    await act(async () => { render(<Dialog be={be} id="sp-ada-view" volumes={[]} />); });
    await waitFor(() => expect(screen.getByTestId('shared-by')).toHaveTextContent('Shared by Ada Colleague'));
    expect(screen.queryByTestId('share-switch')).toBeNull();
    expect(screen.getByTestId('save-copy')).toBeInTheDocument();
    expect(screen.getByTestId('seis-project-volumes-note')).toHaveTextContent('No volume of this project is shared with your organisation yet, so there is nothing to open. Ask the owner to share the volumes.');
  });

  test('before the migration the dialog shows the note and no switch', async () => {
    const be = makeInMemoryProjectsBackend({ sharing: { applied: false } });
    await act(async () => { render(<Dialog be={be} id="sp-own" volumes={[]} />); });
    expect(await screen.findByTestId('sharing-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('share-switch')).toBeNull();
  });
});
