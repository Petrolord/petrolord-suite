// Saved Contour Map Digitizer projects (contour_projects rows), MAP-U1-006.

/**
 * A saved contour_projects row into editor state (MAP-U1-006). Older rows
 * stored the lines as a bare array or without the faults layer, with
 * values as typed strings; the settings now ride inside the same jsonb.
 */
export function layersFromSaved(saved) {
  const src = saved || {};
  const raw = Array.isArray(src) ? { contours: src } : src;
  const fix = (lines) => (Array.isArray(lines) ? lines : []).map((l) => ({
    ...l,
    points: Array.isArray(l.points) ? l.points : [],
    value: l.value === '' || l.value === null || l.value === undefined || !Number.isFinite(Number(l.value)) ? null : Number(l.value),
  }));
  return { layers: { contours: fix(raw.contours), faults: fix(raw.faults) }, settings: raw.settings || {} };
}
