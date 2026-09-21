/**
 * AS13 hardening — the in-memory Supabase of fakeSupabase.js, with a
 * database SCHEMA in front of it, so a hook can be run against a
 * database whose migration is not applied yet. Not a test file (the jest
 * testMatch is *.test.*); the hook tests import it.
 *
 *   missing: { table: ['col', ...] }  columns the database does not have.
 *     A select naming one answers 42703 (undefined column), as Postgres
 *     does; an insert or update writing one answers PGRST204, as
 *     PostgREST does. select('*') returns rows without them.
 *
 * It also stamps created_at on insert, the SAME value for every row of
 * one insert and a later one for each later insert, which is what
 * Postgres's now() gives a multi-row insert and what the Document
 * Control review rounds rely on. `.not()` is accepted as a no-op filter,
 * and storage answers as a project with no bucket.
 */
import { makeFakeSupabase } from './fakeSupabase';

export const makeSchemaFake = (initial = {}, { missing = {} } = {}) => {
  const fake = makeFakeSupabase(initial);
  let clock = Date.parse('2026-09-18T08:00:00Z');

  const namedColumns = (cols) => String(cols || '*')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && c !== '*' && !c.includes('(') && !c.includes(':'));

  const from = (table) => {
    const inner = fake.client.from(table);
    const absent = missing[table] || [];
    let failure = null;

    const writes = (payload) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      const bad = rows.flatMap((r) => Object.keys(r || {})).find((k) => absent.includes(k));
      if (bad) {
        failure = { code: 'PGRST204', message: `Could not find the '${bad}' column of '${table}' in the schema cache` };
      }
      return rows;
    };

    const builder = {
      select: (cols) => {
        const bad = namedColumns(cols).find((c) => absent.includes(c));
        if (bad && !failure) failure = { code: '42703', message: `column ${table}.${bad} does not exist` };
        inner.select(cols);
        return builder;
      },
      insert: (payload) => {
        const rows = writes(payload);
        clock += 1000;
        const stamp = new Date(clock).toISOString();
        const stamped = rows.map((r) => ({ created_at: stamp, ...r }));
        inner.insert(Array.isArray(payload) ? stamped : stamped[0]);
        return builder;
      },
      update: (patch) => { writes(patch); inner.update(patch); return builder; },
      delete: () => { inner.delete(); return builder; },
      eq: (...a) => { inner.eq(...a); return builder; },
      neq: (...a) => { inner.neq(...a); return builder; },
      in: (...a) => { inner.in(...a); return builder; },
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => { inner.single(); return builder; },
      maybeSingle: () => { inner.maybeSingle(); return builder; },
      then: (resolve, reject) => {
        if (failure) return Promise.resolve({ data: null, error: failure }).then(resolve, reject);
        return inner.then((res) => {
          if (res.error || !absent.length || !res.data) return res;
          const strip = (r) => {
            const out = { ...r };
            absent.forEach((c) => { delete out[c]; });
            return out;
          };
          return { ...res, data: Array.isArray(res.data) ? res.data.map(strip) : strip(res.data) };
        }).then(resolve, reject);
      },
    };
    return builder;
  };

  // `remove` succeeds and records what it was asked to delete (AS14), so
  // a test can assert a deleted document's files were cleared.
  const removedPaths = [];
  const storage = {
    from: () => ({
      remove: async (paths) => { removedPaths.push(...paths); return { data: paths, error: null }; },
      list: async () => ({ data: null, error: { message: 'Bucket not found' } }),
      upload: async () => ({ data: null, error: { message: 'Bucket not found' } }),
      createSignedUrl: async () => ({ data: null, error: { message: 'Bucket not found' } }),
    }),
  };

  return { ...fake, removedPaths, client: { from, rpc: fake.client.rpc, storage } };
};

export default makeSchemaFake;
