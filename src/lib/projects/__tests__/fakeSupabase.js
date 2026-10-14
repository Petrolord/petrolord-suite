// In-memory stand-in for the supabase-js query builder, enough for the
// registries' list and insert paths (select / eq / or / in / is / order /
// limit / range / single / insert / update). It applies the filters the
// registries send, so a test proves the CLIENT scopes by project; row level
// security itself is proven by the P0 pentest (tools/security/suite-projects).

let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function parseOr(expr) {
  // "col.eq.X,col.is.null"
  return expr.split(',').map((part) => {
    const [col, op, ...rest] = part.split('.');
    return { col, op, val: rest.join('.') };
  });
}

function matches(row, f) {
  const v = row[f.col];
  switch (f.op) {
    case 'eq': return v === f.val;
    case 'is': return f.val === 'null' ? v === null || v === undefined : v === f.val;
    case 'in': return f.val.includes(v);
    default: return true;
  }
}

export function makeFakeSupabase({ user = { id: 'me' }, tables = {} } = {}) {
  const db = { ...tables };
  const calls = [];
  const rowsOf = (t) => { if (!db[t]) db[t] = []; return db[t]; };

  function builder(table) {
    const st = { op: 'select', filters: [], ors: [], payload: null, single: false, maybe: false, limit: null, range: null, head: false, embeds: [] };
    const api = {
      select(cols = '*', opts = {}) {
        if (st.op === 'select') st.op = 'select';
        st.head = !!opts.head;
        const m = /,\s*(\w+)\(/.exec(cols || '');
        if (m) st.embeds.push(m[1]);
        return api;
      },
      eq(col, val) { st.filters.push({ col, op: 'eq', val }); return api; },
      is(col, val) { st.filters.push({ col, op: 'is', val: val === null ? 'null' : val }); return api; },
      in(col, vals) { st.filters.push({ col, op: 'in', val: vals }); return api; },
      or(expr) { st.ors.push(parseOr(expr)); return api; },
      order() { return api; },
      limit(n) { st.limit = n; return api; },
      range(a, b) { st.range = [a, b]; return api; },
      single() { st.single = true; return api; },
      maybeSingle() { st.single = true; st.maybe = true; return api; },
      insert(payload) { st.op = 'insert'; st.payload = payload; return api; },
      update(patch) { st.op = 'update'; st.payload = patch; return api; },
      delete() { st.op = 'delete'; return api; },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    const filtered = () => rowsOf(table).filter((r) => st.filters.every((f) => matches(r, f))
      && st.ors.every((group) => group.some((f) => matches(r, f))));
    function run() {
      calls.push({ table, op: st.op, filters: st.filters, ors: st.ors, payload: st.payload });
      if (st.op === 'insert') {
        const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((r) => ({ id: uid(), created_at: new Date().toISOString(), ...r }));
        rowsOf(table).push(...list);
        return { data: st.single ? list[0] : list, error: null };
      }
      if (st.op === 'update') {
        const hit = filtered();
        hit.forEach((r) => Object.assign(r, st.payload));
        return { data: st.single ? hit[0] || null : hit, error: null };
      }
      if (st.op === 'delete') {
        const hit = new Set(filtered());
        db[table] = rowsOf(table).filter((r) => !hit.has(r));
        return { data: [...hit], error: null };
      }
      let out = filtered().map((r) => {
        const row = { ...r };
        for (const e of st.embeds) row[e] = rowsOf(e).filter((c) => c.well_id === r.id);
        return row;
      });
      if (st.range) out = out.slice(st.range[0], st.range[1] + 1);
      if (st.limit != null) out = out.slice(0, st.limit);
      if (st.head) return { data: null, count: out.length, error: null };
      if (st.single) return { data: out[0] || null, error: out[0] || st.maybe ? null : { message: 'not found' } };
      return { data: out, error: null };
    }
    return api;
  }

  const storageBucket = { upload: async () => ({ error: null }), remove: async () => ({ error: null }), download: async () => ({ data: null, error: { message: 'no blob' } }), createSignedUrl: async () => ({ data: { signedUrl: 'x' }, error: null }) };
  return {
    db, calls,
    from: (t) => builder(t),
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'not here' } }),
    auth: { getUser: async () => ({ data: { user }, error: null }), getSession: async () => ({ data: { session: { user } }, error: null }) },
    storage: { from: () => storageBucket },
  };
}
