// Template -> TrackViewer tracks (Petrophysics Studio PS4). Pure:
// resolves curve ADDRESSES against what the well actually has, drops
// curves whose source is absent and tracks with nothing left to draw
// (the missing-curve tolerance that keeps one template usable across
// wells), rebinds fill references to kept-curve indexes, and turns
// parameter-bound thresholds into live values.

/** Resolve one curve address against the workspace. */
function resolveSource(source, { curves, outputs }) {
  if (typeof source !== 'string') return null;
  const [kind, key] = source.split(':');
  if (kind === 'input') return curves?.[key] || null;
  if (kind === 'output') return outputs?.[key] || null;
  return null;
}

/**
 * @param {Object} template a layoutSchema template
 * @param {Object} ctx {curves, outputs, faciesData, facies, params}
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
        name: c.label || c.source.split(':')[1],
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
        fills.push({ mode: 'threshold', a, value, side: f.side || 'above', color: f.color, opacity: f.opacity });
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
