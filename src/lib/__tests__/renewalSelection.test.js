import { buildRenewalSelection, resolveRenewalSelection } from '../renewalSelection';
import { moduleAvailability, moduleLicenceName } from '../moduleAvailability';

describe('buildRenewalSelection (what the organisation holds)', () => {
  const purchases = [
    { app_uuid: 'a1', app_id: 'a1', seats_allocated: 3, status: 'active', module_id: 'm-geo' },
    { app_uuid: 'a2', app_id: 'a2', seats_allocated: null, status: 'active' },
    // a module-level row: written for a la carte buys too, so not a module licence
    { app_uuid: null, app_id: null, module_uuid: 'm-res', module_id: 'm-res', seats_allocated: 5, status: 'active' },
    { app_uuid: 'a9', app_id: 'a9', seats_allocated: 4, status: 'expired' },
  ];
  const subscriptions = [
    { modules: ['reservoir', 'hse_professional'], term: 'quarterly', end_date: '2026-10-01', status: 'active' },
    { modules: ['Economics'], term: 'annual', end_date: '2027-03-01', status: 'active' },
  ];

  it('takes app rows with their seat caps and the licensed module slugs, without HSE', () => {
    const sel = buildRenewalSelection({ purchases, subscriptions });
    expect(sel.apps).toEqual([{ id: 'a1', seats: 3 }, { id: 'a2', seats: 1 }]);
    expect(sel.modules.sort()).toEqual(['economics', 'reservoir']);
    expect(sel.billingTerm).toBe('annual'); // latest active subscription
  });

  it('is empty for an organisation that holds nothing', () => {
    expect(buildRenewalSelection({})).toEqual({ modules: [], apps: [], billingTerm: null });
  });
});

describe('resolveRenewalSelection (onto the quote builder catalogue)', () => {
  const geo = { id: 'm-geo', slug: 'geoscience', apps: [{ id: 'a1' }, { id: 'a3' }] };
  const masterApps = [
    { id: 'a1', slug: 'seismolord', status: 'active' },
    { id: 'a2', slug: 'well-test', status: 'active' },
    { id: 'a3', slug: 'petro', status: 'active' },
    { id: 'a4', slug: 'future', status: 'Coming Soon' },
  ];

  it('a module selects all its apps, a held app keeps its seat count, unknown items are reported', () => {
    const r = resolveRenewalSelection(
      { modules: ['geoscience', 'retired-module'], apps: [{ id: 'a1', seats: 4 }, { id: 'well-test', seats: 2 }, { id: 'a4', seats: 1 }, { id: 'gone', seats: 1 }], billingTerm: 'annual' },
      { masterApps, appsGroupedByModule: { 'm-geo': geo } },
    );
    expect(r.moduleIds).toEqual(['m-geo']);
    expect(r.appIds).toEqual(['a1', 'a3', 'a2']);
    expect(r.seats).toEqual({ a1: 4, a3: 1, a2: 2 });
    expect(r.missingModules).toEqual(['retired-module']);
    expect(r.missingApps).toEqual(['a4', 'gone']);
    expect(r.billingTerm).toBe('annual');
  });
});

describe('moduleAvailability (Module access overview)', () => {
  const modules = [{ id: 'uuid-geo', slug: 'geoscience', name: 'Geoscience' }, { id: 'uuid-res', slug: 'reservoir', name: 'Reservoir' }];

  it('lists every Suite module and marks those a licence touches, by slug, UUID or parent app module', () => {
    const rows = moduleAvailability([
      { module_id: 'geoscience' },
      { module_uuid: null, module_id: 'x', parent_module_uuid: 'uuid-res' },
    ], modules);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.find((r) => r.slug === 'geoscience').active).toBe(true);
    expect(rows.find((r) => r.slug === 'reservoir').active).toBe(true);
    expect(rows.find((r) => r.slug === 'drilling').active).toBe(false);
    expect(rows.some((r) => r.slug === 'hse')).toBe(false);
  });

  it('with no licences every module is listed and none is active', () => {
    const rows = moduleAvailability([], []);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.active === false)).toBe(true);
  });

  it('names a module-level licence from the catalogue', () => {
    expect(moduleLicenceName({ module_uuid: 'uuid-geo' }, modules)).toBe('Geoscience & Analytics');
    expect(moduleLicenceName({ module_id: 'drilling' }, [])).toBe('Drilling & Completion');
    expect(moduleLicenceName({}, modules)).toBeNull();
  });
});
