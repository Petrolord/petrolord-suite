// Centralization tab: centralizer config, standoff profile, required spacing.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlignVerticalSpaceAround } from 'lucide-react';
import { StandoffChart } from '../charts/CmtCharts';
import { API_TARGET_STANDOFF } from '../engine/cementing';

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};
const cell = 'h-8 bg-slate-950 border-slate-700 text-xs text-slate-200';

export default function CentralizationTab({
  caseDraft, onCaseChange, depthUnit, standoffResult, onRun, running, error,
}) {
  const cent = caseDraft.centralizers || {};
  const setCent = (patch) => onCaseChange({ centralizers: { ...cent, ...patch } });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
          Type
          <Select value={cent.type || 'bow'} onValueChange={(t) => setCent({ type: t })}>
            <SelectTrigger className={`${cell} w-32`} data-testid="cmt-cent-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bow">Bow spring</SelectItem>
              <SelectItem value="rigid">Rigid</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
          Spacing (m)
          <Input type="number" step="any" className={`${cell} w-24 text-right`} value={cent.spacingM ?? 12}
            onChange={(e) => setCent({ spacingM: num(e.target.value) })} data-testid="cmt-spacing" />
        </label>
        {(cent.type || 'bow') === 'bow' ? (
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            Restoring force (N)
            <Input type="number" step="any" className={`${cell} w-28 text-right`} value={cent.restoringForceN ?? 8900}
              onChange={(e) => setCent({ restoringForceN: num(e.target.value) })} />
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            Blade OD (in)
            <Input type="number" step="any" className={`${cell} w-24 text-right`}
              value={cent.bladeOdM ? +(cent.bladeOdM / 0.0254).toFixed(3) : ''}
              onChange={(e) => setCent({ bladeOdM: num(e.target.value) * 0.0254 })} />
          </label>
        )}
        <Button size="sm" className="h-8 bg-lime-500 text-slate-900 hover:bg-lime-600" onClick={onRun} disabled={running} data-testid="cmt-standoff-run">
          <AlignVerticalSpaceAround className="mr-1 h-3.5 w-3.5" /> {running ? 'Computing…' : 'Compute standoff'}
        </Button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {standoffResult && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 text-xs">
          <div className={`rounded-md border px-3 py-2 ${standoffResult.profile.minStandoff < API_TARGET_STANDOFF ? 'border-amber-700 bg-amber-950/40' : 'border-slate-800 bg-slate-900/60'}`}>
            <div className="text-[9px] uppercase text-slate-500">Min standoff</div>
            <div className="text-sm font-semibold text-slate-100" data-testid="cmt-min-standoff">
              {(100 * standoffResult.profile.minStandoff).toFixed(0)} %
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
            <div className="text-[9px] uppercase text-slate-500">API target</div>
            <div className="text-sm font-semibold text-slate-100">{(100 * API_TARGET_STANDOFF).toFixed(0)} %</div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
            <div className="text-[9px] uppercase text-slate-500">Max spacing for 67%</div>
            <div className="text-sm font-semibold text-slate-100" data-testid="cmt-req-spacing">
              {standoffResult.requiredSpacingM != null ? `${standoffResult.requiredSpacingM.toFixed(1)} m` : 'not achievable'}
            </div>
          </div>
        </div>
      )}

      {standoffResult && (
        <div className="min-h-0 flex-1" style={{ minHeight: 400 }}>
          <StandoffChart profile={standoffResult.profile} depthUnit={depthUnit} />
        </div>
      )}
      <div className="text-[10px] text-slate-500">
        API 10D convention: lateral load from buoyed weight and inclination, linear bow-spring
        stiffness from the quoted restoring force at 67% standoff, fixed-end beam sag between
        centralizers. The tension times dogleg lateral load term is not yet modeled.
      </div>
    </div>
  );
}
