// ---------------------------------------------------------------------------
// Contour (isoline) extraction via marching squares.
//
// Input grid is the shared {x:[nx], y:[ny], z:[ny][nx]} shape used across the
// map viewers, where z[j][i] is the value at world coordinate (x[i], y[j]).
// Null / NaN cells are skipped (a cell is only contoured when all four of its
// corners are valid), which keeps polygon-clipped property maps clean.
//
// Output is a list of levels, each carrying an array of straight segments in
// *world* coordinates:  [{ level, segments: [[{x,y},{x,y}], …] }]
// Segments are intentionally left unstitched — every viewer draws them as short
// line strokes, so there is no need to pay for polyline assembly.
// ---------------------------------------------------------------------------

// "Nice" step (1/2/5 × 10^n) so contour labels land on round numbers, the way a
// geologist expects (…, 25, 50, 75, 100, …) rather than 23.7-unit intervals.
export function niceInterval(min, max, targetCount = 12) {
    const span = Math.abs(max - min);
    if (!(span > 0)) return 1;
    const rough = span / Math.max(1, targetCount);
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    const step = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
    return step * mag;
}

// Build the list of contour levels covering [min, max] at the given interval,
// snapped to multiples of the interval. Capped so a pathological interval can't
// spawn thousands of levels.
export function contourLevels(min, max, interval) {
    if (!(interval > 0) || !isFinite(min) || !isFinite(max) || max <= min) return [];
    const start = Math.ceil(min / interval) * interval;
    const levels = [];
    for (let v = start; v <= max && levels.length < 500; v += interval) {
        // Guard against floating-point creep accumulating over many steps.
        levels.push(parseFloat(v.toPrecision(12)));
    }
    return levels;
}

// Linear interpolation of the crossing point between two grid corners.
function lerp(pa, pb, va, vb, level) {
    const t = (level - va) / (vb - va || 1e-9);
    return { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
}

// Extract segments for a single level across the whole grid.
function segmentsForLevel(grid, level) {
    const { x, y, z } = grid;
    const nx = x.length;
    const ny = y.length;
    const segs = [];

    for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
            const zbl = z[j] ? z[j][i] : null;          // bottom-left
            const zbr = z[j] ? z[j][i + 1] : null;      // bottom-right
            const ztr = z[j + 1] ? z[j + 1][i + 1] : null; // top-right
            const ztl = z[j + 1] ? z[j + 1][i] : null;  // top-left
            if (zbl == null || zbr == null || ztr == null || ztl == null ||
                isNaN(zbl) || isNaN(zbr) || isNaN(ztr) || isNaN(ztl)) continue;

            // Classify each corner as above/below the level.
            const idx = (zbl > level ? 1 : 0) | (zbr > level ? 2 : 0) |
                        (ztr > level ? 4 : 0) | (ztl > level ? 8 : 0);
            if (idx === 0 || idx === 15) continue; // no crossing

            const pbl = { x: x[i], y: y[j] };
            const pbr = { x: x[i + 1], y: y[j] };
            const ptr = { x: x[i + 1], y: y[j + 1] };
            const ptl = { x: x[i], y: y[j + 1] };

            // Edge crossing points (bottom, right, top, left).
            const eB = () => lerp(pbl, pbr, zbl, zbr, level);
            const eR = () => lerp(pbr, ptr, zbr, ztr, level);
            const eT = () => lerp(ptl, ptr, ztl, ztr, level);
            const eL = () => lerp(pbl, ptl, zbl, ztl, level);

            switch (idx) {
                case 1: case 14: segs.push([eL(), eB()]); break;
                case 2: case 13: segs.push([eB(), eR()]); break;
                case 3: case 12: segs.push([eL(), eR()]); break;
                case 4: case 11: segs.push([eR(), eT()]); break;
                case 6: case 9:  segs.push([eB(), eT()]); break;
                case 7: case 8:  segs.push([eL(), eT()]); break;
                // Saddle cases — split into two segments. Orientation is arbitrary
                // for rendering; we pick the common resolution.
                case 5:  segs.push([eL(), eT()]); segs.push([eB(), eR()]); break;
                case 10: segs.push([eL(), eB()]); segs.push([eT(), eR()]); break;
                default: break;
            }
        }
    }
    return segs;
}

/**
 * Generate contour lines for a grid.
 * @param {{x:number[],y:number[],z:(number|null)[][]}} grid
 * @param {{ min:number, max:number, interval?:number, count?:number }} opts
 *        `interval` wins if provided; otherwise a nice interval targeting `count`
 *        levels is chosen automatically.
 * @returns {{ interval:number, levels:{level:number,segments:{x:number,y:number}[][]}[] }}
 */
export function generateContours(grid, { min, max, interval, count = 12 } = {}) {
    if (!grid || !grid.x || !grid.y || !grid.z) return { interval: 0, levels: [] };
    const step = interval && interval > 0 ? interval : niceInterval(min, max, count);
    const levels = contourLevels(min, max, step).map((level) => ({
        level,
        segments: segmentsForLevel(grid, level),
    })).filter((l) => l.segments.length > 0);
    return { interval: step, levels };
}
