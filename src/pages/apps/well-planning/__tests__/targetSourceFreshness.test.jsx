// Source freshness on the Well Design Studio Targets tab (2026-10-12): a
// target picked from a registry top or surface says so when the source
// changes. Negative control: an unchanged registry gives no notice and no
// row badge; a moved top shows both; refresh writes the re-run pick and
// clears them; keep records the decision on the target.
import React from 'react';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
const mockRegistry = { wells: [], surfaces: [] };
jest.mock('@/lib/wellsRegistry', () => ({ listWellsWithTops: async () => JSON.parse(JSON.stringify(mockRegistry.wells)) }));
jest.mock('@/lib/surfacesRegistry', () => ({
  listSurfaces: async () => JSON.parse(JSON.stringify(mockRegistry.surfaces)),
  downloadSurfaceGrid: async () => new Float32Array(9).fill(-2500),
}));
jest.mock('@/lib/recordSharing', () => ({ supabaseSharingStore: () => ({ names: async (ids) => Object.fromEntries(ids.map((i) => [i, i === 'u-ada' ? 'Ada Colleague' : 'A colleague'])) }) }));
const mockStore = { targets: [] };
const mockUpdate = jest.fn();
jest.mock('../services/wpApi', () => ({
  saveTarget: jest.fn(), deleteTarget: jest.fn(),
  updateTarget: async (id, patch) => { mockUpdate(id, patch); const t = mockStore.targets.find((x) => x.id === id); Object.assign(t, patch); return t; },
}));
jest.mock('../components/TargetsMap', () => () => null);
let mockRerender = () => {};
jest.mock('../state/WellPlanningStore', () => ({
  useWellPlanningStore: () => ({
    site: { id: 'site-1', name: 'Pad A', user_id: 'me' }, wellbores: [], targets: mockStore.targets, user: { id: 'me' },
    refreshTargets: async () => { mockStore.targets = mockStore.targets.map((t) => ({ ...t })); mockRerender(); },
  }),
}));

// eslint-disable-next-line import/first
import TargetsTab from '../tabs/TargetsTab';
// eslint-disable-next-line import/first
import { targetFromTop, targetFromSurfacePick, targetSourceRefs } from '../services/targetSources';

const well = (mdTop = 1500) => ({
  id: 'w1', name: 'KETA-1', surface_x: 500000, surface_y: 6800000, kb_m: 30, td_md_m: 2000, deviation: [], version: 4, updated_at: '2026-10-01T08:00:00Z',
  tops: [{ id: 't1', name: 'Keta Sand', md_m: mdTop, updated_at: '2026-10-01T08:00:00Z' }],
});
const surface = () => ({ id: 's1', name: 'Top Keta', kind: 'structure', z_domain: 'depth', z_unit: 'm', xy_unit: 'm', crs: 'EPSG:32631', origin_x: 1000, origin_y: 2000, dx: 100, dy: 100, nx: 3, ny: 3, provenance: {}, updated_at: '2026-10-01T08:00:00Z' });

function setup() {
  const w = well();
  const pick = targetFromTop(w, w.tops[0], '', { now: '2026-10-02T10:00:00.000Z' });
  mockStore.targets = [{ id: 'tg1', site_id: 'site-1', created_at: '2026-10-02T10:00:00Z', ...pick }];
  mockRegistry.wells = [w];
  mockRegistry.surfaces = [surface()];
  const Wrapper = () => { const [, set] = React.useState(0); mockRerender = () => set((n) => n + 1); return <TargetsTab />; };
  return render(<Wrapper />);
}

beforeEach(() => { mockUpdate.mockReset(); });

test('the picks record their sources, and older picks still compare the MD they kept', () => {
  const w = well();
  const t = targetFromTop(w, w.tops[0]);
  expect(t.provenance.source_refs.top).toMatchObject({ kind: 'geo_wells_tops', id: 't1', fingerprint: expect.stringMatching(/^f:/) });
  expect(t.provenance.source_refs.well).toMatchObject({ kind: 'geo_wells', id: 'w1', version: 4 });
  const s = targetFromSurfacePick(surface(), new Float32Array(9).fill(-2500), 1100, 2100);
  expect(s.tvdss_m).toBeCloseTo(2500, 6);
  expect(s.provenance.source_refs.surface).toMatchObject({ kind: 'geo_surfaces', id: 's1' });
  const legacy = targetSourceRefs([{ id: 'old', name: 'Old', created_at: '2026-09-01T00:00:00Z', provenance: { source: 'geo_top', geo_well_id: 'w1', well_name: 'KETA-1', top_id: 't1', top_name: 'Keta Sand', top_md_m: 1500 } }]);
  expect(legacy).toHaveLength(1);
  expect(legacy[0]).toMatchObject({ key: 'target:old:top', fingerprint: expect.stringMatching(/^f:/) });
});

test('no notice while the registry is unchanged (negative control)', async () => {
  setup();
  await waitFor(() => expect(screen.getByTestId('wd-source-changed-clear')).toHaveTextContent(/no change since they were used/));
  expect(screen.queryByTestId('wd-source-changed')).toBeNull();
  expect(screen.queryByTestId('wd-target-stale-tg1')).toBeNull();
});

test('a moved top shows the notice and the row badge; refresh re-runs the pick and clears them', async () => {
  setup();
  await waitFor(() => expect(screen.getByTestId('wd-source-changed-clear')).toHaveTextContent(/no change since/));
  const moved = well(1520);
  moved.tops[0] = { ...moved.tops[0], id: 't9', updated_at: '2026-10-05T11:00:00Z' }; // tops written again: new id, same name
  mockRegistry.wells = [moved];
  await act(async () => { fireEvent.click(screen.getByTestId('wd-source-changed-check')); });
  const item = await screen.findByTestId('wd-source-changed-item');
  expect(item).toHaveTextContent('Keta Sand in KETA-1, under target Keta Sand @ KETA-1 (well top) changed after the target used it.');
  expect(item).toHaveTextContent('What moved: MD (m) 1500 to 1520.');
  expect(screen.getByTestId('wd-target-stale-tg1')).toBeInTheDocument();
  await act(async () => { fireEvent.click(within(item).getByTestId('wd-source-changed-refresh')); });
  await waitFor(() => expect(screen.queryByTestId('wd-source-changed')).toBeNull());
  expect(screen.queryByTestId('wd-target-stale-tg1')).toBeNull();
  const [, patch] = mockUpdate.mock.calls[0];
  expect(patch.provenance.top_id).toBe('t9');
  expect(patch.tvdss_m).toBeCloseTo(1520 - 30, 6);
});

test('keep current values records the decision on the target and clears the notice', async () => {
  setup();
  await waitFor(() => expect(screen.getByTestId('wd-source-changed-clear')).toHaveTextContent(/no change since/));
  mockRegistry.wells = [well(1520)];
  await act(async () => { fireEvent.click(screen.getByTestId('wd-source-changed-check')); });
  const item = await screen.findByTestId('wd-source-changed-item');
  await act(async () => { fireEvent.click(within(item).getByTestId('wd-source-changed-keep')); });
  await waitFor(() => expect(screen.queryByTestId('wd-source-changed')).toBeNull());
  const [, patch] = mockUpdate.mock.calls[0];
  expect(patch.provenance.kept.top).toMatch(/^f:/);
  expect(mockStore.targets[0].tvdss_m).toBeCloseTo(1500 - 30, 6);
});
