/**
 * View-layer helpers for SimulationEngine results.
 *
 * Layer series only exist from each layer's deposition onward, so they
 * are SHORTER than data.timeSteps — indexing them by global timestep
 * index (the pre-G7 plots did) shifts younger layers' curves to older
 * ages. Always align by each entry's own age.
 */

// Categorical palette legible on the white chartTheme background.
export const SERIES_COLORS = ['#2563eb', '#d97706', '#059669', '#db2777', '#7c3aed', '#0891b2', '#65a30d', '#dc2626'];

export const seriesColor = (idx) => SERIES_COLORS[idx % SERIES_COLORS.length];

/**
 * Geological time axis (Basin T1-001): a NUMBER axis from the oldest age on
 * the left to the present on the right, the PetroMod and Petrel reading.
 * The plots used a category axis over the (uneven) sample ages with
 * `reversed`, which put the present on the left and spaced time unevenly.
 */
export function ageTicks(maxAge) {
    if (!(maxAge > 0)) return [0];
    const raw = maxAge / 8;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) || 10 * mag;
    const ticks = [];
    for (let t = 0; t <= maxAge + 1e-9; t += step) ticks.push(Number(t.toFixed(6)));
    return ticks;
}

export function ageAxisProps(maxAge) {
    return {
        dataKey: 'age',
        type: 'number',
        domain: [0, maxAge > 0 ? maxAge : 'dataMax'],
        reversed: true,
        ticks: ageTicks(maxAge),
        allowDataOverflow: true,
    };
}

export const maxAgeOf = (results) => {
    const ts = results?.data?.timeSteps || [];
    return ts.length ? Math.max(...ts) : 0;
};

/**
 * Depth-versus-age lines where a per-layer quantity (maturity or
 * temperature) crosses a threshold (Basin T1-E1: maturity isolines and
 * isotherms on the burial history). At each age the layers present give
 * (mid depth, value) pairs; the crossing depth is linearly interpolated
 * between neighbours, shallow to deep. Ages where the column never reaches
 * the threshold carry no point.
 * @returns {Array<{age:number, depth:number}>}
 */
export function isoline(results, field, threshold) {
    const { data, meta } = results || {};
    if (!data?.timeSteps?.length || !data[field]) return [];
    const out = [];
    const burialByAge = meta.layers.map((_, li) => new Map((data.burial[li] || []).map((e) => [e.age, e])));
    const valByAge = meta.layers.map((_, li) => new Map((data[field][li] || []).map((e) => [e.age, e])));
    for (const age of data.timeSteps) {
        const pts = [];
        let base = 0;
        meta.layers.forEach((_, li) => {
            const b = burialByAge[li].get(age); const v = valByAge[li].get(age);
            if (b) base = Math.max(base, b.bottom);
            if (b && v && Number.isFinite(v.value)) pts.push({ depth: (b.top + b.bottom) / 2, value: v.value });
        });
        pts.sort((a, b) => a.depth - b.depth);
        // extend the profile linearly to the surface and to the base of the
        // column, so a crossing above the shallowest (or below the deepest)
        // layer mid-depth is not lost
        if (pts.length >= 2) {
            const [p0, p1] = pts; const [q1, q0] = pts.slice(-2);
            const g0 = (p1.value - p0.value) / (p1.depth - p0.depth || 1);
            const g1 = (q0.value - q1.value) / (q0.depth - q1.depth || 1);
            pts.unshift({ depth: 0, value: p0.value - g0 * p0.depth });
            if (base > q0.depth) pts.push({ depth: base, value: q0.value + g1 * (base - q0.depth) });
        }
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1]; const c = pts[i];
            if ((a.value - threshold) * (c.value - threshold) <= 0 && a.value !== c.value) {
                const t = (threshold - a.value) / (c.value - a.value);
                out.push({ age, depth: a.depth + t * (c.depth - a.depth) });
                break;
            }
        }
    }
    return out;
}

/** Maturity windows on %Ro (Tissot and Welte; Peters and Cassa). */
export const MATURITY_WINDOWS = Object.freeze([
    { key: 'oil', label: 'Oil window', from: 0.55, to: 1.3, fill: '#22c55e' },
    { key: 'wetgas', label: 'Wet gas', from: 1.3, to: 2.0, fill: '#f59e0b' },
    { key: 'drygas', label: 'Dry gas', from: 2.0, to: 4.0, fill: '#ef4444' },
]);


/**
 * Build recharts rows [{age, [layerName]: value}] from per-layer
 * series arrays of {age, ...} entries.
 * @param {Array<number>} timeSteps - master age list
 * @param {Array<Array>} perLayerSeries - data.<field> arrays
 * @param {Array} layers - meta.layers (same order as perLayerSeries)
 * @param {Function} pick - entry => plotted value (default e.value)
 */
export function alignSeriesByAge(timeSteps, perLayerSeries, layers, pick = (e) => e.value) {
    const maps = layers.map((_, li) => new Map((perLayerSeries[li] || []).map(e => [e.age, e])));
    return timeSteps.map(age => {
        const point = { age };
        layers.forEach((layer, li) => {
            const e = maps[li].get(age);
            if (e !== undefined) point[layer.name] = pick(e);
        });
        return point;
    });
}

/**
 * Final-state depth profile: one point per layer at the last time step,
 * ordered by depth. Used by calibration (modeled vs measured).
 */
export function finalDepthProfile(results) {
    if (!results?.data || !results?.meta) return [];
    const { data, meta } = results;
    const rows = meta.layers.map((layer, li) => {
        const t = data.temperature[li];
        const m = data.maturity[li];
        const b = data.burial[li];
        if (!t?.length || !m?.length || !b?.length) return null;
        const last = t.length - 1;
        return {
            name: layer.name,
            depth: t[last].depth,
            top: b[last].top,
            bottom: b[last].bottom,
            temp: t[last].value,
            ro: m[last].value,
        };
    }).filter(Boolean);
    return rows.sort((a, b) => a.depth - b.depth);
}

/**
 * Petroleum-system events chart rows (Magoon and Dow; Basin T1-003): the
 * deposition of the source, reservoir, seal and overburden rocks, and the
 * generation and expulsion windows of the source layers, with the critical
 * moment at the peak expulsion rate (peak generation when nothing is
 * expelled). Roles come from the layers: a source flag; sandstone or
 * limestone for a reservoir; a non-source shale or salt directly above a
 * reservoir for a seal; everything younger than the oldest source for the
 * overburden. Intervals are [older, younger] in Ma.
 */
export function eventsChartRows(results) {
    const { data, meta } = results || {};
    if (!meta?.layers?.length) return { rows: [], criticalMoment: null };
    const layers = meta.layers; // oldest first
    const iv = (l) => [Number(l.ageStart), Number(l.ageEnd)];
    const isSource = (l) => !!l.sourceRock?.isSource;
    const isRes = (l) => !isSource(l) && (l.lithology === 'sandstone' || l.lithology === 'limestone');
    const sources = layers.filter(isSource);
    const reservoirs = layers.filter(isRes);
    const seals = layers.filter((l, i) => i > 0 && !isSource(l) && (l.lithology === 'shale' || l.lithology === 'salt') && isRes(layers[i - 1]));
    const oldestSource = sources.length ? Math.max(...sources.map((l) => Number(l.ageStart))) : null;
    const overburden = oldestSource == null ? [] : layers.filter((l) => Number(l.ageStart) < oldestSource && !isSource(l));

    const windowOf = (series, frac = 0.01) => {
        if (!series || series.length < 2) return null;
        const rates = [];
        for (let i = 1; i < series.length; i++) rates.push({ age: series[i].age, rate: series[i].value - series[i - 1].value });
        const max = Math.max(...rates.map((r) => r.rate));
        if (!(max > 0)) return null;
        const act = rates.filter((r) => r.rate > frac * max);
        const peak = act.reduce((p, c) => (c.rate > p.rate ? c : p));
        const ages = act.map((r) => r.age);
        return { interval: [Math.max(...ages), Math.min(...ages)], peak: peak.age };
    };
    const gen = []; const exp = []; let critical = null;
    layers.forEach((l, li) => {
        if (!isSource(l)) return;
        const g = windowOf(data?.generation?.[li]);
        const e = windowOf(data?.expulsion?.[li]);
        if (g) gen.push({ interval: g.interval, layer: l.name, peak: g.peak });
        if (e) exp.push({ interval: e.interval, layer: l.name, peak: e.peak });
        const cm = e ? e.peak : g ? g.peak : null;
        if (cm != null && (critical == null || cm > critical)) critical = cm;
    });
    const rows = [
        { key: 'source', label: 'Source rock', color: '#7c2d12', intervals: sources.map((l) => ({ interval: iv(l), layer: l.name })) },
        { key: 'reservoir', label: 'Reservoir rock', color: '#f59e0b', intervals: reservoirs.map((l) => ({ interval: iv(l), layer: l.name })) },
        { key: 'seal', label: 'Seal rock', color: '#475569', intervals: seals.map((l) => ({ interval: iv(l), layer: l.name })) },
        { key: 'overburden', label: 'Overburden rock', color: '#a3a3a3', intervals: overburden.map((l) => ({ interval: iv(l), layer: l.name })) },
        { key: 'generation', label: 'Generation', color: '#059669', intervals: gen },
        { key: 'expulsion', label: 'Expulsion', color: '#2563eb', intervals: exp },
    ];
    return { rows, criticalMoment: critical };
}

/**
 * The engine's meta.layers carry id, name, lithology and colour only. The
 * events chart and the source-layer plots also need the deposition ages
 * and the source flag: take them from the model's stratigraphy by id (or
 * name), else from the series (a layer that generated is a source; its
 * burial series starts at deposition).
 */
export function withLayerRoles(results, stratigraphy = []) {
    const { data, meta } = results || {};
    if (!meta?.layers) return results;
    const find = (l) => stratigraphy.find((s) => (l.id && s.id === l.id) || s.name === l.name) || {};
    const firstAge = (li) => {
        const b = data?.burial?.[li];
        return b && b.length ? Math.max(...b.map((e) => e.age)) : null;
    };
    const layers = meta.layers.map((l, li) => {
        const s = find(l);
        const nextStart = li + 1 < meta.layers.length ? firstAge(li + 1) : 0;
        const generated = (data?.generation?.[li] || []).some((e) => e.value > 0);
        return {
            ...l,
            ageStart: s.ageStart ?? firstAge(li),
            ageEnd: s.ageEnd ?? nextStart ?? 0,
            sourceRock: s.sourceRock ?? (generated ? { isSource: true } : undefined),
        };
    });
    return { ...results, meta: { ...meta, layers } };
}
