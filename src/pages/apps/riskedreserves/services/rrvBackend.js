// Where Risked Reserves Valuation reads prospects and keeps valuations
// (upgrade U1, 2026-10-02). Two backends with one interface: the registry
// one over Supabase, and an in-memory twin for the /dev harness and jest
// (the house harness pattern).
//
// Valuations are saved one row per prospect and user in rrv_valuations
// (migration 20261002151500_rrv_valuations.sql, under the organisation
// sharing rules of 20261002100000). THE APP MUST WORK BEFORE THAT MIGRATION
// IS APPLIED: `capability()` asks the database whether the table is there,
// and while it is not the workstation keeps valuations in the browser and
// says so. Once it is, the first Save moves them across.

import { supabase } from '@/lib/customSupabaseClient';
import { openStateRow, stampState } from '@/lib/stateVersion';
import { supabaseSharingStore, makeHarnessSharing, colleagueShared } from '@/lib/recordSharing';
import { resolveUserOrgId } from '@/lib/orgContext';
import { makeRegistryProspectsBackend, makeInMemoryProspectsBackend } from '../../ReservoirCalcPro/services/prospectsService';
import { RRV_KIND, toRow, fromRcpProspect } from './rrvStore';
import { buildEpeUnitValue } from '@/pages/apps/epe/epeUnitValue';
import { listEpeUnitValues, getEpeUnitValue } from '@/pages/apps/epe/epeUnitValueService';
import { buildLabel } from '@/lib/platformBuild';

export const RRV_TABLE = 'rrv_valuations';

/** Raised when the table is not on this database yet. */
export class RrvTableUnavailable extends Error {
  constructor() {
    super('Saving valuations to your account is not switched on for this database yet (the rrv_valuations table has not been created). They are kept in this browser until it is.');
    this.name = 'RrvTableUnavailable';
  }
}

const isMissingTable = (error) => !!error && (['42P01', 'PGRST205'].includes(String(error.code))
  || /relation .* does not exist|Could not find the table/i.test(String(error.message || '')));

export function makeRegistryRrvBackend({ prospects = makeRegistryProspectsBackend() } = {}) {
  let cap = null; // { table, at }
  const sharing = supabaseSharingStore();

  /** Is rrv_valuations on this database? A "not yet" is asked again after a minute. */
  async function capability() {
    if (cap && (cap.table || Date.now() - cap.at < 60000)) return { table: cap.table };
    const { error } = await supabase.from(RRV_TABLE).select('id').limit(1);
    // a refusal that is not "no such table" (network, sign-in) is not proof
    // the table is absent: answer no for now and ask again
    cap = { table: !error, at: Date.now() };
    return { table: cap.table };
  }
  async function me() {
    const { data: { user } } = await supabase.auth.getUser();
    return user || null;
  }
  const gate = (error, what) => {
    if (isMissingTable(error)) { cap = { table: false, at: Date.now() }; throw new RrvTableUnavailable(); }
    throw new Error(`${what}: ${error.message}`);
  };

  return {
    listProspects: () => prospects.listProspects(),
    listSharedProspects: () => (prospects.listSharedProspects ? prospects.listSharedProspects() : Promise.resolve([])),
    capability,
    async listValuations() {
      const user = await me();
      if (!user) return [];
      const { data, error } = await supabase.from(RRV_TABLE).select('*').eq('user_id', user.id).order('created_at', { ascending: true });
      if (error) gate(error, 'Could not load your saved valuations');
      return (data || []).map((r) => openStateRow(RRV_KIND, r));
    },
    async listSharedValuations() {
      const user = await me();
      if (!user) return [];
      const { data, error } = await supabase.from(RRV_TABLE).select('*').neq('user_id', user.id).order('updated_at', { ascending: false });
      if (error) gate(error, 'Could not load shared valuations');
      return (data || []).map((r) => openStateRow(RRV_KIND, r));
    },
    /** Insert, or update the row the valuation was opened from. Returns the saved row. */
    async saveValuation(p) {
      const user = await me();
      if (!user) throw new Error('You must be signed in to save valuations to your account.');
      const body = stampState(RRV_KIND, toRow(p));
      if (p.row?.id) {
        sharing.trackOpened(RRV_TABLE, p.row);
        const { data, error } = await sharing.update(RRV_TABLE, p.row.id, body, { note: 'Valuation saved' });
        if (error) {
          if (error.name === 'RecordConflict') throw error;
          gate(error, 'Could not save the valuation');
        }
        return data;
      }
      const { data, error } = await supabase.from(RRV_TABLE).insert({ user_id: user.id, ...body }).select().single();
      if (error) {
        if (String(error.code) === '23505') throw new Error(`${p.name} already has a saved valuation on your account (saved from another tab or device). Reload the page to open it.`);
        gate(error, 'Could not save the valuation');
      }
      return data;
    },
    async deleteValuation(p) {
      if (!p.row?.id) return;
      const { data, error } = await supabase.from(RRV_TABLE).delete().eq('id', p.row.id).select('id');
      if (error) gate(error, 'Could not delete the valuation');
      if (!data || !data.length) throw new Error('Only the owner can delete a valuation.');
    },
    // U2-001: Petroleum Economics Studio runs as `epe-unit-value-1` contracts
    // (the sender lives with that app: epe/epeUnitValue.js)
    listEpeCases: () => listEpeUnitValues(supabase, { build: buildLabel() }),
    getEpeCase: (runId) => getEpeUnitValue(supabase, runId, { build: buildLabel() }),
    /** The signed-in user's organisation name, for the report's Company line (editable there). */
    async organisationName() {
      try {
        const user = await me();
        const orgId = user ? await resolveUserOrgId(user.id) : null;
        if (!orgId) return null;
        const { data } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
        return data?.name || null;
      } catch { return null; }
    },
    sharing,
  };
}

/**
 * The in-memory twin. `table: false` behaves as the database before the
 * migration (the workstation falls back to the browser); `setTable(true)`
 * is the owner applying it.
 * @param {Array} seed ReservoirCalc Pro prospect rows
 * @param {{table?: boolean, valuations?: Array, sharedValuations?: boolean, organisation?: ?string,
 *   sharing?: object, sharedRows?: boolean}} [o]
 */
export function makeInMemoryRrvBackend(seed = [], { table = true, valuations = [], sharedValuations = false, organisation = 'Harness Energy', sharing = makeHarnessSharing(), sharedRows = false, epeRuns = [] } = {}) {
  // Petroleum Economics Studio runs as that app saves them: [{run, caseName, kpis, config, resultsAt}]
  let epe = epeRuns.map((r) => ({ ...r }));
  const epeSend = (r) => ({
    runId: r.run.id, runName: r.run.run_name ?? null, caseName: r.caseName ?? null, runSavedAt: r.run.created_at ?? null,
    ...buildEpeUnitValue({ run: r.run, caseName: r.caseName, kpis: r.kpis, config: r.config, resultsAt: r.resultsAt, build: 'harness' }),
  });
  const prospects = makeInMemoryProspectsBackend(seed, { sharing, sharedRows });
  const T = RRV_TABLE;
  const ME = sharing.me;
  let has = table;
  if (valuations.length) sharing.db.seed(T, valuations.map((r, i) => ({ id: `valuation-${i + 1}`, ...r })), { owner: ME });
  if (sharedValuations) {
    // the colleague valued the prospect they shared (the row the prospects
    // backend seeds with `sharedRows`): it carried a mean only, so they
    // typed the percentiles
    const p = fromRcpProspect({
      id: 'prospect-shared', name: 'Ada Deep (shared)', pg_factors: { trap: 0.6, reservoir: 0.5, charge: 0.8, seal: 0.7 },
      inputs: { mean: 60, unit: 'MMbbl', basis: 'recoverable' }, risked: { pg: 0.168, risked_mean: 10.08 }, updated_at: '2026-10-01T09:00:00.000Z',
    }, { now: new Date('2026-10-01T10:00:00Z') });
    sharing.db.seed(T, [colleagueShared({
      id: 'valuation-shared', updated_at: '2026-10-01T10:05:00.000Z', schema_version: 1,
      ...toRow({ ...p, p90: 25, p50: 52, p10: 110, touched: { p90: true, p50: true, p10: true }, ident: { company: 'Harness Energy', licence: 'OML 99', play: 'Agbada', analyst: 'Ada Colleague' } }),
    })]);
  }
  let seq = valuations.length;
  // the order the rows were created in (the database orders by created_at)
  const order = valuations.map((_, i) => `valuation-${i + 1}`);
  const inOrder = (rows) => [...rows].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const need = () => { if (!has) throw new RrvTableUnavailable(); };
  return {
    listProspects: () => prospects.listProspects(),
    listSharedProspects: () => prospects.listSharedProspects(),
    saveProspect: (p) => prospects.saveProspect(p),
    deleteProspect: (p) => prospects.deleteProspect(p),
    async capability() { return { table: has }; },
    async listValuations() { need(); return inOrder((sharing.db.select(T, ME).data || []).filter((r) => r.user_id === ME)).map((r) => openStateRow(RRV_KIND, r)); },
    async listSharedValuations() { need(); return (sharing.db.select(T, ME).data || []).filter((r) => r.user_id !== ME).map((r) => openStateRow(RRV_KIND, r)); },
    async saveValuation(p) {
      need();
      const body = stampState(RRV_KIND, toRow(p));
      if (p.row?.id) {
        sharing.store.trackOpened(T, p.row);
        const { data, error } = await sharing.store.update(T, p.row.id, body, { note: 'Valuation saved' });
        if (error) throw (error.name === 'RecordConflict' ? error : new Error(`Could not save the valuation: ${error.message}`));
        return data;
      }
      if ((sharing.db.select(T, ME).data || []).some((r) => r.user_id === ME && r.prospect_key === body.prospect_key)) {
        throw new Error(`${p.name} already has a saved valuation on your account (saved from another tab or device). Reload the page to open it.`);
      }
      seq += 1;
      const { data, error } = sharing.db.insert(T, ME, { id: `valuation-${seq}`, user_id: ME, ...body });
      if (error) throw new Error(`Could not save the valuation: ${error.message}`);
      order.push(data.id);
      return data;
    },
    async deleteValuation(p) {
      need();
      if (!p.row?.id) return;
      const { data } = sharing.db.remove(T, ME, p.row.id);
      if (!data || !data.length) throw new Error('Only the owner can delete a valuation.');
    },
    async organisationName() { return organisation; },
    async listEpeCases() { return epe.map(epeSend); },
    async getEpeCase(runId) { const r = epe.find((x) => x.run.id === runId); return r ? epeSend(r) : null; },
    /** test seams: Petroleum Economics Studio re-runs or deletes a run */
    _setEpeRun(runId, change) { epe = epe.map((r) => (r.run.id === runId ? change(r) : r)); },
    _removeEpeRun(runId) { epe = epe.filter((r) => r.run.id !== runId); },
    sharing: sharing.store,
    /** test seams */
    _sharing: sharing,
    setTable(v) { has = !!v; },
    _rows: () => sharing.db.select(T, ME).data || [],
  };
}
