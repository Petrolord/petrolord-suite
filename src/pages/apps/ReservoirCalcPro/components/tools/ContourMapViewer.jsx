import React, { useCallback } from 'react';
import HeatmapCanvas from './HeatmapCanvas';
import { getInterpolator, gridExtent } from '../../services/colorUtils';
import { Loader2 } from 'lucide-react';

// Draw an AOI polygon (world coords) onto the canvas via the supplied transform.
function drawPolygon(ctx, vertices, dims, { stroke, fill, closed = true, dashed = false }) {
    if (!vertices || vertices.length === 0) return;
    ctx.save();
    ctx.beginPath();
    vertices.forEach((v, i) => {
        const { px, py } = dims.toCanvas(v.x, v.y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    if (closed) ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (dashed) ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
}

function drawVertices(ctx, vertices, dims, color) {
    ctx.save();
    vertices.forEach((v) => {
        const { px, py } = dims.toCanvas(v.x, v.y);
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    });
    ctx.restore();
}

const ContourMapViewer = ({
    gridData,
    colorscale = 'Viridis',
    unit = '',
    aois = [],
    activeAoiId = null,
    drawing = { isActive: false, currentPoints: [] },
    enableDrawing = false,
    onAddPoint,
}) => {
    const overlay = useCallback((ctx, dims) => {
        // Saved AOIs
        aois.forEach((aoi) => {
            if (aoi.visible === false) return;
            const isActive = aoi.id === activeAoiId;
            drawPolygon(ctx, aoi.vertices, dims, {
                stroke: aoi.color || '#3b82f6',
                fill: `${aoi.color || '#3b82f6'}22`,
                closed: true,
            });
            if (isActive) drawVertices(ctx, aoi.vertices, dims, aoi.color || '#3b82f6');
        });

        // In-progress drawing
        if (drawing.isActive && drawing.currentPoints.length > 0) {
            drawPolygon(ctx, drawing.currentPoints, dims, {
                stroke: '#10b981',
                fill: drawing.currentPoints.length > 2 ? '#10b98122' : null,
                closed: drawing.currentPoints.length > 2,
                dashed: true,
            });
            drawVertices(ctx, drawing.currentPoints, dims, '#10b981');
        }
    }, [aois, activeAoiId, drawing]);

    const handleClick = useCallback((worldPt) => {
        if (enableDrawing && drawing.isActive && typeof onAddPoint === 'function') {
            onAddPoint({ x: worldPt.x, y: worldPt.y });
        }
    }, [enableDrawing, drawing.isActive, onAddPoint]);

    if (!gridData || !gridData.z || !gridData.x || !gridData.y) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-slate-950">
                <Loader2 className="w-5 h-5 text-slate-700 animate-spin" />
            </div>
        );
    }

    const zFlat = gridData.z.flat().filter((v) => v !== null && v !== undefined && !isNaN(v));
    if (zFlat.length === 0) {
        return <div className="w-full h-full flex items-center justify-center text-amber-500/70 text-xs">No valid grid values to display</div>;
    }

    const [minZ, maxZ] = gridExtent(gridData.z);
    const interp = getInterpolator(colorscale);
    const legendStops = Array.from({ length: 12 }, (_, i) => interp(i / 11));
    const drawingActive = enableDrawing && drawing.isActive;

    return (
        <div className="w-full h-full relative bg-slate-950">
            <div className={drawingActive ? 'w-full h-full cursor-crosshair' : 'w-full h-full'}>
                <HeatmapCanvas
                    gridData={gridData}
                    colorscale={colorscale}
                    overlay={overlay}
                    onCanvasClick={handleClick}
                />
            </div>

            {/* Colour legend */}
            <div className="absolute bottom-3 right-3 z-10 bg-slate-950/70 backdrop-blur px-2 py-1.5 rounded border border-slate-800 pointer-events-none">
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-slate-400 font-mono">{minZ.toFixed(minZ > 1000 ? 0 : 2)}</span>
                    <div
                        className="h-2 w-24 rounded"
                        style={{ background: `linear-gradient(to right, ${legendStops.join(',')})` }}
                    />
                    <span className="text-[9px] text-slate-400 font-mono">{maxZ.toFixed(maxZ > 1000 ? 0 : 2)}</span>
                </div>
                {unit && <div className="text-[8px] text-slate-500 text-center mt-0.5">{unit}</div>}
            </div>

            {drawingActive && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-emerald-950/80 backdrop-blur px-3 py-1 rounded-full border border-emerald-700 text-[10px] text-emerald-300 pointer-events-none">
                    Drawing — click to add points ({drawing.currentPoints.length})
                </div>
            )}
        </div>
    );
};

export default React.memo(ContourMapViewer);
