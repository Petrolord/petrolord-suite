// MEM Profiles tab: stress + UCS tracks, quality score, gm-1.0.0 publish.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, UploadCloud } from 'lucide-react';
import { StressProfileChart, UcsChart } from '../charts/GmCharts';

export default function ProfilesTab({
  mem, depthUnit, onRun, running, error, onPublish, publishing, canPublish,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8 bg-lime-500 text-slate-900 hover:bg-lime-600" onClick={onRun} disabled={running} data-testid="gm-run-mem">
          <Play className="mr-1 h-3.5 w-3.5" /> {running ? 'Computing…' : 'Build MEM'}
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onPublish}
          disabled={!mem || publishing || !canPublish} data-testid="gm-publish">
          <UploadCloud className="mr-1 h-3.5 w-3.5" /> {publishing ? 'Publishing…' : 'Publish SHMIN/SHMAX/UCS'}
        </Button>
        {error && <span className="text-xs text-red-400" data-testid="gm-error">{error}</span>}
      </div>

      {mem && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 text-xs">
          <div className={`rounded-md border px-3 py-2 ${mem.quality.score < 80 ? 'border-amber-700 bg-amber-950/40' : 'border-slate-800 bg-slate-900/60'}`}>
            <div className="text-[9px] uppercase text-slate-500">Quality score</div>
            <div className="text-sm font-semibold text-slate-100" data-testid="gm-quality">{mem.quality.score}</div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
            <div className="text-[9px] uppercase text-slate-500">PP / Sv source</div>
            <div className="text-sm font-semibold text-slate-100">{mem.baseProvenance}</div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
            <div className="text-[9px] uppercase text-slate-500">UCS</div>
            <div className="text-[11px] font-semibold text-slate-100">{mem.ucsProvenance}</div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
            <div className="text-[9px] uppercase text-slate-500">Frictional clamps</div>
            <div className="text-sm font-semibold text-slate-100">{mem.clampedCount}</div>
          </div>
        </div>
      )}

      {mem && mem.warnings.length > 0 && (
        <div className="rounded-md border border-amber-800 bg-amber-950/40 p-2 text-xs text-amber-300">
          {mem.warnings.map((w) => <div key={w}>• {w}</div>)}
        </div>
      )}

      {mem && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2" style={{ minHeight: 440 }}>
          <StressProfileChart profile={mem.profile} depthUnit={depthUnit} />
          <UcsChart profile={mem.profile} depthUnit={depthUnit} />
        </div>
      )}
    </div>
  );
}
