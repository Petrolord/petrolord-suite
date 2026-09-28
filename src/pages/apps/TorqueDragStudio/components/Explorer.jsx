// Explorer: wp sites → wellbores → T&D cases. Read-only over the WDS data
// spine; case CRUD lives here. The wellbore details block (trajectory
// source, header, survey listing) is shared with the other studios.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, MapPin, CircleDot, FlaskConical } from 'lucide-react';
import WellboreDetails from './WellboreDetails';
import { useThemeClass } from '@/design/themeClass';

export default function Explorer({
  sites, selectedSiteId, onSelectSite,
  wellbores, selectedWellboreId, onSelectWellbore,
  cases, selectedCaseId, onSelectCase, onNewCase, onDeleteCase,
  trajectory, caseLabel = 'T&D cases', testPrefix = 'td',
}) {
  // Design system (rollout W0B): theme roles inside an opted-in app; outside
  // a <ThemedApp> scope tc() returns the legacy strings unchanged.
  const tc = useThemeClass();
  const heading = tc('text-slate-500', 'text-pl-muted');
  const row = tc('hover:bg-slate-800', 'hover:bg-pl-sunken');
  const selected = tc('bg-slate-800 text-lime-300', 'bg-pl-primary/10 font-medium text-pl-primary-text');
  return (
    <div className={tc('flex h-full min-h-0 flex-col overflow-y-auto bg-slate-900/40 p-2 text-xs text-slate-300', 'flex h-full min-h-0 flex-col overflow-y-auto bg-pl-surface p-2 text-xs text-pl-text')}>
      <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${heading}`}>Sites</div>
      {(sites || []).map((s) => (
        <button key={s.id} type="button" onClick={() => onSelectSite(s.id)}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-left ${row} ${s.id === selectedSiteId ? selected : ''}`}>
          <MapPin className="h-3 w-3 shrink-0" /> {s.name}
        </button>
      ))}
      {sites && sites.length === 0 && (
        <div className={`px-2 py-1 ${heading}`}>No sites. Create wells in Well Design Studio first.</div>
      )}

      {selectedSiteId && (
        <>
          <div className={`mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide ${heading}`}>Wellbores</div>
          {(wellbores || []).map((w) => (
            <button key={w.id} type="button" onClick={() => onSelectWellbore(w.id)}
              data-testid={`${testPrefix}-wellbore-${w.name}`}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-left ${row} ${w.id === selectedWellboreId ? selected : ''}`}>
              <CircleDot className="h-3 w-3 shrink-0" /> {w.name}
              <span className={`ml-auto text-[9px] ${heading}`}>{w.depth_unit}</span>
            </button>
          ))}
        </>
      )}

      {selectedWellboreId && (
        <>
          <div className="mb-1 mt-3 flex items-center justify-between">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${heading}`}>{caseLabel}</span>
            <Button size="icon" variant="ghost" className={tc('h-5 w-5 text-slate-400 hover:text-lime-300', 'h-5 w-5 text-pl-muted hover:text-pl-primary-text')} onClick={onNewCase} data-testid={`${testPrefix}-new-case`}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          {(cases || []).map((c) => (
            <div key={c.id} className={`group flex items-center gap-1.5 rounded px-2 py-1 ${row} ${c.id === selectedCaseId ? selected : ''}`}>
              <button type="button" onClick={() => onSelectCase(c.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" data-testid={`${testPrefix}-case-${c.name}`}>
                <FlaskConical className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.name}</span>
              </button>
              <Button size="icon" variant="ghost" className={tc('h-5 w-5 text-slate-600 opacity-0 hover:text-red-400 group-hover:opacity-100', 'h-5 w-5 text-pl-muted opacity-0 hover:text-pl-danger-text focus-visible:opacity-100 group-hover:opacity-100')} onClick={() => onDeleteCase(c.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <WellboreDetails trajectory={trajectory} wellbore={(wellbores || []).find((w) => w.id === selectedWellboreId) || null} testPrefix={testPrefix} />
        </>
      )}
    </div>
  );
}
