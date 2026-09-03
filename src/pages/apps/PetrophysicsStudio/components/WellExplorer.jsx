// Wells + curve-inventory explorer (Petrophysics Studio G2.3, the
// SeismicExplorer/WellsTree idiom): registry wells with org badges;
// the selected well expands its curve inventory showing which standard
// mnemonics the controller mapped (the pipeline consumes DEPT/GR/RHOB/
// NPHI/DT/RT). Presentational — state lives in PetroWorkstation.

import React from 'react';
import { CircleDot, Building2, Lock, Loader2, Check, Minus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { candidatesFor, unmappedLogs } from '../services/curveMap';

export default function WellExplorer({
  wells, selectedId, loadingId, curveInventory, allLogs, onPickCurve, onSelect,
}) {
  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-900/60" data-testid="petro-explorer">
      <div className="px-2.5 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800/60">
        Registry wells <span data-testid="petro-well-count">{wells.length}</span>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        {wells.map((w) => {
          const shared = !!w.organization_id;
          const selected = w.id === selectedId;
          return (
            <div key={w.id}>
              <div
                role="button"
                tabIndex={0}
                data-testid="petro-well-row"
                data-well-name={w.name}
                className={`flex items-center gap-1.5 pl-2.5 pr-2 py-[3px] text-[13px] cursor-pointer
                  select-none min-w-0
                  ${selected ? 'bg-cyan-500/10 text-cyan-200' : 'text-slate-300 hover:bg-slate-800/70'}`}
                onClick={() => onSelect(w.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect(w.id); }}
              >
                <CircleDot className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span className="truncate">{w.name}</span>
                <span
                  title={shared ? `Shared with the organization${w.is_own ? '' : ' (read-only for you)'}` : 'Private'}
                  className={`ml-1 inline-flex items-center gap-0.5 rounded px-1 text-[10px]
                    ${shared ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-400'}`}
                >
                  {shared ? <Building2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                </span>
                {w.id === loadingId && <Loader2 className="ml-auto w-3.5 h-3.5 animate-spin text-slate-500" />}
              </div>
              {selected && curveInventory && (
                <div className="pl-7 pb-1" data-testid="petro-curve-inventory">
                  {(() => {
                    const mapped = Object.fromEntries(curveInventory.map(({ key, log }) => [key, log]));
                    const others = allLogs ? unmappedLogs(allLogs, mapped) : [];
                    return others.length ? (
                      <div className="text-[10px] text-slate-500 pb-1" data-testid="petro-other-curves"
                        title="Curves no pipeline input took. Put any of them on a track from Track layout (curve address log:<MNEMONIC>), or bind one to an input with the pickers below where offered.">
                        Also in this well: <span className="text-slate-400">{others.map((l) => l.mnemonic).join(', ')}</span>
                      </div>
                    ) : null;
                  })()}
                  {curveInventory.map(({ key, log }) => {
                    const candidates = allLogs && onPickCurve ? candidatesFor(key, allLogs) : [];
                    return (
                      <div key={key} className="flex items-center gap-1.5 text-[11px] py-px">
                        {log
                          ? <Check className="w-3 h-3 text-emerald-400" />
                          : <Minus className="w-3 h-3 text-slate-600" />}
                        <span className={log ? 'text-slate-300' : 'text-slate-600'}>
                          {key}
                        </span>
                        {candidates.length > 1 ? (
                          // PS8: explicit input pick — conditioned curves
                          // are never substituted silently
                          <select
                            className="rounded bg-slate-950 border border-slate-700 text-slate-300 px-1 text-[10px]"
                            data-testid={`petro-pick-${key}`}
                            value={log?.id || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => { e.stopPropagation(); onPickCurve(key, e.target.value); }}
                          >
                            {candidates.map((c) => (
                              <option key={c.id} value={c.id}>{c.mnemonic}{c.unit ? ` (${c.unit})` : ''}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={log ? 'text-slate-300' : 'text-slate-600'}>
                            {log ? ` · ${log.mnemonic}${log.unit ? ` (${log.unit})` : ''}` : ' — not in this well'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {!wells.length && (
          <p className="px-3 py-2 text-xs text-slate-600 leading-snug">
            No wells in the registry yet — import them in Well Data Manager first.
          </p>
        )}
      </ScrollArea>
    </div>
  );
}
