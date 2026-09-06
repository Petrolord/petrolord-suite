// Show records (WS4): an observation of subtype 'show' on a sample (or a
// depth), the controlled values in the payload, the quality derived by
// the engine at render, never stored.
import { validateShow, showSummary, showAbbrev, emptyShow, SHOW_TABLES, DISTRIBUTION_PERCENT, SHOW_QUALITIES } from '@/lib/wellsite/shows';

export { validateShow, showSummary, showAbbrev, emptyShow, SHOW_TABLES, DISTRIBUTION_PERCENT, SHOW_QUALITIES };
export const SHOW_SUBTYPE = 'show';

export function showParams({ show, sampleId = null, depthEntry = null }) {
  const errors = validateShow(show);
  if (errors.length) throw new Error(errors[0]);
  const p = { kind: 'observation', subtype: SHOW_SUBTYPE, sampleId, payload: { ...show } };
  if (depthEntry && Number.isFinite(depthEntry.value)) p.depth = { ...depthEntry, kind: 'lagged_sample' };
  return p;
}
