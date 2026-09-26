// Dev-only test double for the Supabase client (senior testing, Wave 2,
// 2026-09-26). Harness routes wrap an app in <InMemorySupabase> so it runs
// without auth or a database: table reads and writes go to an in-memory
// store with the PostgREST call shapes the Suite uses, auth.getUser returns a
// dev user, and named edge functions can be stood in by local functions.
// The real client is restored when the wrapper unmounts. Never imported by
// production routes.

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export const DEV_USER = { id: 'dev-user', email: 'harness@petrolord.dev' };
const NOW = () => new Date().toISOString();
let seq = 0;
let saved = null;        // the real client methods while a harness is mounted
let restoreTimer = null;
const NO_FUNCTIONS = {};
export const newId = (p = 'row') => `${p}-${Date.now().toString(36)}-${(++seq).toString(36)}`;

/** A store: { [table]: rows[] }, mutated in place by the query builder. */
export function createStore(seed = {}) {
  const db = {};
  for (const [t, rows] of Object.entries(seed)) db[t] = rows.map((r) => ({ ...r }));
  return db;
}

/** A PostgREST-shaped query builder over the store. */
export function makeQuery(db, table, user = DEV_USER) {
  const st = { filters: [], order: [], limit: null, op: 'select', payload: null, onConflict: null, joins: [] };
  const rows = () => (db[table] || (db[table] = []));
  const match = (r) => st.filters.every(([k, op, v]) => {
    const x = r[k];
    if (op === 'eq') return x === v;
    if (op === 'neq') return x !== v;
    if (op === 'is') return (x ?? null) === v;
    if (op === 'in') return v.includes(x);
    if (op === 'gte') return x >= v;
    if (op === 'lte') return x <= v;
    if (op === 'gt') return x > v;
    if (op === 'lt') return x < v;
    if (op === 'ilike') return String(x ?? '').toLowerCase().includes(String(v).replace(/%/g, '').toLowerCase());
    return true;
  });
  const stamp = (r) => ({ id: r.id ?? newId(table), created_at: r.created_at ?? NOW(), updated_at: NOW(), user_id: r.user_id ?? user.id, ...r });
  const run = () => {
    if (st.op === 'insert' || st.op === 'upsert') {
      const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map(stamp);
      const out = [];
      for (const r of list) {
        const keys = st.op === 'upsert' ? (st.onConflict ? st.onConflict.split(',').map((s) => s.trim()) : ['id']) : null;
        const i = keys ? rows().findIndex((x) => keys.every((k) => x[k] === r[k])) : -1;
        if (i >= 0) { db[table][i] = { ...db[table][i], ...r, id: db[table][i].id }; out.push(db[table][i]); } else { db[table].push(r); out.push(r); }
      }
      return out;
    }
    if (st.op === 'update') {
      const out = [];
      db[table] = rows().map((r) => (match(r) ? (out.push({ ...r, ...st.payload, updated_at: NOW() }), out[out.length - 1]) : r));
      return out;
    }
    if (st.op === 'delete') {
      const gone = rows().filter(match);
      db[table] = rows().filter((r) => !match(r));
      return gone;
    }
    let out = rows().filter(match);
    for (const [k, asc] of [...st.order].reverse()) out = [...out].sort((a, b) => ((a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1)));
    if (st.limit != null) out = out.slice(0, st.limit);
    // embedded child tables, e.g. select('*, rb_results(*)'): children whose <parent>_id or run_id points here
    for (const child of st.joins) {
      out = out.map((r) => ({ ...r, [child]: (db[child] || []).filter((c) => Object.entries(c).some(([ck, cv]) => ck.endsWith('_id') && cv === r.id)) }));
    }
    return out.map((r) => ({ ...r }));
  };
  const q = {
    select(cols) {
      if (typeof cols === 'string') for (const m of cols.matchAll(/(\w+)\s*\(/g)) st.joins.push(m[1]);
      return q;
    },
    eq(k, v) { st.filters.push([k, 'eq', v]); return q; },
    neq(k, v) { st.filters.push([k, 'neq', v]); return q; },
    is(k, v) { st.filters.push([k, 'is', v]); return q; },
    in(k, v) { st.filters.push([k, 'in', v]); return q; },
    gte(k, v) { st.filters.push([k, 'gte', v]); return q; },
    lte(k, v) { st.filters.push([k, 'lte', v]); return q; },
    gt(k, v) { st.filters.push([k, 'gt', v]); return q; },
    lt(k, v) { st.filters.push([k, 'lt', v]); return q; },
    ilike(k, v) { st.filters.push([k, 'ilike', v]); return q; },
    match(obj) { for (const [k, v] of Object.entries(obj)) st.filters.push([k, 'eq', v]); return q; },
    order(k, o = {}) { st.order.push([k, o.ascending !== false]); return q; },
    limit(n) { st.limit = n; return q; },
    range(a, b) { st.limit = b + 1; return q; },
    insert(p) { st.op = 'insert'; st.payload = p; return q; },
    upsert(p, o = {}) { st.op = 'upsert'; st.payload = p; st.onConflict = o.onConflict || null; return q; },
    update(p) { st.op = 'update'; st.payload = p; return q; },
    delete() { st.op = 'delete'; return q; },
    single() { const r = run(); return Promise.resolve(r.length ? { data: r[0], error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } }); },
    maybeSingle() { const r = run(); return Promise.resolve({ data: r[0] ?? null, error: null }); },
    then(res, rej) { return Promise.resolve({ data: run(), error: null, count: null }).then(res, rej); },
  };
  return q;
}

/**
 * An in-memory storage client over db.__storage ({ 'bucket/path': Blob }),
 * with the upload / download / remove / copy / list calls the Suite uses.
 */
export function makeStorage(db) {
  const files = db.__storage || (db.__storage = {});
  const toBlob = (f) => (f instanceof Blob ? f : new Blob([typeof f === 'string' ? f : JSON.stringify(f)], { type: 'text/plain' }));
  return {
    from(bucket) {
      const key = (path) => `${bucket}/${path}`;
      return {
        async upload(path, file, opts = {}) {
          if (files[key(path)] && !opts.upsert) return { data: null, error: { message: 'The resource already exists' } };
          files[key(path)] = toBlob(file);
          return { data: { path }, error: null };
        },
        async download(path) {
          const f = files[key(path)];
          return f ? { data: f, error: null } : { data: null, error: { message: 'Object not found' } };
        },
        async remove(paths) {
          for (const p of paths) delete files[key(p)];
          return { data: paths.map((name) => ({ name })), error: null };
        },
        async copy(from, to) {
          if (!files[key(from)]) return { data: null, error: { message: 'Object not found' } };
          files[key(to)] = files[key(from)];
          return { data: { path: to }, error: null };
        },
        async list(prefix = '') {
          const pre = key(prefix ? `${prefix.replace(/\/$/, '')}/` : '');
          return {
            data: Object.keys(files).filter((k) => k.startsWith(pre)).map((k) => ({ name: k.slice(pre.length), metadata: { size: files[k].size } })),
            error: null,
          };
        },
        getPublicUrl(path) { return { data: { publicUrl: `memory://${key(path)}` } }; },
      };
    },
  };
}

/**
 * Wrap an app: swaps supabase.from, auth.getUser / getSession, rpc,
 * storage and functions.invoke for the in-memory versions while mounted.
 * @param {{db: object, user?: object,
 *   functions?: Record<string, (body:any, db:object)=>Promise<{data:any,error:any}>>,
 *   rpc?: Record<string, (args:any, db:object)=>Promise<{data:any,error:any}>>}} props
 */
export default function InMemorySupabase({ db, user = DEV_USER, functions = NO_FUNCTIONS, rpc = NO_FUNCTIONS, children }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = null; }
    if (!saved) saved = { from: supabase.from, rpc: supabase.rpc, getUser: supabase.auth.getUser, getSession: supabase.auth.getSession };
    supabase.from = (t) => makeQuery(db, t, user);
    supabase.auth.getUser = async () => ({ data: { user }, error: null });
    supabase.auth.getSession = async () => ({ data: { session: { user, access_token: 'dev' } }, error: null });
    // supabase.functions is a getter that builds a new client on every read,
    // so patching .invoke on it does nothing: shadow the getter instead
    const fake = {
      invoke: async (name, opts = {}) => (functions[name]
        ? functions[name](opts.body || {}, db)
        : { data: null, error: { message: `${name} is not available on the harness` } }),
    };
    Object.defineProperty(supabase, 'functions', { configurable: true, get: () => fake });
    supabase.rpc = async (name, args = {}) => (rpc[name]
      ? rpc[name](args, db)
      : { data: null, error: { message: `${name} is not available on the harness` } });
    const storage = makeStorage(db);
    Object.defineProperty(supabase, 'storage', { configurable: true, get: () => storage });
    setReady(true);
    return () => {
      // Restore on the next tick: under StrictMode the effects are torn down
      // and re-run, and the children's effects re-run BEFORE this one, so an
      // immediate restore would send their reads to the real database.
      restoreTimer = setTimeout(() => {
        restoreTimer = null;
        supabase.from = saved.from;
        supabase.rpc = saved.rpc;
        supabase.auth.getUser = saved.getUser;
        supabase.auth.getSession = saved.getSession;
        delete supabase.functions; // back to the prototype getters
        delete supabase.storage;
        saved = null;
      }, 0);
    };
  }, [db, user, functions, rpc]);
  return ready ? children : null;
}
