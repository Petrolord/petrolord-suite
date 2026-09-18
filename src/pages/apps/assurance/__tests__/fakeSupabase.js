/**
 * AS13 — an in-memory stand-in for the PostgREST query builder, for the
 * assurance hook tests.
 *
 * Reads are answered from `tables`, filtered by the .eq() and .in()
 * calls the hook made. Writes are recorded in `writes` and answered
 * with success, so a test can assert what the hook tried to write (and,
 * as often, that it wrote nothing at all). It is not a database: it
 * applies no constraint, which is the point. A refusal a test sees came
 * from the hook, not from here.
 */
export const createFakeSupabase = (tables = {}) => {
  const writes = [];
  let nextId = 1;

  const run = (q) => {
    if (q.op === 'select') {
      let rows = [...(tables[q.table] || [])];
      q.filters.forEach(([col, value, kind]) => {
        rows = kind === 'in'
          ? rows.filter((r) => value.includes(r[col]))
          : rows.filter((r) => r[col] === value);
      });
      return { data: q.single ? rows[0] || null : rows, error: null };
    }
    writes.push({
      table: q.table, op: q.op, payload: q.payload, filters: q.filters,
    });
    if (q.op === 'insert') {
      const rows = (Array.isArray(q.payload) ? q.payload : [q.payload])
        .map((r) => ({ id: `new-${nextId++}`, ...r }));
      return { data: q.single ? rows[0] : rows, error: null };
    }
    if (q.op === 'update' && q.single) {
      return { data: { ...q.payload }, error: null };
    }
    return { data: null, error: null };
  };

  const from = (table) => {
    const q = { table, op: 'select', filters: [], payload: null, single: false };
    const builder = {
      select() { return builder; },
      eq(col, value) { q.filters.push([col, value]); return builder; },
      in(col, values) { q.filters.push([col, values, 'in']); return builder; },
      order() { return builder; },
      limit() { return builder; },
      single() { q.single = true; return builder; },
      maybeSingle() { q.single = true; return builder; },
      insert(payload) { q.op = 'insert'; q.payload = payload; return builder; },
      update(payload) { q.op = 'update'; q.payload = payload; return builder; },
      delete() { q.op = 'delete'; return builder; },
      then(resolve, reject) { return Promise.resolve(run(q)).then(resolve, reject); },
    };
    return builder;
  };

  // No code-issuing function is deployed: the hooks fall back to
  // counting the existing codes.
  const rpc = async () => ({ data: null, error: { code: '42883', message: 'no function' } });

  return { from, rpc, writes, tables };
};

/** The writes a test cares about, by table and operation. */
export const writesTo = (fake, table, op) =>
  fake.writes.filter((w) => w.table === table && (!op || w.op === op));
