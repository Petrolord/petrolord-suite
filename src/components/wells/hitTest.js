// Pointer hit tests for the track canvas (PT0, 2026-09-03). Pure, so the
// precedence rule that keeps zone-edge dragging and top dragging apart is
// unit-tested: a top is only hit inside its name tag at the RIGHT edge of
// the plot, a zone edge anywhere across the plot. The harness seeds a top
// exactly on a zone base (Top Shale / SAND A at 2030 m), so mid-plot drags
// must keep reaching the zone edge.

/** Zone edge within `tol` px of y: { zone, edge: 'top'|'base' } or null. */
export function hitZoneEdgeAt(y, zones, yOf, tol = 5) {
  for (const z of zones || []) {
    if (Math.abs(yOf(z.top_md_m) - y) <= tol) return { zone: z, edge: 'top' };
    if (Math.abs(yOf(z.base_md_m) - y) <= tol) return { zone: z, edge: 'base' };
  }
  return null;
}

/**
 * Nearest visible top whose line is within `tol` px of y, but only when x
 * lies in the tag zone (x >= tagLeft). Returns the top row or null.
 */
export function hitTopAt({ x, y }, tops, yOf, { tagLeft, tol = 5 } = {}) {
  if (!(x >= tagLeft)) return null;
  let best = null;
  let bestD = Infinity;
  for (const t of tops || []) {
    if (t.hidden) continue;
    const d = Math.abs(yOf(t.md_m) - y);
    if (d <= tol && d < bestD) { best = t; bestD = d; }
  }
  return best;
}

/**
 * What a pointer press on the plot grabs, in one place so the precedence
 * is unit-tested rather than re-derived per viewer (PT8, 2026-09-05).
 *
 * Order matters and encodes the rule a top sitting exactly on a zone edge
 * needs. The name tag at the right edge is the top's dedicated handle, so
 * it wins outright; mid-plot a zone edge wins, because a zone edge can
 * only ever be grabbed mid-plot while the top still has its tag; and
 * anywhere else along its line the top is grabbable, which is what makes
 * a top movable on the track at all rather than only in that tag.
 *
 * @returns {{kind: 'top', top} | {kind: 'zone-edge', zone, edge} | null}
 */
export function hitTrackDragAt({ x, y }, { zones = [], tops = [], yOf, tagLeft, tol = 5 } = {}) {
  const tagged = hitTopAt({ x, y }, tops, yOf, { tagLeft, tol });
  if (tagged) return { kind: 'top', top: tagged };
  const edge = hitZoneEdgeAt(y, zones, yOf, tol);
  if (edge) return { kind: 'zone-edge', ...edge };
  // -Infinity: past the tag and the zone edges, the whole line is a handle
  const onLine = hitTopAt({ x, y }, tops, yOf, { tagLeft: -Infinity, tol });
  return onLine ? { kind: 'top', top: onLine } : null;
}
