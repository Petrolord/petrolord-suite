import React, { useMemo, useEffect, useRef, useState } from 'react';

const WellTrajectory3DView = ({ 
    planResult, 
    offsetWells = [], 
    targets = [], 
    exaggeration = 1,
    showOffsetWells = true
}) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = w;
        canvas.height = h;

        ctx.clearRect(0, 0, w, h);
        
        // Setup transform (origin top center, down is positive TVD)
        ctx.save();
        ctx.translate(w / 2, 50);

        // Simple scaling
        const scale = 0.05 * exaggeration;

        // Draw targets
        targets.forEach(t => {
            ctx.fillStyle = '#FFC107';
            ctx.beginPath();
            ctx.arc(t.x * scale, t.tvd_m * scale, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = "10px sans-serif";
            ctx.fillText(t.name, t.x * scale + 8, t.tvd_m * scale);
        });

        // Draw Offsets
        if (showOffsetWells) {
            offsetWells.forEach(well => {
                if(!well.stations) return;
                ctx.strokeStyle = well.color || '#64748b';
                ctx.lineWidth = 2;
                ctx.beginPath();
                well.stations.forEach((s, i) => {
                    const px = s.East * scale;
                    const py = s.TVD * scale;
                    if(i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                });
                ctx.stroke();
            });
        }

        // Draw Active Plan
        if (planResult && planResult.length > 0) {
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 3;
            ctx.beginPath();
            planResult.forEach((s, i) => {
                const px = s.East * scale;
                const py = s.TVD * scale;
                if(i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.stroke();
        }

        ctx.restore();
    }, [planResult, offsetWells, targets, exaggeration, showOffsetWells]);

    return (
        <div className="h-full w-full relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                <div className="bg-slate-800/80 p-2 rounded-md backdrop-blur-sm border border-slate-600">
                    <div className="text-[10px] text-slate-400 mb-1 uppercase">2D Projection (Section View)</div>
                </div>
            </div>
            <canvas ref={canvasRef} className="w-full h-full block" />
        </div>
    );
};

export default WellTrajectory3DView;