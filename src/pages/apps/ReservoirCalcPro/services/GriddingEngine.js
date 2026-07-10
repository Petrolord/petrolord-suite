import { SurfaceInterpolator } from './SurfaceInterpolator';
import { KrigingInterpolator } from './KrigingInterpolator';

// Facade over the available scattered-point → regular-grid interpolators, plus a
// small in-session grid cache so a surface isn't re-gridded every render / layer
// switch (kriging is worth caching). Grids are cached in memory only — the source
// of truth is the point set, so we don't bloat the persisted project with grids.

const gridCache = new Map();
const MAX_CACHE = 24;

/** Build an interpolator with the SurfaceInterpolator interface for the given method. */
export function makeInterpolator(points, method = 'kriging', options = {}) {
    if (method === 'idw') return new SurfaceInterpolator(points);
    return new KrigingInterpolator(points, options);
}

/** Grid a surface to a regular mesh with the chosen method, memoised per surface+method+size. */
export function gridSurface(surface, method = 'kriging', nx = 80) {
    if (!surface || !Array.isArray(surface.points) || surface.points.length < 3) return null;
    const key = `${surface.id || 'anon'}:${method}:${nx}:${surface.points.length}`;
    if (gridCache.has(key)) return gridCache.get(key);
    const grid = makeInterpolator(surface.points, method).generateGrid(nx);
    if (gridCache.size >= MAX_CACHE) gridCache.clear();
    gridCache.set(key, grid);
    return grid;
}

export function clearGridCache() { gridCache.clear(); }
