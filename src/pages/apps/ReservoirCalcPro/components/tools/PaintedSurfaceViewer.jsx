import React, { useMemo, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

const PaintedSurfaceViewer = ({ gridData }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !gridData || !gridData.z) return;

        const ctx = canvas.getContext('2d');
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = w;
        canvas.height = h;

        const nx = gridData.x.length;
        const ny = gridData.y.length;
        if (nx < 2 || ny < 2) return;

        // Calculate Min/Max Z for color scaling
        let minZ = Infinity, maxZ = -Infinity;
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                const z = gridData.z[j] ? gridData.z[j][i] : null;
                if (z !== null && !isNaN(z)) {
                    if (z < minZ) minZ = z;
                    if (z > maxZ) maxZ = z;
                }
            }
        }

        const cellW = w / nx;
        const cellH = h / ny;

        ctx.clearRect(0, 0, w, h);

        // Draw heat map
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                let zVal = gridData.z[j] ? gridData.z[j][i] : null;
                if (zVal !== null && !isNaN(zVal)) {
                    const t = (zVal - minZ) / (maxZ - minZ || 1);
                    // Simple Jet colormap approximation
                    const r = Math.round(255 * t);
                    const b = Math.round(255 * (1 - t));
                    ctx.fillStyle = `rgb(${r}, 0, ${b})`;
                    // Y axis inverted for drawing
                    ctx.fillRect(i * cellW, h - (j + 1) * cellH, Math.ceil(cellW), Math.ceil(cellH));
                }
            }
        }
    }, [gridData]);

    if (!gridData || !gridData.z) {
        return <div className="w-full h-full flex items-center justify-center text-slate-600">No Data</div>;
    }

    return (
        <div className="w-full h-full bg-slate-950 relative overflow-hidden group p-4 flex flex-col items-center">
            <h3 className="text-slate-400 text-xs mb-2 uppercase font-bold tracking-widest absolute top-2 left-4 z-10">Surface Depth Map (2D)</h3>
            <canvas ref={canvasRef} className="w-full h-full border border-slate-800 rounded-md" />
        </div>
    );
};

export default React.memo(PaintedSurfaceViewer);