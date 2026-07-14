// Registry well list for Pore Pressure Studio (left explorer pane) —
// the Rock Physics WellExplorer shape, trimmed to what this app needs.

import React from 'react';
import { Loader2, CircleDot } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function WellExplorer({ wells, selectedId, loadingId, curveStatus, onSelect }) {
  return (
    <div className="h-full flex flex-col bg-slate-900/60 border-r border-slate-800/60">
      <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800/60">
        Registry wells
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <ul className="py-1">
          {wells.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                data-testid="pp-well-row"
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm
                  ${w.id === selectedId ? 'bg-cyan-500/10 text-cyan-200' : 'text-slate-300 hover:bg-slate-800/60'}`}
                onClick={() => onSelect(w.id)}
              >
                {loadingId === w.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                  : <CircleDot className="w-3.5 h-3.5 text-slate-600" />}
                <span className="truncate">{w.name}</span>
                {!w.is_own && (
                  <span className="ml-auto text-[10px] text-slate-500">org</span>
                )}
              </button>
            </li>
          ))}
          {wells.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-500">No wells in the registry.</li>
          )}
        </ul>
      </ScrollArea>
      {curveStatus && (
        <div className="px-3 py-2 border-t border-slate-800/60 text-[11px] text-slate-500" data-testid="pp-curve-status">
          {curveStatus}
        </div>
      )}
    </div>
  );
}
