/**
 * STRAT-U2-008 organisation zone schemes (strat_zone_schemes, migration
 * 20260930180000, applied 2026-09-30). The in-memory store mirrors the
 * table's RLS; the registry service reads an absent table as "not
 * available yet"; the panel shares a browser scheme, lists the
 * organisation's with their creator, dates biozones from them; the .pld
 * import lands them in the importer's organisation.
 * Negative controls on origin/main bf9cc1ebc: no organisation schemes at all
 * (the panel had browser storage only; no store, no service, no family table).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeZoneSchemeStore } from '../services/inMemoryZoneSchemes';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { ZONE_SCHEMES_KEY } from '../services/zoneSchemes';

const mockResult = { current: { data: null, error: null } };
jest.mock('@/lib/customSupabaseClient', () => {
  const chain = () => new Proxy({}, { get: (t, k) => (k === 'then' ? (res) => res(mockResult.current) : () => chain()) });
  return { supabase: { from: () => chain(), auth: { getUser: async () => ({ data: { user: null } }) } } };
});

const MEMBERS = {
  'u-geo': { orgId: 'org-1', role: 'member', email: 'geo@operator.example' },
  'u-bio': { orgId: 'org-1', role: 'member', email: 'bio@operator.example' },
  'u-admin': { orgId: 'org-1', role: 'admin', email: 'admin@operator.example' },
  'u-other': { orgId: 'org-2', role: 'member', email: 'x@other.example' },
};
const NN = { name: 'NN (operator)', source: 'Operator calibration v3', zones: [{ zone: 'NN12', top_ma: 5.59, base_ma: 8.29 }] };

describe('the in-memory store mirrors the RLS of strat_zone_schemes', () => {
  test('members read, a member adds stamped as creator, another org sees nothing', async () => {
    const s = makeZoneSchemeStore({ members: MEMBERS, me: 'u-geo' });
    const { row } = await s.saveOrgZoneScheme(NN, { organizationId: 'org-1' });
    expect(row).toMatchObject({ organization_id: 'org-1', created_by: 'u-geo', name: 'NN (operator)' });
    s.as('u-bio'); expect((await s.listOrgZoneSchemes()).map((r) => r.name)).toEqual(['NN (operator)']);
    s.as('u-other'); expect(await s.listOrgZoneSchemes()).toEqual([]);
    await expect(s.saveOrgZoneScheme(NN, { organizationId: 'org-1' })).rejects.toThrow(/row-level security/);
  });

  test('only the creator or an admin replaces or deletes; the creator and organisation stay pinned', async () => {
    const s = makeZoneSchemeStore({ members: MEMBERS, me: 'u-geo' });
    const { row } = await s.saveOrgZoneScheme(NN, { organizationId: 'org-1' });
    s.as('u-bio');
    await expect(s.saveOrgZoneScheme({ ...NN, name: 'nn (OPERATOR) ' }, { organizationId: 'org-1' })).rejects.toThrow(/only its creator or an organisation admin can replace it/);
    await expect(s.deleteOrgZoneScheme(row.id)).rejects.toThrow(/creator or an organisation admin/);
    s.as('u-admin');
    const upd = await s.saveOrgZoneScheme({ ...NN, source: 'Operator calibration v4' }, { organizationId: 'org-1' });
    expect(upd).toMatchObject({ replaced: true, row: { created_by: 'u-geo', organization_id: 'org-1', source: 'Operator calibration v4' } });
    await s.deleteOrgZoneScheme(row.id);
    expect(s._rows()).toEqual([]);
  });

  test('a scheme needs a name and a source; an absent table says so', async () => {
    const s = makeZoneSchemeStore({ members: MEMBERS, me: 'u-geo' });
    await expect(s.saveOrgZoneScheme({ ...NN, source: ' ' }, { organizationId: 'org-1' })).rejects.toThrow(/needs a source/);
    const gone = makeZoneSchemeStore({ members: MEMBERS, me: 'u-geo', missing: true });
    await expect(gone.listOrgZoneSchemes()).rejects.toMatchObject({ name: 'ZoneSchemesUnavailable' });
  });
});

describe('the registry service', () => {
  test('a missing table (PGRST205 or 42P01) reads as not available yet; other errors pass through', async () => {
    const { listOrgZoneSchemes } = jest.requireActual('@/lib/stratRegistry');
    mockResult.current = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.strat_zone_schemes' in the schema cache" } };
    await expect(listOrgZoneSchemes()).rejects.toMatchObject({ name: 'ZoneSchemesUnavailable' });
    mockResult.current = { data: null, error: { code: '42P01', message: 'relation "strat_zone_schemes" does not exist' } };
    await expect(listOrgZoneSchemes()).rejects.toMatchObject({ name: 'ZoneSchemesUnavailable' });
    mockResult.current = { data: null, error: { code: '500', message: 'boom' } };
    await expect(listOrgZoneSchemes()).rejects.toThrow(/Could not list the organisation zone schemes: boom/);
    mockResult.current = { data: [{ id: 'z', name: 'NN' }], error: null };
    await expect(listOrgZoneSchemes()).resolves.toEqual([{ id: 'z', name: 'NN' }]);
  });
});

describe('the zone scheme panel', () => {
  const ZoneSchemePanel = jest.requireActual('../components/ZoneSchemePanel').default;
  beforeEach(() => localStorage.setItem(ZONE_SCHEMES_KEY, JSON.stringify([{ scheme: 'NN (operator)', zone: 'NN12', top_ma: 5.59, base_ma: 8.29, source: 'Operator calibration v3' }])));
  afterEach(() => localStorage.removeItem(ZONE_SCHEMES_KEY));

  test('share a browser scheme; a colleague sees it with its creator and dates biozones from it; an admin can remove it', async () => {
    const b = makeInMemoryBackend({ zoneSchemes: { members: MEMBERS, me: 'u-geo' } });
    const onStatus = jest.fn();
    const { unmount } = render(<ZoneSchemePanel intervals={[]} canEdit onReplace={jest.fn()} onStatus={onStatus} backend={b} />);
    fireEvent.click(await screen.findByTestId('strat-zone-scheme-share-NN (operator)'));
    await waitFor(() => expect(screen.getByTestId('strat-org-scheme-creator-NN (operator)').textContent).toBe('shared by you'));
    expect(onStatus).toHaveBeenLastCalledWith(expect.stringMatching(/Shared the NN \(operator\) scheme \(1 zone\) with your organisation/));
    unmount();
    // a colleague in another browser (no local scheme)
    localStorage.removeItem(ZONE_SCHEMES_KEY);
    b._zoneSchemes.as('u-bio');
    const onReplace = jest.fn(async () => {});
    const iv = [{ id: 'i1', kind: 'biozone_interval', top_md_m: 1440, base_md_m: 1500, code: 'NN12', properties: { scheme: 'NN (operator)' } }];
    const r2 = render(<ZoneSchemePanel intervals={iv} canEdit onReplace={onReplace} onStatus={onStatus} backend={b} />);
    await waitFor(() => expect(screen.getByTestId('strat-org-scheme-creator-NN (operator)').textContent).toBe('shared by geo@operator.example'));
    expect(screen.queryByTestId('strat-org-scheme-remove-NN (operator)')).toBeNull();
    fireEvent.click(screen.getByTestId('strat-zone-fill'));
    await waitFor(() => expect(onReplace).toHaveBeenCalled());
    expect(onReplace.mock.calls[0][1][0].properties).toMatchObject({ age_top_ma: 5.59, age_base_ma: 8.29, age_source: 'Operator calibration v3' });
    r2.unmount();
    b._zoneSchemes.as('u-admin');
    render(<ZoneSchemePanel intervals={[]} canEdit onReplace={jest.fn()} onStatus={onStatus} backend={b} />);
    fireEvent.click(await screen.findByTestId('strat-org-scheme-remove-NN (operator)'));
    await waitFor(() => expect(screen.getByTestId('strat-org-schemes-note').textContent).toMatch(/None shared yet/));
  });

  test('without the table the panel keeps browser storage and says sharing arrives with the table', async () => {
    const b = makeInMemoryBackend({ zoneSchemes: { members: MEMBERS, me: 'u-geo', missing: true } });
    render(<ZoneSchemePanel intervals={[]} canEdit onReplace={jest.fn()} onStatus={jest.fn()} backend={b} />);
    await waitFor(() => expect(screen.getByTestId('strat-org-schemes').getAttribute('data-state')).toBe('unavailable'));
    expect(screen.getByTestId('strat-org-schemes-note').textContent).toMatch(/becomes available once the strat_zone_schemes table is created/);
    expect(screen.getByTestId('strat-zone-scheme-summary').textContent).toMatch(/1 zones: NN \(operator\)/);
    expect(screen.queryByTestId('strat-zone-scheme-share-NN (operator)')).toBeNull();
  });

  test('outside an organisation the panel says schemes stay in the browser', async () => {
    const b = makeInMemoryBackend({ zoneSchemes: { members: {}, me: 'u-solo' } });
    render(<ZoneSchemePanel intervals={[]} canEdit onReplace={jest.fn()} onStatus={jest.fn()} backend={b} />);
    await waitFor(() => expect(screen.getByTestId('strat-org-schemes-note').textContent).toMatch(/not in an organisation/));
  });
});

describe('.pld: zone schemes travel with the stratigraphy project', () => {
  const { planImport } = jest.requireActual('@/lib/portability/importPackage');
  const { tableSpec, getFamily } = jest.requireActual('@/lib/portability/familySpec');
  jest.requireActual('@/lib/portability/geoscienceHooks');
  const U = '11111111-1111-4111-8111-111111111111';
  const pkg = () => ({
    manifest: { package_id: 'p', name: 'x', source: { user_id: U }, created_at: '2026-09-30T00:00:00Z', platform: { sha: 'abc' }, notes: [] },
    tables: { strat_zone_schemes: [{ id: '22222222-2222-4222-8222-222222222222', organization_id: '33333333-3333-4333-8333-333333333333', name: 'NN', source: 'v3', zones: [], created_by: U, chart_version: null, notes: null }] },
    blobs: [],
  });

  test('the family carries the table after the project, as a root; rows land in the importer\'s organisation without the old creator', () => {
    const fam = getFamily('geoscience');
    expect(fam.order.indexOf('strat_zone_schemes')).toBeGreaterThan(fam.order.indexOf('strat_projects'));
    expect(fam.roots.strat_zone_scheme).toBe('strat_zone_schemes');
    expect(tableSpec('strat_zone_schemes')).toMatchObject({ orgWide: 'zone schemes', stripOnInsert: ['created_by'] });
    const dst = '44444444-4444-4444-8444-444444444444';
    const plan = planImport(pkg(), { userId: dst, organizationId: '55555555-5555-4555-8555-555555555555' });
    const row = plan.planned?.strat_zone_schemes?.[0] || plan.tables?.strat_zone_schemes?.[0];
    expect(row.organization_id).toBe('55555555-5555-4555-8555-555555555555');
    expect('created_by' in row).toBe(false);
    expect(plan.notes.join(' ')).toMatch(/1 zone schemes joins your organisation/);
  });

  test('outside an organisation they are left out and named', () => {
    const plan = planImport(pkg(), { userId: '44444444-4444-4444-8444-444444444444', organizationId: null });
    expect((plan.planned?.strat_zone_schemes || plan.tables?.strat_zone_schemes || [])).toHaveLength(0);
    expect(plan.notes.join(' ')).toMatch(/1 organisation zone schemes was left out: you are not in an organisation/);
  });
});
