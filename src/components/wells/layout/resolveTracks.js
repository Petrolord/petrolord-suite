// Template -> TrackViewer tracks (Petrophysics Studio PS4). Pure:
// resolves curve ADDRESSES against what the well actually has, drops
// curves whose source is absent and tracks with nothing left to draw
// (the missing-curve tolerance that keeps one template usable across
// wells), rebinds fill references to kept-curve indexes, and turns
// parameter-bound thresholds into live values.

/** Resolve one curve address against the workspace. */
function resolveSource(source, { curves, outputs, logs }) {
  if (typeof source !== 'string') return null;
  const i = source.indexOf(':');
  if (i < 0) return null;
  const kind = source.slice(0, i);
  const key = source.slice(i + 1);
  if (kind === 'input') return curves?.[key] || null;
  if (kind === 'output') return outputs?.[key] || null;
  // raw registry curve by exact mnemonic (owner finding 2026-09-03: any
  // service-company mnemonic must be displayable, and several of them
  // can share one track); ':n' duplicate suffixes are part of the key
  if (kind === 'log') return logs?.[key] || logs?.[key.toUpperCase()] || null;
  return null;
}

/** Address for a raw registry curve. */
export const logSource = (mnemonic) => `log:${mnemonic}`;
/** Display label for any address. */
export const sourceLabel = (source) => (typeof source === 'string' ? source.slice(source.indexOf(':') + 1) : '');

/**
 * @param {Object} template a layoutSchema template
 * @param {Object} ctx {curves, outputs, logs, faciesData, facies, params}
 *   logs: raw registry curves keyed by mnemonic (for `log:` addresses)
 * @returns {Array} the TrackViewer `tracks` prop
 */
export function resolveTracks(template, ctx) {
  const out = [];
  for (const track of template.tracks || []) {
    if (track.type === 'strip') {
      if (track.source === 'facies' && ctx.faciesData && ctx.facies?.length) {
        out.push({
          key: track.id,
          title: track.title,
          type: 'strip',
          width: track.width || 0.5,
          colors: ctx.facies.map((f) => f.color),
          labels: ctx.facies.map((f) => f.name),
          curves: [{ name: 'facies', data: ctx.faciesData }],
        });
      }
      continue;
    }

    const kept = [];
    const indexBySource = new Map();
    for (const c of track.curves || []) {
      const data = resolveSource(c.source, ctx);
      if (!data) continue;
      indexBySource.set(c.source, kept.length);
      kept.push({
        name: c.label || sourceLabel(c.source),
        data,
        color: c.color,
        min: c.min,
        max: c.max,
        scale: c.scale,
        style: c.style,
        lineWidth: c.lineWidth,
        fillTo: c.fillTo,
      });
    }
    if (!kept.length) continue;

    const fills = [];
    for (const f of track.fills || []) {
      if (f.mode === 'crossover') {
        const a = indexBySource.get(f.a);
        const b = indexBySource.get(f.b);
        if (a == null || b == null) continue;
        fills.push({ mode: 'crossover', a, b, positiveColor: f.positiveColor, negativeColor: f.negativeColor, opacity: f.opacity });
      } else if (f.mode === 'threshold') {
        const a = indexBySource.get(f.a);
        if (a == null) continue;
        const value = f.threshold?.param != null ? ctx.params?.[f.threshold.param] : f.threshold?.value;
        if (!Number.isFinite(value)) continue;
        // color2 (PT6): the other side of the threshold, absent = unfilled
        fills.push({ mode: 'threshold', a, value, side: f.side || 'above', color: f.color, color2: f.color2 || undefined, opacity: f.opacity });
      } else if (f.mode === 'ramp') {
        // PT6: colour by the curve's own value between >= 2 distinct stops
        const a = indexBySource.get(f.a);
        if (a == null) continue;
        const stops = (f.stops || []).filter((st) => Number.isFinite(Number(st.value)) && st.color)
          .map((st) => ({ value: Number(st.value), color: st.color })).sort((p, q) => p.value - q.value);
        if (stops.length < 2 || !(stops[stops.length - 1].value > stops[0].value)) continue;
        fills.push({ mode: 'ramp', a, fillTo: f.fillTo || 'left', stops, opacity: f.opacity ?? 0.85 });
      }
    }

    out.push({
      key: track.id,
      title: track.title,
      scale: track.scale,
      min: track.min,
      max: track.max,
      width: track.width || 1,
      curves: kept,
      fills,
    });
  }
  return out;
}
