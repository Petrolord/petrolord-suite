import React, { useEffect, useRef, useCallback } from 'react';
import { useResizeDetector } from 'react-resize-detector';
import { getInterpolator, gridExtent } from '../../services/colorUtils';

/**
 * Canvas heatmap renderer for a regular {x, y, z} grid.
 *
 * z[j][i] is the value at world coordinate (x[i], y[j]); null/NaN cells are
 * left transparent (used for polygon-clipped maps). The Y axis is drawn
 * inverted so larger Y renders towards the top, matching map convention.
 *
 * Coordinate helpers are exposed to `overlay` and `onCanvasClick` so callers
 * can draw world-space geometry (AOI polygons) and translate clicks back to
 * world coordinates.
 */
const HeatmapCanvas = ({ gridData, colorscale = 'Viridis', overlay, onCanvasClick, onCanvasHover, onCanvasLeave, showFill = true, className = '' }) => {
    const canvasRef = useRef(null);
    const dimsRef = useRef(null);
    const { width, height, ref } = useResizeDetector({ refreshMode: 'debounce', refreshRate: 50 });

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !gridData || !gridData.z || !gridData.x || !gridData.y) return;

        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w < 2 || h < 2) return;
        canvas.width = w;
        canvas.height = h;

        const { x, y, z } = gridData;
        const nx = x.length;
        const ny = y.length;
        if (nx < 2 || ny < 2) return;

        const minX = x[0];
        const maxX = x[nx - 1];
        const minY = y[0];
        const maxY = y[ny - 1];
        const spanX = maxX - minX || 1;
        const spanY = maxY - minY || 1;

        // One scale for x and y so the map keeps its true shape; the grid is
        // centred in the pane (RCP-T1-006: a stretched map drew a round dome
        // as a tall ellipse in split view).
        const k = Math.min(w / spanX, h / spanY);
        const ox = (w - spanX * k) / 2;
        const oy = (h - spanY * k) / 2;
        const toCanvas = (wx, wy) => ({
            px: ox + (wx - minX) * k,
            py: h - oy - (wy - minY) * k,
        });
        const toWorld = (px, py) => ({
            x: minX + (px - ox) / k,
            y: minY + (h - oy - py) / k,
        });
        const dims = { w, h, minX, maxX, minY, maxY, toCanvas, toWorld, scale: k, ox, oy };
        dimsRef.current = dims;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);

        const interp = getInterpolator(colorscale);
        const [minZ, maxZ] = gridExtent(z);
        const spanZ = maxZ - minZ || 1;

        // Colour-grade fill (skippable so callers can show a contour-only map).
        if (showFill) {
            const cellW = (spanX * k) / nx;
            const cellH = (spanY * k) / ny;
            for (let j = 0; j < ny; j++) {
                const row = z[j];
                if (!row) continue;
                for (let i = 0; i < nx; i++) {
                    const v = row[i];
                    if (v === null || v === undefined || isNaN(v)) continue;
                    const t = (v - minZ) / spanZ;
                    ctx.fillStyle = interp(t);
                    // snap to whole pixels so neighbouring cells meet without seams
                    const x0 = Math.floor(ox + i * cellW);
                    const x1 = Math.ceil(ox + (i + 1) * cellW);
                    const y0 = Math.floor(h - oy - (j + 1) * cellH);
                    const y1 = Math.ceil(h - oy - j * cellH);
                    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
                }
            }
        }

        if (typeof overlay === 'function') overlay(ctx, dims);
        // width/height aren't read here (the canvas is remeasured via clientWidth),
        // but they must stay in the deps so a container resize triggers a redraw.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gridData, colorscale, overlay, showFill, width, height]);

    useEffect(() => { draw(); }, [draw]);

    const handleClick = (e) => {
        if (typeof onCanvasClick !== 'function' || !dimsRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        onCanvasClick(dimsRef.current.toWorld(px, py), { px, py }, dimsRef.current);
    };

    // Sample the grid value under the cursor (nearest node) for a live inspector.
    const handleMove = (e) => {
        if (typeof onCanvasHover !== 'function' || !dimsRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const world = dimsRef.current.toWorld(px, py);
        let value = null;
        const { x, y, z } = gridData || {};
        if (x && y && z) {
            let bi = 0, bj = 0, bdx = Infinity, bdy = Infinity;
            for (let i = 0; i < x.length; i++) { const d = Math.abs(x[i] - world.x); if (d < bdx) { bdx = d; bi = i; } }
            for (let j = 0; j < y.length; j++) { const d = Math.abs(y[j] - world.y); if (d < bdy) { bdy = d; bj = j; } }
            const v = z[bj] ? z[bj][bi] : null;
            value = (v == null || isNaN(v)) ? null : v;
        }
        onCanvasHover({ x: world.x, y: world.y, value }, { px, py });
    };

    return (
        <div ref={ref} className={`w-full h-full relative ${className}`}>
            <canvas
                ref={canvasRef}
                onClick={handleClick}
                onMouseMove={onCanvasHover ? handleMove : undefined}
                onMouseLeave={onCanvasLeave}
                className="w-full h-full block"
            />
        </div>
    );
};

export default React.memo(HeatmapCanvas);
