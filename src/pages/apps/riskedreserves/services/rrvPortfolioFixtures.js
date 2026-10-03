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

/** A colleague's valuation of Ekene Deep, shared with the organisation for viewing. */
export function colleagueSharedRow({ id = 'valuation-colleague', colleagueId = 'user-colleague' } = {}) {
  const p = {
    ...fromRcpProspect({ id: 'prospect-2', ...RRV_SEED_PROSPECTS[1] }, { now: new Date('2026-10-02T16:00:00Z') }),
    ident: { company: 'Harness Energy', licence: 'OML 143', play: 'Agbada', analyst: 'Ada Colleague' },
  };
  return {
    ...savedValuationRow({ id, userId: colleagueId, valuation: setInput(p, 'wellCost', 40), updatedAt: '2026-10-02T16:05:00.000Z' }),
    visibility: 'organization', organization_id: 'org-harness', updated_by: colleagueId,
  };
}
