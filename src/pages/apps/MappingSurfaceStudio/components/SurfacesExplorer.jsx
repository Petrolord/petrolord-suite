// Surfaces explorer (Mapping & Surface Studio G4.3): saved surfaces
// list (select to view, org/private badges, owner-only delete) plus
// the "grid a new surface" form — pick a control-point source from the
// registry (a top across wells, or a zone attribute), a cell size, and
// grid. Presentational; the controller owns state + the engine calls.

import React from 'react';
import { Layers, Building2, Lock, Trash2, Grid3x3 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const selCls = 'w-full rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';

export default function SurfacesExplorer({
  surfaces, selectedId, onSelect, onDelete,
  topNames, zoneKeys, source, onSource, cellM, onCellM, onGrid, gridding,
}) {
  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-900/60" data-testid="map-explorer">
      <div className="p-2 space-y-1.5 border-b border-slate-800/60">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Grid a new surface</div>
        <select className={selCls} value={`${source.type}:${source.key}`} data-testid="map-source"
          onChange={(e) => {
            const [type, key] = e.target.value.split(':');
            onSource(type === 'top'
              ? { type: 'top', key }
              : { type: 'zone', zoneName: 'Reservoir', key });
          }}>
          <optgroup label="Structure — top across wells">
            {topNames.map((n) => <option key={`top:${n}`} value={`top:${n}`}>Top: {n}</option>)}
          </optgroup>
          <optgroup label="Attribute — zone property">
            {zoneKeys.map((k) => <option key={`zone:${k}`} value={`zone:${k}`}>Zone: {k}</option>)}
          </optgroup>
        </select>
        <div className="flex items-center gap-1">
          <input className={`${selCls} flex-1`} value={cellM} data-testid="map-cell"
            onChange={(e) => onCellM(e.target.value)} placeholder="cell m" title="Grid cell size (m)" />
          <button type="button" data-testid="map-grid-run"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
            disabled={gridding} onClick={onGrid}>
            <Grid3x3 className="w-3.5 h-3.5" /> Grid
          </button>
        </div>
      </div>

      <div className="px-2.5 py-1 text-[11px] uppercase tracking-wider text-slate-500">
        Surfaces <span data-testid="map-surface-count">{surfaces.length}</span>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        {surfaces.map((s) => {
          const shared = !!s.organization_id;
          const sel = s.id === selectedId;
          return (
            <div key={s.id} role="button" tabIndex={0} data-testid="map-surface-row" data-surface-name={s.name}
              className={`group flex items-center gap-1.5 pl-2.5 pr-2 py-[3px] text-[13px] cursor-pointer select-none
                ${sel ? 'bg-cyan-500/10 text-cyan-200' : 'text-slate-300 hover:bg-slate-800/70'}`}
              onClick={() => onSelect(s.id)} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(s.id); }}>
              <Layers className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span className="truncate">{s.name}</span>
              <span className="text-[10px] text-slate-500">{s.kind}</span>
              <span className={`ml-auto inline-flex items-center rounded px-1 text-[10px]
                ${shared ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-400'}`}
                title={shared ? 'Shared with the organization' : 'Private'}>
                {shared ? <Building2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              </span>
              {s.is_own && (
                <button type="button" title={`Delete ${s.name}`} data-testid={`map-delete-${s.name}`}
                  className="text-slate-500 hover:text-red-400" onClick={(e) => { e.stopPropagation(); onDelete(s); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
        {!surfaces.length && <p className="px-3 py-2 text-xs text-slate-600 leading-snug">No surfaces yet — grid a top above, then publish.</p>}
      </ScrollArea>
    </div>
  );
}
