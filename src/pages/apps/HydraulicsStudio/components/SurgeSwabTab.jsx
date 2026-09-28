// Surge & Swab tab: trip-speed sweep against the mud window, safe-speed
// readout, closed/open ended mode.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Gauge, AlertTriangle } from 'lucide-react';
import { SurgeSwabChart } from '../charts/HydCharts';
import { emwOut, emwLabel } from '../services/hydRun';

export default function SurgeSwabTab({
  caseDraft, onCaseChange, depthUnit, surge, onRun, running, error, safeSpeed, limits,
}) {
  const trip = caseDraft.trip || {};

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={trip.mode || 'closed'} onValueChange={(m) => onCaseChange({ trip: { ...trip, mode: m } })}>
          <SelectTrigger className="h-8 w-56 text-xs" data-testid="hyd-trip-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="closed">Closed ended (worst case)</SelectItem>
            <SelectItem value="open">Open ended</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8" onClick={onRun} disabled={running} data-testid="hyd-surge-run">
          <Gauge className="mr-1 h-3.5 w-3.5" /> {running ? 'Running…' : 'Sweep trip speeds'}
        </Button>
        {error && <span className="text-xs text-pl-danger-text">{error}</span>}
      </div>

      {surge && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 text-xs">
          <div className="rounded-md border border-pl-border bg-pl-surface px-3 py-2">
            <div className="text-[9px] uppercase text-pl-muted">Surge at 0.5 m/s</div>
            <div className="font-pl-mono text-sm font-semibold tabular-nums text-pl-text" data-testid="hyd-surge-05">
              {emwOut(surge.sweep.find((r) => Math.abs(r.tripSpeedMs - 0.5) < 1e-9)?.surgeEmwKgM3 ?? NaN, depthUnit).toFixed(3)} {emwLabel(depthUnit)}
            </div>
          </div>
          <div className="rounded-md border border-pl-border bg-pl-surface px-3 py-2">
            <div className="text-[9px] uppercase text-pl-muted">Swab at 0.5 m/s</div>
            <div className="font-pl-mono text-sm font-semibold tabular-nums text-pl-text" data-testid="hyd-swab-05">
              {emwOut(surge.sweep.find((r) => Math.abs(r.tripSpeedMs - 0.5) < 1e-9)?.swabEmwKgM3 ?? NaN, depthUnit).toFixed(3)} {emwLabel(depthUnit)}
            </div>
          </div>
          <div className={`rounded-md border px-3 py-2 ${safeSpeed != null && safeSpeed < 0.3 ? 'border-pl-warning/40 bg-pl-warning-bg' : 'border-pl-border bg-pl-surface'}`}>
            <div className="flex items-center gap-1 text-[9px] uppercase text-pl-muted">{safeSpeed != null && safeSpeed < 0.3 && <AlertTriangle className="h-3 w-3 shrink-0 text-pl-warning-text" aria-label="Warning" />}Max safe trip speed</div>
            <div className="font-pl-mono text-sm font-semibold tabular-nums text-pl-text" data-testid="hyd-safe-speed">
              {safeSpeed != null ? `${safeSpeed.toFixed(2)} m/s` : 'no PP/FP limits'}
            </div>
          </div>
          <div className="rounded-md border border-pl-border bg-pl-surface px-3 py-2">
            <div className="text-[9px] uppercase text-pl-muted">Limits at bit</div>
            <div className="font-pl-mono text-sm font-semibold tabular-nums text-pl-text">
              {limits?.poreEmwKgM3 != null
                ? `PP ${emwOut(limits.poreEmwKgM3, depthUnit).toFixed(2)} / FP ${limits.fracEmwKgM3 != null ? emwOut(limits.fracEmwKgM3, depthUnit).toFixed(2) : '--'}`
                : 'none published'}
            </div>
          </div>
        </div>
      )}

      {surge && (
        <div className="min-h-0 flex-1" style={{ minHeight: 400 }}>
          <SurgeSwabChart sweep={surge.sweep} depthUnit={depthUnit}
            staticDensityKgM3={caseDraft.mud?.densityKgM3 || 0}
            poreEmw={limits?.poreEmwKgM3} fracEmw={limits?.fracEmwKgM3} />
        </div>
      )}
      <div className="text-[10px] text-pl-muted">
        Steady-state Burkhardt model with clinging constant 0.45. Closed ended assumes a plugged bit
        (float or packed nozzles) and is the conservative planning case.
      </div>
    </div>
  );
}
