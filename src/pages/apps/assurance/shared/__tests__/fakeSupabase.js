/**
 * AS13 — an in-memory stand-in for the Supabase query builder, enough
 * of it for the Assurance hooks' reads and writes: select, insert,
 * update, delete, eq, in, order, limit, single. Not a test file (the
 * jest testMatch is *.test.*); the hook tests import it.
 *
 * `rpc` answers "function not found" so the hooks fall back to issuing
 * codes from the rows they hold, which is a path they already have.
 */
export const makeFakeSupabase = (initial = {}) => {
  const tables = {};
  Object.entries(initial).forEach(([name, rows]) => {
    tables[name] = rows.map((r) => ({ ...r }));
  });
  const writes = [];
  let seq = 0;

  const from = (table) => {
    if (!tables[table]) tables[table] = [];
    const state = { op: 'select', filters: [], payload: null, single: false };
    const matches = (row) => state.filters.every((f) => f(row));

    const run = () => {
      const rows = tables[table];
      if (state.op === 'insert') {
        const list = Array.isArray(state.payload) ? state.payload : [state.payload];
        const inserted = list.map((r) => {
          seq += 1;
          return { id: `${table}-${seq}`, ...r };
        });
        rows.push(...inserted);
        writes.push({ table, op: 'insert', rows: inserted.map((r) => ({ ...r })) });
        return { data: state.single ? { ...inserted[0] } : inserted.map((r) => ({ ...r })), error: null };
      }
      if (state.op === 'update') {
        const hit = rows.filter(matches);
        hit.forEach((r) => Object.assign(r, state.payload));
        writes.push({ table, op: 'update', payload: { ...state.payload }, ids: hit.map((r) => r.id) });
        if (state.single) {
          return hit[0]
            ? { data: { ...hit[0] }, error: null }
            : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
        }
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      if (state.op === 'delete') {
        const before = rows.length;
        tables[table] = rows.filter((r) => !matches(r));
        writes.push({ table, op: 'delete', count: before - tables[table].length });
        return { data: null, error: null };
      }
      const hit = rows.filter(matches).map((r) => ({ ...r }));
      if (state.single) {
        return hit[0]
          ? { data: hit[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      }
      return { data: hit, error: null };
    };

    const builder = {
      select: () => builder,
      insert: (rows) => { state.op = 'insert'; state.payload = rows; return builder; },
      update: (patch) => { state.op = 'update'; state.payload = patch; return builder; },
      delete: () => { state.op = 'delete'; return builder; },
      eq: (col, value) => { state.filters.push((r) => r[col] === value); return builder; },
      neq: (col, value) => { state.filters.push((r) => r[col] !== value); return builder; },
      in: (col, values) => { state.filters.push((r) => values.includes(r[col])); return builder; },
      order: () => builder,
      limit: () => builder,
      single: () => { state.single = true; return builder; },
      maybeSingle: () => { state.single = true; return builder; },
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  };

  const client = {
    from,
    rpc: async () => ({ data: null, error: { code: '42883', message: 'function does not exist' } }),
  };

  return { client, tables, writes };
};

export default makeFakeSupabase;
