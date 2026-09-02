// PP0 gate (docs/scope/ProjectPortability-PLAN.md §6): the Petrel rule on rows.
//  - a row at version N+1 is refused with a message naming both versions
//  - a row with no schema_version column opens as version 1 with defaults
//  - migrations run step-wise and stamp the result
//  - stampState carries the build; writeStamped retries without the stamp
//    when the table has not received the PP0 columns yet

import {
  registerStateKind, openState, openStateRow, stampState, writeStamped, withoutStamp,
  readStateVersion, isNewerStateError, isUnknownColumnError, newerStateMessage,
  StateVersionError, _resetStateKinds,
} from '@/lib/stateVersion';
import { PLATFORM_BUILD, buildLabel } from '@/lib/platformBuild';

beforeEach(() => _resetStateKinds());

describe('registerStateKind', () => {
  test('requires a migrator for every step below current', () => {
    expect(() => registerStateKind('k', { current: 3, migrations: { 1: (r) => r } }))
      .toThrow(/no migrator from version 2 to 3/);
    expect(() => registerStateKind('k', { current: 3, migrations: { 1: (r) => r, 2: (r) => r } })).not.toThrow();
  });
  test('rejects a non-positive current', () => {
    expect(() => registerStateKind('k', { current: 0 })).toThrow(TypeError);
  });
});

describe('readStateVersion', () => {
  test('missing, null or invalid column reads as version 1', () => {
    expect(readStateVersion({})).toBe(1);
    expect(readStateVersion({ schema_version: null })).toBe(1);
    expect(readStateVersion({ schema_version: 0 })).toBe(1);
    expect(readStateVersion({ schema_version: '3' })).toBe(1);
    expect(readStateVersion(null)).toBe(1);
    expect(readStateVersion({ schema_version: 4 })).toBe(4);
  });
});

describe('openState', () => {
  test('a version-N+1 row is refused, naming both versions (the Petrel rule)', () => {
    registerStateKind('interp', { current: 2, migrations: { 1: (r) => r }, label: 'interpretation' });
    let err;
    try { openState('interp', { schema_version: 3, x: 1 }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(StateVersionError);
    expect(isNewerStateError(err)).toBe(true);
    expect(err.message).toBe(newerStateMessage('interpretation', 3, 2));
    expect(err.message).toMatch(/state version 3/);
    expect(err.message).toMatch(/reads up to version 2/);
    expect(err.message).not.toContain('—');
    expect(err.found).toBe(3);
    expect(err.current).toBe(2);
  });

  test('a row with no schema_version column opens as version 1 and migrates up', () => {
    registerStateKind('proj', {
      current: 3,
      migrations: {
        1: (r) => ({ ...r, inputs_data: { ...r.inputs_data, units: r.inputs_data.units || 'field' } }),
        2: (r) => ({ ...r, inputs_data: { ...r.inputs_data, cases: r.inputs_data.cases || [] } }),
      },
    });
    const { row, from, to, migrated } = openState('proj', { id: 'a', inputs_data: { name: 'x' } });
    expect({ from, to, migrated }).toEqual({ from: 1, to: 3, migrated: true });
    expect(row.inputs_data).toEqual({ name: 'x', units: 'field', cases: [] });
    expect(row.schema_version).toBe(3);
  });

  test('a current-version row passes through untouched', () => {
    registerStateKind('proj', { current: 1 });
    const input = { id: 'a', schema_version: 1, inputs_data: { name: 'x' } };
    const res = openState('proj', input);
    expect(res.row).toBe(input);
    expect(res.migrated).toBe(false);
  });

  test('null rows pass through; unregistered kinds throw', () => {
    registerStateKind('proj', { current: 1 });
    expect(openStateRow('proj', null)).toBeNull();
    expect(() => openState('nope', {})).toThrow(/not registered/);
  });

  test('a migrator that returns nothing is a config error, not a silent blank row', () => {
    registerStateKind('bad', { current: 2, migrations: { 1: () => undefined } });
    expect(() => openState('bad', { schema_version: 1 })).toThrow(/returned undefined/);
  });
});

describe('stamping', () => {
  test('stampState writes the current version and the platform build', () => {
    registerStateKind('proj', { current: 2, migrations: { 1: (r) => r } });
    const stamped = stampState('proj', { id: 'a' });
    expect(stamped).toEqual({ id: 'a', schema_version: 2, app_build: PLATFORM_BUILD.sha });
    expect(withoutStamp(stamped)).toEqual({ id: 'a' });
  });

  test('under jest the build falls back to dev/unknown and the label still renders', () => {
    expect(PLATFORM_BUILD.version).toBe('dev');
    expect(PLATFORM_BUILD.sha).toBe('unknown');
    expect(buildLabel()).toBe('Petrolord Suite dev');
  });

  test('isUnknownColumnError recognises PostgREST unknown-column failures only', () => {
    expect(isUnknownColumnError({ code: '42703', message: 'column "schema_version" does not exist' })).toBe(true);
    expect(isUnknownColumnError({ code: 'PGRST204', message: "Could not find the 'app_build' column of 'saved_x' in the schema cache" })).toBe(true);
    expect(isUnknownColumnError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false);
    expect(isUnknownColumnError(null)).toBe(false);
  });

  test('writeStamped retries once without the stamp when the columns are missing', async () => {
    registerStateKind('proj', { current: 1 });
    const calls = [];
    const write = jest.fn(async (row) => {
      calls.push(row);
      if ('schema_version' in row) return { data: null, error: { code: 'PGRST204', message: "Could not find the 'schema_version' column" } };
      return { data: row, error: null };
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await writeStamped('proj', { id: 'a' }, write);
    expect(write).toHaveBeenCalledTimes(2);
    expect(calls[0]).toMatchObject({ id: 'a', schema_version: 1 });
    expect(calls[1]).toEqual({ id: 'a' });
    expect(res.error).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test('writeStamped does not retry other errors', async () => {
    registerStateKind('proj', { current: 1 });
    const write = jest.fn(async () => ({ data: null, error: { code: '42501', message: 'rls' } }));
    const res = await writeStamped('proj', { id: 'a' }, write);
    expect(write).toHaveBeenCalledTimes(1);
    expect(res.error.code).toBe('42501');
  });
});
