// Profile I/O (table present and absent), the provider value and the
// per-app hook: initial unit from the profile, session override, legacy
// migration, "differs" and reset.
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { fetchLayers, saveUserProfile, saveOrgProfile, readLocalUserProfile, isMissingTable } from '../profileService';
import { buildProfileValue, StaticUnitProfileProvider, useUnitProfile, NO_PROFILE } from '../UnitProfileContext';
import { useAppUnits, migrateLegacyKeys, VIEW_PREFIX, MIGRATED_PREFIX } from '../useAppUnits';
import { makeProfile } from '../presets';
import UnitProfileNote from '@/components/units/UnitProfileNote';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

// a thenable query chain; `handler(table, ops)` answers {data, error}
function fakeClient(handler) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const ops = [];
      const chain = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') {
            const res = handler(table, ops);
            calls.push({ table, ops });
            return (ok, bad) => Promise.resolve(res).then(ok, bad);
          }
          return (...args) => { ops.push([prop, ...args]); return chain; };
        },
      });
      return chain;
    },
  };
  return client;
}
const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.suite_unit_settings' in the schema cache" };

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

describe('fetchLayers', () => {
  test('rows and legacy depth come back as layers, with the admin named', async () => {
    const client = fakeClient((table, ops) => {
      if (table === 'geoscience_settings') return { data: { depth_unit: 'm' }, error: null };
      if (table === 'organization_members') return { data: { full_name: 'Ada Admin' }, error: null };
      expect(ops.find((o) => o[0] === 'or')[1]).toContain('organization_id.eq.org1');
      return { data: [
        { scope: 'organization', organization_id: 'org1', profile: { preset: 'metric', units: {}, version: 1 }, updated_by: 'adm', updated_at: '2026-09-30' },
        { scope: 'user', user_id: 'u1', profile: { preset: 'custom', units: { pressure: 'bar' }, version: 1 } },
      ], error: null };
    });
    const l = await fetchLayers({ userId: 'u1', orgId: 'org1', client });
    expect(l.tableAvailable).toBe(true);
    expect(l.organization.preset).toBe('metric');
    expect(l.user.units).toEqual({ pressure: 'bar' });
    expect(l.legacyDepthUnit).toBe('m');
    expect(l.orgMeta.updatedByName).toBe('Ada Admin');
  });

  test('table absent: quiet fallback to legacy and the browser copy of my units', async () => {
    window.localStorage.setItem('petrolord.units.user.v1:u1', JSON.stringify(makeProfile('metric')));
    const client = fakeClient((table) => (table === 'geoscience_settings' ? { data: { depth_unit: 'ft' }, error: null } : { data: null, error: MISSING }));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const l = await fetchLayers({ userId: 'u1', orgId: 'org1', client });
    expect(l.tableAvailable).toBe(false);
    expect(l.user.preset).toBe('metric');
    expect(l.organization).toBeNull();
    expect(l.legacyDepthUnit).toBe('ft');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('negative control: any other error is reported, not swallowed', async () => {
    const client = fakeClient((table) => (table === 'geoscience_settings' ? { data: null, error: null } : { data: null, error: { code: '500', message: 'boom' } }));
    await expect(fetchLayers({ userId: 'u1', orgId: 'org1', client })).rejects.toThrow(/boom/);
    expect(isMissingTable({ code: '42P01', message: 'relation "suite_unit_settings" does not exist' })).toBe(true);
    expect(isMissingTable({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});

describe('saving', () => {
  test('my units go to the table when it exists (update of my row)', async () => {
    const client = fakeClient((table, ops) => {
      if (ops[0][0] === 'select') return { data: { id: 'r1' }, error: null };
      if (ops[0][0] === 'update') return { data: [{ id: 'r1' }], error: null };
      return { data: null, error: null };
    });
    const res = await saveUserProfile({ userId: 'u1', profile: makeProfile('metric'), client });
    expect(res.stored).toBe('database');
    const upd = client.calls.find((c) => c.ops[0][0] === 'update');
    expect(upd.ops[0][1].profile).toEqual({ preset: 'metric', units: {}, version: 1 });
  });
  test('table absent: my units stay in this browser', async () => {
    const client = fakeClient(() => ({ data: null, error: MISSING }));
    const res = await saveUserProfile({ userId: 'u1', profile: makeProfile('custom', { depth: 'm' }), client });
    expect(res.stored).toBe('browser');
    expect(readLocalUserProfile('u1').units).toEqual({ depth: 'm' });
  });
  test('organisation default: absent table and a refused update both explain themselves', async () => {
    await expect(saveOrgProfile({ userId: 'u1', orgId: 'o1', profile: makeProfile('metric'), client: fakeClient(() => ({ data: null, error: MISSING })) }))
      .rejects.toThrow(/not switched on/);
    // a member's update: RLS leaves zero rows changed
    const client = fakeClient((table, ops) => (ops[0][0] === 'select' ? { data: { id: 'r1' }, error: null } : { data: [], error: null }));
    await expect(saveOrgProfile({ userId: 'u1', orgId: 'o1', profile: makeProfile('metric'), client })).rejects.toThrow(/Only an organisation admin/);
  });
  test('an invalid profile is refused before any I/O', async () => {
    const client = fakeClient(() => { throw new Error('should not be called'); });
    await expect(saveUserProfile({ userId: 'u1', profile: { preset: 'imperial', units: {} }, client })).rejects.toThrow(/not valid/);
  });
});

describe('provider value', () => {
  test('sources in plain words and admin detection', () => {
    const v = buildProfileValue({ layers: { organization: makeProfile('metric'), legacyDepthUnit: 'ft', tableAvailable: true }, role: 'admin', ready: true });
    expect(v.units.depth).toBe('m');
    expect(v.sourceText('depth')).toBe('organisation default');
    expect(v.isOrgAdmin).toBe(true);
    expect(buildProfileValue({ layers: null, role: 'member', ready: true }).sourceText('pressure')).toBe('built-in default');
  });
  test('no provider: available false', () => {
    let seen;
    const Probe = () => { seen = useUnitProfile(); return null; };
    render(<Probe />);
    expect(seen).toBe(NO_PROFILE);
    expect(seen.available).toBe(false);
  });
});

function Harness({ legacyKeys = [] }) {
  const u = useAppUnits('demo', {
    depth: { family: 'depth', allowed: ['m', 'ft'] },
    pressure: { family: 'pressure', allowed: ['MPa', 'psi'] },
  }, { fallback: { depth: 'm', pressure: 'MPa' }, legacyKeys });
  return (
    <div>
      <span data-testid="depth">{u.units.depth}</span>
      <span data-testid="pressure">{u.units.pressure}</span>
      <button type="button" onClick={() => u.setUnit('depth', u.units.depth === 'm' ? 'ft' : 'm')}>toggle</button>
      <UnitProfileNote u={u} />
    </div>
  );
}

describe('useAppUnits', () => {
  test('initial units come from the profile, mapped to what the app offers', () => {
    render(<StaticUnitProfileProvider layers={{ organization: makeProfile('metric') }}><Harness /></StaticUnitProfileProvider>);
    expect(screen.getByTestId('depth').textContent).toBe('m');
    expect(screen.getByTestId('pressure').textContent).toBe('MPa'); // kPa profile, nearest the app offers
    expect(screen.getByTestId('unit-profile-note').dataset.state).toBe('follows');
  });
  test('built-in oilfield when nothing is stored', () => {
    render(<StaticUnitProfileProvider layers={null}><Harness /></StaticUnitProfileProvider>);
    expect(screen.getByTestId('depth').textContent).toBe('ft');
    expect(screen.getByTestId('pressure').textContent).toBe('psi');
  });
  test('an in-app change is a session override, the note says so, reset returns to the profile', () => {
    render(<StaticUnitProfileProvider layers={{ organization: makeProfile('metric') }}><Harness /></StaticUnitProfileProvider>);
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('depth').textContent).toBe('ft');
    expect(screen.getByTestId('unit-profile-note').dataset.state).toBe('differs');
    expect(JSON.parse(window.sessionStorage.getItem(VIEW_PREFIX + 'demo'))).toEqual({ depth: 'ft' });
    fireEvent.click(screen.getByTestId('unit-profile-reset'));
    expect(screen.getByTestId('depth').textContent).toBe('m');
    expect(window.sessionStorage.getItem(VIEW_PREFIX + 'demo')).toBeNull();
  });
  test('an older remembered local choice no longer beats the profile', () => {
    window.localStorage.setItem('demo.units', JSON.stringify({ depth: 'ft' }));
    render(<StaticUnitProfileProvider layers={{ organization: makeProfile('metric') }}><Harness legacyKeys={['demo.units']} /></StaticUnitProfileProvider>);
    expect(screen.getByTestId('depth').textContent).toBe('m');
    expect(window.localStorage.getItem('demo.units')).toBeNull();
    expect(window.localStorage.getItem(MIGRATED_PREFIX + 'demo')).not.toBeNull();
    // runs once: a later write to the key is not touched again
    window.localStorage.setItem('demo.units', 'x');
    expect(migrateLegacyKeys('demo', ['demo.units'])).toEqual([]);
  });
  test('no provider: the app fallback stands and legacy keys are left alone', () => {
    window.localStorage.setItem('demo.units', 'keep');
    render(<Harness legacyKeys={['demo.units']} />);
    expect(screen.getByTestId('depth').textContent).toBe('m');
    expect(screen.queryByTestId('unit-profile-note')).toBeNull();
    expect(window.localStorage.getItem('demo.units')).toBe('keep');
  });
  test('the view follows a profile change when there is no override', () => {
    const { rerender } = render(<StaticUnitProfileProvider layers={{ organization: makeProfile('metric') }}><Harness /></StaticUnitProfileProvider>);
    expect(screen.getByTestId('depth').textContent).toBe('m');
    act(() => { rerender(<StaticUnitProfileProvider layers={{ organization: makeProfile('oilfield') }}><Harness /></StaticUnitProfileProvider>); });
    expect(screen.getByTestId('depth').textContent).toBe('ft');
  });
});
