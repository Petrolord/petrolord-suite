import {
    interpolateViridis,
    interpolateTurbo,
    interpolateInferno,
    interpolateYlGnBu,
    interpolateBlues,
    interpolateYlOrBr,
    interpolateRdYlBu,
} from 'd3-scale-chromatic';

// Map the engine's colorscale names onto d3 interpolators. Unknown names
// fall back to Viridis (perceptually uniform, colour-blind safe).
const SCALES = {
    Viridis: interpolateViridis,
    Jet: interpolateTurbo,
    Turbo: interpolateTurbo,
    Hot: interpolateInferno,
    Portland: interpolateTurbo,
    YlGnBu: interpolateYlGnBu,
    Blues: interpolateBlues,
    Earth: interpolateYlOrBr,
    // Depth-style diverging scale, reversed so shallow (less negative) reads warm.
    RdYlBu: (t) => interpolateRdYlBu(1 - t),
};

export function getInterpolator(name) {
    return SCALES[name] || interpolateViridis;
}

// Compute [min, max] over a 2D z-grid, ignoring null/NaN cells.
export function gridExtent(z) {
    let min = Infinity;
    let max = -Infinity;
    for (let j = 0; j < z.length; j++) {
        const row = z[j];
        if (!row) continue;
        for (let i = 0; i < row.length; i++) {
            const v = row[i];
            if (v !== null && v !== undefined && !isNaN(v)) {
                if (v < min) min = v;
                if (v > max) max = v;
            }
        }
    }
    if (!isFinite(min) || !isFinite(max)) return [0, 1];
    return [min, max];
}
