// Explorer: wp sites → wellbores → T&D cases. Read-only over the WDS data
// spine; case CRUD lives here.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, MapPin, CircleDot, FlaskConical } from 'lucide-react';

export default function Explorer({
  sites, selectedSiteId, onSelectSite,
  wellbores, selectedWellboreId, onSelectWellbore,
  cases, selectedCaseId, onSelectCase, onNewCase, onDeleteCase,
  trajectory,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-slate-900/40 p-2 text-xs text-slate-300">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sites</div>
      {(sites || []).map((s) => (
        <button key={s.id} type="button" onClick={() => onSelectSite(s.id)}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-slate-800 ${s.id === selectedSiteId ? 'bg-slate-800 text-lime-300' : ''}`}>
          <MapPin className="h-3 w-3 shrink-0" /> {s.name}
        </button>
      ))}
      {sites && sites.length === 0 && (
        <div className="px-2 py-1 text-slate-500">No sites. Create wells in Well Design Studio first.</div>
      )}

      {selectedSiteId && (
        <>
          <div className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Wellbores</div>
          {(wellbores || []).map((w) => (
            <button key={w.id} type="button" onClick={() => onSelectWellbore(w.id)}
              data-testid={`td-wellbore-${w.name}`}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-slate-800 ${w.id === selectedWellboreId ? 'bg-slate-800 text-lime-300' : ''}`}>
              <CircleDot className="h-3 w-3 shrink-0" /> {w.name}
              <span className="ml-auto text-[9px] text-slate-500">{w.depth_unit}</span>
            </button>
          ))}
        </>
      )}

      {selectedWellboreId && (
        <>
          <div className="mb-1 mt-3 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">T&D cases</span>
            <Button size="icon" variant="ghost" className="h-5 w-5 text-slate-400 hover:text-lime-300" onClick={onNewCase} data-testid="td-new-case">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          {(cases || []).map((c) => (
            <div key={c.id} className={`group flex items-center gap-1.5 rounded px-2 py-1 hover:bg-slate-800 ${c.id === selectedCaseId ? 'bg-slate-800 text-lime-300' : ''}`}>
              <button type="button" onClick={() => onSelectCase(c.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" data-testid={`td-case-${c.name}`}>
                <FlaskConical className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.name}</span>
              </button>
              <Button size="icon" variant="ghost" className="h-5 w-5 text-slate-600 opacity-0 hover:text-red-400 group-hover:opacity-100" onClick={() => onDeleteCase(c.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="mt-3 border-t border-slate-800 pt-2 text-[10px] text-slate-500" data-testid="td-traj-info">
            {trajectory?.design
              ? `Trajectory: ${trajectory.design.name} r${trajectory.design.revision} (definitive), ${trajectory.stations.length} stations`
              : 'No definitive design on this wellbore.'}
          </div>
        </>
      )}
    </div>
  );
}
