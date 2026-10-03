// Saved Risked Reserves valuations as rrv_valuations rows, for the two ends
// of the Capital Portfolio handoff (U2-009): the Risked Reserves harness
// (?saved=1) saves Ekene North exactly as this builds it, and the Capital
// Portfolio harness reads the same row by the same id, so the e2e walks one
// valuation from one app to the other.

import { fromRcpProspect, toRow, setInput } from './rrvStore';
import { RRV_SEED_PROSPECTS } from './rrvFixtures';

/** The valuation of Ekene North the Risked Reserves harness opens with ?saved=1 (MEFS typed 15). */
export function ekeneNorthValuation() {
  return {
    ...setInput(fromRcpProspect({ id: 'prospect-1', ...RRV_SEED_PROSPECTS[0] }, { now: new Date('2026-10-02T15:00:00Z') }), 'mefs', 15),
    ident: { company: 'Harness Energy', licence: 'OML 143', play: 'Agbada stacked sands', analyst: 'A. Analyst' },
  };
}

/** The body the harness backend saves (it adds the id and the owner). */
export const ekeneNorthRowBody = () => ({ ...toRow(ekeneNorthValuation()), schema_version: 1, updated_at: '2026-10-02T15:01:00.000Z' });

/**
 * A saved row as the database returns it.
 * @param {{id?: string, userId?: string, valuation?: object, updatedAt?: string}} [o]
 */
export function savedValuationRow({ id = 'valuation-1', userId = 'dev-user', valuation = null, updatedAt = '2026-10-02T15:01:00.000Z' } = {}) {
  const body = valuation ? { ...toRow(valuation), schema_version: 1 } : ekeneNorthRowBody();
  return {
    id, user_id: userId, created_at: '2026-10-02T15:01:00.000Z', ...body, updated_at: updatedAt,
    visibility: 'private', organization_id: null, org_access: 'view',
  };
}

/**
 * The colleague's valuation of the prospect they shared (Ada Deep): it
 * carried a mean only, so they typed the percentiles. The Risked Reserves
 * harness seeds it with ?shared=1 as valuation-shared.
 */
export function colleagueValuationBody() {
  const p = fromRcpProspect({
    id: 'prospect-shared', name: 'Ada Deep (shared)', pg_factors: { trap: 0.6, reservoir: 0.5, charge: 0.8, seal: 0.7 },
    inputs: { mean: 60, unit: 'MMbbl', basis: 'recoverable' }, risked: { pg: 0.168, risked_mean: 10.08 }, updated_at: '2026-10-01T09:00:00.000Z',
  }, { now: new Date('2026-10-01T10:00:00Z') });
  return toRow({ ...p, p90: 25, p50: 52, p10: 110, touched: { p90: true, p50: true, p10: true }, ident: { company: 'Harness Energy', licence: 'OML 99', play: 'Agbada', analyst: 'Ada Colleague' } });
}

/** That valuation as the database returns it to a member of the organisation. */
export function colleagueSharedRow({ id = 'valuation-shared', colleagueId = 'user-colleague' } = {}) {
  return {
    id, user_id: colleagueId, created_at: '2026-10-01T10:05:00.000Z', updated_at: '2026-10-01T10:05:00.000Z', schema_version: 1,
    ...colleagueValuationBody(),
    visibility: 'organization', organization_id: 'org-harness', org_access: 'view', updated_by: colleagueId,
  };
}
