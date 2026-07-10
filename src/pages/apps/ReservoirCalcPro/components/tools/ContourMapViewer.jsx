import React, { useCallback, useEffect, useMemo, useState } from 'react';
import HeatmapCanvas from './HeatmapCanvas';
import { getInterpolator, gridExtent } from '../../services/colorUtils';
import { generateContours } from '../../services/ContourGenerator';
import { Loader2, Palette, Layers, Waves, Tag, Grid2x2 } from 'lucide-react';

// Curated colour scales exposed in the viewer (keys must exist in colorUtils).
const COLOR_SCALES = ['Earth', 'Viridis', 'Turbo', 'RdYlBu', 'YlGnBu', 'Blues', 'Hot'];

// Contour density presets → approximate number of levels across the value range.
const DENSITY = { Coarse: 8, Medium: 16, Fine: 30 };

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

const ToggleBtn = ({ active, onClick, title, children }) => (
    <button
        onClick={onClick}
        title={title}
        className={`h-6 px-1.5 rounded-sm flex items-center gap-1 text-[10px] font-medium transition-colors ${
            active ? 'bg-blue-600/80 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
        }`}
    >
        {children}
    </button>
);

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
    // Local, per-view display state (independent of the shared project settings).
    const [scale, setScale] = useState(colorscale);
    const [showFill, setShowFill] = useState(true);
    const [showContours, setShowContours] = useState(true);
    const [showLabels, setShowLabels] = useState(true);
    const [density, setDensity] = useState('Medium');
    const [hover, setHover] = useState(null); // { x, y, value, px, py }

    // Follow the layer's default colourscale when the active layer changes.
    useEffect(() => { setScale(colorscale); }, [colorscale]);

    const zExtent = useMemo(() => (gridData?.z ? gridExtent(gridData.z) : [0, 1]), [gridData]);
    const [minZ, maxZ] = zExtent;

    // Contour geometry — recomputed only when the grid or density changes
    // (colour changes are cheap and don't touch this).
    const contours = useMemo(() => {
        if (!gridData?.z) return { interval: 0, levels: [] };
        return generateContours(gridData, { min: minZ, max: maxZ, count: DENSITY[density] });
    }, [gridData, minZ, maxZ, density]);

    const overlay = useCallback((ctx, dims) => {
        // Contour lines beneath the AOI polygons. Every 5th level is drawn as a
        // heavier "index" contour, mirroring the convention in Petrel / Kingdom.
        if (showContours && contours.levels.length) {
            contours.levels.forEach((lvl, li) => {
                const index = li % 5 === 0;
                ctx.save();
                ctx.lineWidth = index ? 1.4 : 0.7;
                ctx.strokeStyle = index ? 'rgba(15,23,42,0.85)' : 'rgba(15,23,42,0.5)';
                ctx.beginPath();
                lvl.segments.forEach(([a, b]) => {
                    const pa = dims.toCanvas(a.x, a.y);
                    const pb = dims.toCanvas(b.x, b.y);
                    ctx.moveTo(pa.px, pa.py);
                    ctx.lineTo(pb.px, pb.py);
                });
                ctx.stroke();
                ctx.restore();

                // Label index contours only, once per level, on a segment near the
                // middle of the canvas to reduce clutter.
                if (showLabels && index && lvl.segments.length) {
                    const seg = lvl.segments[Math.floor(lvl.segments.length / 2)];
                    const mid = dims.toCanvas((seg[0].x + seg[1].x) / 2, (seg[0].y + seg[1].y) / 2);
                    const text = Math.round(lvl.level).toString();
                    ctx.save();
                    ctx.font = '600 9px ui-sans-serif, system-ui';
                    const tw = ctx.measureText(text).width;
                    ctx.fillStyle = 'rgba(248,250,252,0.85)';
                    ctx.fillRect(mid.px - tw / 2 - 2, mid.py - 6, tw + 4, 11);
                    ctx.fillStyle = '#0f172a';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, mid.px, mid.py);
                    ctx.restore();
                }
            });
        }

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
    }, [aois, activeAoiId, drawing, contours, showContours, showLabels]);

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

    const interp = getInterpolator(scale);
    const legendStops = Array.from({ length: 12 }, (_, i) => interp(i / 11));
    const drawingActive = enableDrawing && drawing.isActive;
    const fmtCoord = (v) => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(1));

    return (
        <div className="w-full h-full relative bg-slate-950">
            {/* Toolbar */}
            <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-slate-900/85 backdrop-blur border border-slate-700 rounded-md px-1 py-0.5 shadow-lg">
                <ToggleBtn active={showFill} onClick={() => setShowFill((v) => !v)} title="Colour fill">
                    <Layers className="w-3 h-3" /> Fill
                </ToggleBtn>
                <ToggleBtn active={showContours} onClick={() => setShowContours((v) => !v)} title="Contour lines">
                    <Waves className="w-3 h-3" /> Contours
                </ToggleBtn>
                <ToggleBtn active={showLabels && showContours} onClick={() => setShowLabels((v) => !v)} title="Contour labels">
                    <Tag className="w-3 h-3" /> Labels
                </ToggleBtn>
                <div className="w-px h-4 bg-slate-700 mx-0.5" />
                <div className="flex items-center gap-0.5" title="Contour density">
                    <Grid2x2 className="w-3 h-3 text-slate-400" />
                    {Object.keys(DENSITY).map((d) => (
                        <button
                            key={d}
                            onClick={() => setDensity(d)}
                            className={`h-6 px-1 rounded-sm text-[10px] ${density === d ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            {d[0]}
                        </button>
                    ))}
                </div>
                <div className="w-px h-4 bg-slate-700 mx-0.5" />
                <div className="flex items-center gap-1 pr-1" title="Colour scale">
                    <Palette className="w-3 h-3 text-slate-400" />
                    <select
                        value={scale}
                        onChange={(e) => setScale(e.target.value)}
                        className="h-6 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-200 px-1 focus:outline-none"
                    >
                        {COLOR_SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>

            <div className={drawingActive ? 'w-full h-full cursor-crosshair' : 'w-full h-full'}>
                <HeatmapCanvas
                    gridData={gridData}
                    colorscale={scale}
                    showFill={showFill}
                    overlay={overlay}
                    onCanvasClick={handleClick}
                    onCanvasHover={(pt, px) => setHover({ ...pt, ...px })}
                    onCanvasLeave={() => setHover(null)}
                />
            </div>

            {/* Live coordinate / value inspector (Petrel-style probe) */}
            {hover && (
                <div className="absolute top-2 right-2 z-10 bg-slate-950/80 backdrop-blur px-2 py-1.5 rounded border border-slate-700 pointer-events-none font-mono text-[10px] text-slate-300 space-y-0.5">
                    <div><span className="text-slate-500">X </span>{fmtCoord(hover.x)}</div>
                    <div><span className="text-slate-500">Y </span>{fmtCoord(hover.y)}</div>
                    <div className="text-blue-300">
                        <span className="text-slate-500">Z </span>
                        {hover.value == null ? '—' : hover.value.toFixed(hover.value > 1000 ? 0 : 2)} {unit}
                    </div>
                </div>
            )}

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
                <div className="flex items-center justify-between mt-0.5">
                    {unit && <span className="text-[8px] text-slate-500">{unit}</span>}
                    {showContours && contours.interval > 0 && (
                        <span className="text-[8px] text-slate-500 ml-auto">CI {contours.interval}{unit ? ' ' + unit : ''}</span>
                    )}
                </div>
            </div>

            {drawingActive && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 bg-emerald-950/80 backdrop-blur px-3 py-1 rounded-full border border-emerald-700 text-[10px] text-emerald-300 pointer-events-none">
                    Drawing — click to add points ({drawing.currentPoints.length})
                </div>
            )}
        </div>
    );
};

export default React.memo(ContourMapViewer);
