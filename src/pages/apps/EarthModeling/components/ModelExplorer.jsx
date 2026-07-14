// Left explorer (Earth Modeling G8.2): the registry surfaces (add to
// the model stack), the model tree (stack order + zones), wells, and
// fault polygons. Selection/ordering only — the heavy controls live in
// the builder dock.

import React from 'react';
import { Layers3, ArrowUp, ArrowDown, X, Plus, CircleDot, Spline } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const secCls = 'text-[10px] uppercase tracking-wider text-slate-500 px-2 pt-3 pb-1';
const rowCls = 'flex items-center gap-1 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800/60 rounded';
const btnCls = 'p-0.5 rounded hover:bg-slate-700/60 text-slate-500 hover:text-slate-200';

export default function ModelExplorer({
  surfaces, wells, definition, onAddSurface, onRemoveSurface, onMoveSurface,
  onDeletePolygon,
}) {
  const inStack = new Set(definition.surfaceIds);
  const stackRows = definition.surfaceIds.map((id) => surfaces.find((s) => s.id === id)).filter(Boolean);

  return (
    <ScrollArea className="h-full min-h-0 bg-slate-900/60 border-r border-slate-800/60">
      <div className="pb-3" data-testid="em-explorer">
        <div className={secCls}>Model stack (shallow → deep)</div>
        {!stackRows.length && <p className="px-2 text-[11px] text-slate-600">Add registry surfaces below.</p>}
        {stackRows.map((s, i) => (
          <div className={rowCls} key={s.id} data-testid={`em-stack-${i}`}>
            <Layers3 className="w-3 h-3 text-cyan-400 shrink-0" />
            <span className="truncate flex-1">{s.name}</span>
            <button type="button" className={btnCls} disabled={i === 0} onClick={() => onMoveSurface(i, -1)} title="Move up"><ArrowUp className="w-3 h-3" /></button>
            <button type="button" className={btnCls} disabled={i === stackRows.length - 1} onClick={() => onMoveSurface(i, 1)} title="Move down"><ArrowDown className="w-3 h-3" /></button>
            <button type="button" className={btnCls} onClick={() => onRemoveSurface(s.id)} title="Remove"><X className="w-3 h-3" /></button>
          </div>
        ))}

        <div className={secCls}>Registry surfaces</div>
        {surfaces.filter((s) => !inStack.has(s.id)).map((s) => (
          <div className={rowCls} key={s.id}>
            <span className="truncate flex-1" title={`${s.kind} · ${s.nx}×${s.ny}`}>{s.name}</span>
            <span className="text-[10px] text-slate-600">{s.kind}</span>
            <button type="button" className={btnCls} data-testid={`em-add-${s.name}`} onClick={() => onAddSurface(s.id)} title="Add to stack">
              <Plus className="w-3 h-3" />
            </button>
          </div>
        ))}
        {!surfaces.length && <p className="px-2 text-[11px] text-slate-600">No surfaces in the registry — build them in Mapping &amp; Surface Studio.</p>}

        <div className={secCls}>Fault polygons</div>
        {(definition.faultPolygons || []).map((p, i) => (
          <div className={rowCls} key={p.name}>
            <Spline className="w-3 h-3 text-yellow-500 shrink-0" />
            <span className="truncate flex-1">{p.name}</span>
            <span className="text-[10px] text-slate-600">{p.vertices.length} pts</span>
            <button type="button" className={btnCls} onClick={() => onDeletePolygon(i)} title="Delete"><X className="w-3 h-3" /></button>
          </div>
        ))}
        {!(definition.faultPolygons || []).length && (
          <p className="px-2 text-[11px] text-slate-600">None — draw one from the dock (blocks default to a single block).</p>
        )}

        <div className={secCls}>Wells ({(wells || []).length})</div>
        {(wells || []).map((w) => (
          <div className={rowCls} key={w.id}>
            <CircleDot className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="truncate flex-1">{w.name}</span>
            <span className="text-[10px] text-slate-600">{(w.tops || []).length} tops · {(w.zones || []).length} zones</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
