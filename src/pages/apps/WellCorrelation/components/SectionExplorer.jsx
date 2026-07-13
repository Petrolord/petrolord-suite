// Section explorer (Well Correlation G3.2): a surface map where
// clicking wells builds the ordered cross-section path, plus the
// ordered well list with reorder/remove. Registry wells with org
// badges (the WDM idiom). Presentational — order lives in the
// controller.

import React, { useEffect, useMemo, useRef } from 'react';
import { Building2, Lock, ArrowUp, ArrowDown, X, Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const PAD = 26;

export default function SectionExplorer({ wells, order, onToggle, onMove, onRemove, height = 200 }) {
  const canvasRef = useRef(null);
  const placed = useRef([]);

  const extent = useMemo(() => {
    if (!wells.length) return null;
    const xs = wells.map((w) => w.surface_x);
    const ys = wells.map((w) => w.surface_y);
    let [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if (!(maxX - minX > 0)) { minX -= 500; maxX += 500; }
    if (!(maxY - minY > 0)) { minY -= 500; maxY += 500; }
    return { minX, maxX, minY, maxY };
  }, [wells]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssW = canvas.parentElement.clientWidth || 260;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, cssW, height);
    placed.current = [];
    if (!extent) return;
    const { minX, maxX, minY, maxY } = extent;
    const scale = Math.min((cssW - 2 * PAD) / (maxX - minX), (height - 2 * PAD) / (maxY - minY));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const toPx = (x, y) => ({ px: cssW / 2 + (x - cx) * scale, py: height / 2 - (y - cy) * scale });

    // section path (in order)
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    order.forEach((id, i) => {
      const w = wells.find((x) => x.id === id);
      if (!w) return;
      const { px, py } = toPx(w.surface_x, w.surface_y);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    });
    ctx.stroke();
    ctx.lineWidth = 1;

    for (const w of wells) {
      const { px, py } = toPx(w.surface_x, w.surface_y);
      placed.current.push({ id: w.id, px, py });
      const idx = order.indexOf(w.id);
      ctx.beginPath();
      ctx.arc(px, py, idx >= 0 ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = idx >= 0 ? '#22d3ee' : (w.organization_id ? '#34d399' : '#fbbf24');
      ctx.fill();
      if (idx >= 0) {
        ctx.fillStyle = '#0b1220';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(idx + 1), px, py + 3);
      }
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(w.name, px + 8, py + 3);
    }
  }, [wells, order, extent, height]);

  const pick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = null;
    for (const p of placed.current) {
      const d = Math.hypot(p.px - x, p.py - y);
      if (d <= 12 && (!best || d < best.d)) best = { id: p.id, d };
    }
    if (best) onToggle(best.id);
  };

  const orderedWells = order.map((id) => wells.find((w) => w.id === id)).filter(Boolean);
  const availableWells = wells.filter((w) => !order.includes(w.id));

  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-900/60" data-testid="corr-explorer">
      <div className="px-2.5 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800/60">
        Section path — click wells to order
      </div>
      <canvas ref={canvasRef} data-testid="corr-map" className="cursor-pointer border-b border-slate-800/60" onClick={pick} />
      <div className="px-2.5 py-1 text-[11px] uppercase tracking-wider text-slate-500">
        In section <span data-testid="corr-order-count">{order.length}</span> / {wells.length}
      </div>
      <ScrollArea className="flex-1 min-h-0">
        {orderedWells.map((w, i) => (
          <div key={w.id} data-testid="corr-order-row" data-well-name={w.name}
            className="flex items-center gap-1 pl-2.5 pr-1.5 py-[3px] text-[13px] text-slate-300">
            <span className="w-4 text-cyan-300 text-xs">{i + 1}</span>
            {w.organization_id ? <Building2 className="w-3 h-3 text-emerald-300" /> : <Lock className="w-3 h-3 text-slate-500" />}
            <span className="truncate">{w.name}</span>
            <div className="ml-auto flex items-center gap-0.5 text-slate-500">
              <button type="button" title="Move up" disabled={i === 0} className="disabled:opacity-30 hover:text-slate-200" onClick={() => onMove(w.id, -1)}><ArrowUp className="w-3.5 h-3.5" /></button>
              <button type="button" title="Move down" disabled={i === orderedWells.length - 1} className="disabled:opacity-30 hover:text-slate-200" onClick={() => onMove(w.id, 1)}><ArrowDown className="w-3.5 h-3.5" /></button>
              <button type="button" title="Remove" className="hover:text-red-400" data-testid={`corr-remove-${w.name}`} onClick={() => onRemove(w.id)}><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
        {!order.length && <p className="px-3 py-2 text-xs text-slate-600 leading-snug">Click wells on the map (or the list below) to add them to the cross-section in order.</p>}

        {availableWells.length > 0 && (
          <>
            <div className="px-2.5 pt-2 pb-1 text-[11px] uppercase tracking-wider text-slate-500 border-t border-slate-800/60">
              Available
            </div>
            {availableWells.map((w) => (
              <button key={w.id} type="button" data-testid={`corr-add-${w.name}`}
                className="w-full flex items-center gap-1.5 pl-2.5 pr-2 py-[3px] text-[13px] text-slate-400 hover:bg-slate-800/70"
                onClick={() => onToggle(w.id)}>
                <Plus className="w-3 h-3 text-slate-500" />
                {w.organization_id ? <Building2 className="w-3 h-3 text-emerald-300" /> : <Lock className="w-3 h-3 text-slate-500" />}
                <span className="truncate">{w.name}</span>
              </button>
            ))}
          </>
        )}
      </ScrollArea>
    </div>
  );
}
