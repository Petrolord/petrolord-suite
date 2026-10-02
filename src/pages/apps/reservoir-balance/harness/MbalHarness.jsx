// Dev-only harness (/dev/material-balance-studio, DEV builds only; senior
// test T1, 2026-09-26): Material Balance Studio on an in-memory copy of the
// rb_* tables, seeded with three published cases (sampleCases.js: Ahmed
// Example 11-3, depletion-drive oil; Dake Exercise 9.2, oil with a
// Carter-Tracy aquifer; Pletcher SPE 75354, gas with a pot aquifer), and a
// calculate-mbal stand-in that runs the canonical engine in the browser
// through the edge function's own row mapping (engineStandIn.js).
// Supabase is swapped while mounted and restored on unmount.

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import ReservoirBalance from '../ReservoirBalance';
import { seedSampleStore, SAMPLE_USER } from './sampleCases';
import { runEngineOnStore } from './engineStandIn';

const USER = SAMPLE_USER;
const NOW = () => new Date().toISOString();

let DB = seedSampleStore();
let seq = 0;
const newId = (p) => `${p}-${Date.now()}-${++seq}`;

// a small PostgREST-shaped query builder over DB
function query(table) {
  const st = { filters: [], order: null, limit: null, op: 'select', payload: null, returning: false, onConflict: null, join: false };
  const rows = () => (DB[table] || []);
  const match = (r) => st.filters.every(([k, op, v]) => (op === 'eq' ? r[k] === v : op === 'is' ? (r[k] ?? null) === v : op === 'in' ? v.includes(r[k]) : op === 'gte' ? r[k] >= v : op === 'gt' ? r[k] > v : op === 'lte' ? r[k] <= v : true));
  const run = () => {
    if (st.op === 'insert' || st.op === 'upsert') {
      const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((r) => ({ id: r.id || newId(table), created_at: NOW(), updated_at: NOW(), ...r }));
      for (const r of list) {
        if (st.op === 'upsert' && st.onConflict) {
          const keys = st.onConflict.split(',');
          const i = rows().findIndex((x) => keys.every((k) => x[k] === r[k]));
          if (i >= 0) { DB[table][i] = { ...DB[table][i], ...r, id: DB[table][i].id }; continue; }
        }
        DB[table] = [...rows(), r];
      }
      return list;
    }
    if (st.op === 'update') {
      const out = [];
      DB[table] = rows().map((r) => (match(r) ? (out.push({ ...r, ...st.payload, updated_at: NOW() }), out[out.length - 1]) : r));
      return out;
    }
    if (st.op === 'delete') {
      const gone = rows().filter(match);
      DB[table] = rows().filter((r) => !match(r));
      return gone;
    }
    let out = rows().filter(match);
    if (st.order) {
      const [k, asc] = st.order;
      out = [...out].sort((a, b) => ((a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1)));
    }
    if (st.limit != null) out = out.slice(0, st.limit);
    if (st.join && table === 'rb_runs') out = out.map((r) => ({ ...r, rb_results: (DB.rb_results || []).filter((x) => x.run_id === r.id) }));
    return out;
  };
  const q = {
    select(cols) { if (st.op !== 'select') st.returning = true; if (typeof cols === 'string' && cols.includes('rb_results(')) st.join = true; return q; },
    eq(k, v) { st.filters.push([k, 'eq', v]); return q; },
    is(k, v) { st.filters.push([k, 'is', v]); return q; },
    in(k, v) { st.filters.push([k, 'in', v]); return q; },
    gte(k, v) { st.filters.push([k, 'gte', v]); return q; },
    gt(k, v) { st.filters.push([k, 'gt', v]); return q; },
    lte(k, v) { st.filters.push([k, 'lte', v]); return q; },
    neq() { return q; },
    order(k, o = {}) { st.order = [k, o.ascending !== false]; return q; },
    limit(n) { st.limit = n; return q; },
    insert(p) { st.op = 'insert'; st.payload = p; return q; },
    upsert(p, o = {}) { st.op = 'upsert'; st.payload = p; st.onConflict = o.onConflict || null; return q; },
    update(p) { st.op = 'update'; st.payload = p; return q; },
    delete() { st.op = 'delete'; return q; },
    single() { const r = run(); return Promise.resolve(r.length ? { data: r[0], error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } }); },
    maybeSingle() { const r = run(); return Promise.resolve({ data: r[0] ?? null, error: null }); },
    then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); },
  };
  return q;
}

// calculate-mbal: the engine on DB, through the edge function's mapping
async function calculateMbal(body) {
  return runEngineOnStore(DB, body, { now: NOW });
}

export default function MbalHarness() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // DB is seeded once per page load, so moving between the case list and a
    // case (a remount) keeps the runs made so far
    const saved = { from: supabase.from, getUser: supabase.auth.getUser };
    supabase.from = (t) => query(t);
    // supabase.functions is a getter that builds a new client on every read,
    // so patching .invoke on it does nothing: shadow the getter instead
    const fakeFunctions = {
      invoke: async (name, opts = {}) => (name === 'calculate-mbal'
        ? calculateMbal(opts.body || {})
        : { data: null, error: { message: `${name} is not available on the harness` } }),
    };
    Object.defineProperty(supabase, 'functions', { configurable: true, get: () => fakeFunctions });
    supabase.auth.getUser = async () => ({ data: { user: USER }, error: null });
    setReady(true);
    return () => {
      supabase.from = saved.from;
      delete supabase.functions; // back to the prototype getter
      supabase.auth.getUser = saved.getUser;
    };
  }, []);
  return ready ? <div data-testid="mbal-harness"><ReservoirBalance /></div> : null;
}
