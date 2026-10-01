// Wells + curve-inventory explorer (Rock Physics Studio G6.4, the
// PetroWorkstation explorer idiom): registry wells with org badges;
// the selected well expands its curve inventory showing which engine
// inputs mapped (DEPT/DT/DTS/RHOB/PHIE/PHIT/VSH/SW) and, since RP-U1, how
// the curves were read (units, nulls). Presentational —
// state lives in RockWorkstation.

import React from 'react';
import { CircleDot, Building2, Lock, Loader2, Check, Minus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function WellExplorer({
  wells, selectedId, loadingId, curveInventory, published = [], readNotes = [], onSelect,
}) {
  return (
    <div className="h-full min-h-0 flex flex-col bg-pl-surface" data-testid="rp-explorer">
      <div className="px-2.5 py-1.5 text-[11px] uppercase tracking-wider text-pl-muted border-b border-pl-border">
        Registry wells <span data-testid="rp-well-count">{wells.length}</span>
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
                data-testid="rp-well-row"
                data-well-name={w.name}
                className={`flex items-center gap-1.5 pl-2.5 pr-2 py-[3px] text-[13px] cursor-pointer
                  select-none min-w-0
                  ${selected ? 'bg-pl-primary/10 text-pl-primary-text' : 'text-pl-text hover:bg-pl-sunken'}`}
                onClick={() => onSelect(w.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect(w.id); }}
              >
                <CircleDot className="w-3.5 h-3.5 shrink-0 text-pl-muted" />
                <span className="truncate">{w.name}</span>
                <span
                  title={shared ? `Shared with the organization${w.is_own ? '' : ' (read-only for you)'}` : 'Private'}
                  className={`ml-1 inline-flex items-center gap-0.5 rounded px-1 text-[10px]
                    ${shared ? 'bg-pl-success-bg text-pl-success-text' : 'bg-pl-sunken text-pl-muted'}`}
                >
                  {shared ? <Building2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                </span>
                {w.id === loadingId && <Loader2 className="ml-auto w-3.5 h-3.5 animate-spin text-pl-muted" />}
              </div>
              {selected && curveInventory && (
                <div className="pl-7 pb-1" data-testid="rp-curve-inventory">
                  {curveInventory.map(({ key, log }) => (
                    <div key={key} className="flex items-center gap-1.5 text-[11px] py-px">
                      {log
                        ? <Check className="w-3 h-3 text-pl-success" />
                        : <Minus className="w-3 h-3 text-pl-muted" />}
                      <span className={log ? 'text-pl-text' : 'text-pl-muted'}>
                        {key}
                        {log ? ` · ${log.mnemonic}${log.unit ? ` (${log.unit})` : ''}` : ': not in this well'}
                      </span>
                    </div>
                  ))}
                  {readNotes.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-[11px] text-pl-warning-text" data-testid="rp-read-notes" title="How the curves were read (RP-U1-003): units, nulls and porosity">
                      {readNotes.map((t) => <li key={t}>{t}</li>)}
                    </ul>
                  )}
                  {published.length > 0 && (
                    <div className="mt-1 text-[11px] text-pl-success-text" data-testid="rp-published-curves" title="Curves this app has written to the well (fluid-substituted case)">
                      published: {published.map((l) => l.mnemonic).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!wells.length && (
          <p className="px-3 py-2 text-xs text-pl-muted leading-snug">
            No wells in the registry yet. Import them in Well Data Manager first.
          </p>
        )}
      </ScrollArea>
    </div>
  );
}
