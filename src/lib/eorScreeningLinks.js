// "Send to EOR Screening" (EOR-U2-002): Fluid Systems Studio, Well Test
// Analysis Studio and Material Balance Studio open EOR Screening with their
// saved record named BY ID in the address. EOR reads the record from the
// database (pvt-1, wta-1, mbal-1; src/utils/eor/intakes.js), so nothing is
// carried in router state and a refresh reads the same record again. No id
// (an unsaved workspace) means no link: the sender says to save first.
import { PVT_PROJECT_PARAM } from '@/lib/pvtSource';
import { WTA_PROJECT_PARAM } from '@/lib/wellTestSource';

/** The production route and the /dev harness route of EOR Screening. */
export const EOR_SCREENING_ROUTES = Object.freeze(['/dashboard/apps/reservoir/eor-screening', '/dev/studio/eor']);
/** Material Balance names its case with ?mbalCase= (ReservoirCalc Pro reads the same). */
export const MBAL_CASE_PARAM = 'mbalCase';
/** The address parameter of each source, as the EOR intake panel reads it. */
export const EOR_SOURCE_PARAMS = Object.freeze({ pvt: PVT_PROJECT_PARAM, wta: WTA_PROJECT_PARAM, mbal: MBAL_CASE_PARAM });

/**
 * @param {'pvt'|'wta'|'mbal'} kind
 * @param {?string} id the saved record id
 * @param {{inHarness?: boolean}} [o] true when sent from a /dev harness page
 * @returns {?string} the address, or null when there is no saved record
 */
export function eorScreeningHref(kind, id, { inHarness = false } = {}) {
  const param = EOR_SOURCE_PARAMS[kind];
  if (!param || id == null || String(id) === '') return null;
  return `${EOR_SCREENING_ROUTES[inHarness ? 1 : 0]}?${param}=${encodeURIComponent(id)}`;
}
