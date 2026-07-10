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
const HeatmapCanvas = ({ gridData, colorscale = 'Viridis', overlay, onCanvasClick, className = '' }) => {
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

        const toCanvas = (wx, wy) => ({
            px: ((wx - minX) / spanX) * w,
            py: h - ((wy - minY) / spanY) * h,
        });
        const toWorld = (px, py) => ({
            x: minX + (px / w) * spanX,
            y: minY + ((h - py) / h) * spanY,
        });
        const dims = { w, h, minX, maxX, minY, maxY, toCanvas, toWorld };
        dimsRef.current = dims;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);

        const interp = getInterpolator(colorscale);
        const [minZ, maxZ] = gridExtent(z);
        const spanZ = maxZ - minZ || 1;

        const cellW = w / nx;
        const cellH = h / ny;
        for (let j = 0; j < ny; j++) {
            const row = z[j];
            if (!row) continue;
            for (let i = 0; i < nx; i++) {
                const v = row[i];
                if (v === null || v === undefined || isNaN(v)) continue;
                const t = (v - minZ) / spanZ;
                ctx.fillStyle = interp(t);
                ctx.fillRect(
                    i * cellW,
                    h - (j + 1) * cellH,
                    Math.ceil(cellW),
                    Math.ceil(cellH),
                );
            }
        }

        if (typeof overlay === 'function') overlay(ctx, dims);
    }, [gridData, colorscale, overlay, width, height]);

    useEffect(() => { draw(); }, [draw]);

    const handleClick = (e) => {
        if (typeof onCanvasClick !== 'function' || !dimsRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        onCanvasClick(dimsRef.current.toWorld(px, py), { px, py }, dimsRef.current);
    };

    return (
        <div ref={ref} className={`w-full h-full relative ${className}`}>
            <canvas
                ref={canvasRef}
                onClick={handleClick}
                className="w-full h-full block"
            />
        </div>
    );
};

export default React.memo(HeatmapCanvas);
