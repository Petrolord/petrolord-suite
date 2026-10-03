/**
 * The top pressure of the Fluid Systems Studio PVT table (FLUID-U2-026).
 *
 * By default the table runs to max(1.4 Pb, Pb + 2,000 psi). A deeply
 * undersaturated reservoir needs more: the top can be set in the app
 * ("Highest table pressure"), or asked for by a consuming app that opens
 * Fluid Systems Studio with
 *   ?fluidProject=<id>&pvtPMax=<psia>&pvtFor=<app name>
 * The request is applied to the opened project, the user saves it, and the
 * pvt-1 block then carries `pressure_range` (min, max, requested max, its
 * source and who asked) for the consumer to check before it takes the table.
 * A set top only ever extends the table; it never shortens the default.
 *
 * Pure.
 */
export const PVT_RANGE_PARAM = 'pvtPMax';
export const PVT_RANGE_FOR_PARAM = 'pvtFor';
/** The largest top the app takes (psia): beyond the reach of any correlation it holds. */
export const PVT_RANGE_LIMIT = 30000;

const valid = (v) => Number.isFinite(v) && v > 0 && v <= PVT_RANGE_LIMIT;

/** The stored range of a project, every key present. */
export function tableRangeOf(inputs) {
  const t = inputs?.tableRange;
  const pMax = t && valid(Number(t.pMax)) ? Number(t.pMax) : null;
  return {
    pMax,
    from: pMax == null ? 'default' : (t.from === 'consumer' ? 'consumer' : 'entered'),
    requestedBy: pMax != null && t.from === 'consumer' && t.requestedBy ? String(t.requestedBy) : null,
  };
}

/** A consumer's request read from the address of the page, or null. */
export function rangeRequestFromSearch(search) {
  const q = new URLSearchParams(String(search || ''));
  const raw = q.get(PVT_RANGE_PARAM);
  if (raw == null || raw.trim() === '') return null;
  const v = Number(raw);
  if (!valid(v)) return null;
  return { pMax: v, from: 'consumer', requestedBy: q.get(PVT_RANGE_FOR_PARAM) || null };
}

/** The address a consumer opens to ask for a longer table of a saved project. */
export function rangeRequestUrl(base, projectId, pMax, requestedBy = '') {
  const q = new URLSearchParams();
  if (projectId) q.set('fluidProject', projectId);
  q.set(PVT_RANGE_PARAM, String(Math.ceil(pMax)));
  if (requestedBy) q.set(PVT_RANGE_FOR_PARAM, requestedBy);
  return `${base}?${q.toString()}`;
}

/** The range as the pvt-1 block carries it. */
export function pressureRangeBlock(inputs, rows) {
  const r = tableRangeOf(inputs);
  const p = (rows || []).map((x) => x.pressure).filter(Number.isFinite);
  return {
    min_psia: p.length ? Math.min(...p) : null,
    max_psia: p.length ? Math.max(...p) : null,
    requested_max_psia: r.pMax,
    source: r.from,
    ...(r.requestedBy ? { requested_by: r.requestedBy } : {}),
  };
}
