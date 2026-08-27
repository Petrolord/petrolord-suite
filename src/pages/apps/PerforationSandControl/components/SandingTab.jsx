// Sanding tab: the critical-drawdown screening along the interval from
// the published gm-1.0.0/pp-1.0.0 curves, plus the immutable run history.
// SCREENING GRADE by construction — the banner says so. Every number is
// the engine's — recomputed by the e2e spec through psRun.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash } from 'lucide-react';
import { depthDisp, depthLabel } from '../services/psRun';
import { CdpChart } from '../charts/PsCharts';

const Card = ({ title, children, testId }) => (
  <div className="rounded border border-slate-800 bg-slate-900/40" data-testid={testId}>
    <div className="border-b border-slate-800 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
    <div className="p-2">{children}</div>
  </div>
);

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

export default function SandingTab({
  caseDraft, onCaseChange, res, depthUnit, curvesMissing,
  onSaveRun, savingRun, runs, onDeleteRun,
}) {
  const unit = depthLabel(depthUnit);
  const s = caseDraft.params.sanding;
  const sanding = res?.sanding || null;

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title="Model (screening grade; calibrate the strength boost to TWC tests)" testId="ps-sanding-model">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
            <label className="flex items-center justify-between gap-2">
              <span>Cavity geometry</span>
              <select className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-xs"
                value={s.geometry} data-testid="ps-geometry"
                onChange={(e) => onCaseChange((d) => { d.params.sanding.geometry = e.target.value; })}>
                <option value="perf-tunnel">perf tunnel (cased and perforated)</option>
                <option value="openhole">openhole / standalone screen</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Strength boost</span>
              <Input className="h-7 w-20 text-right text-xs" type="number" step={0.1} value={s.boostFactor}
                data-testid="ps-boost"
                onChange={(e) => onCaseChange((d) => { d.params.sanding.boostFactor = num(e.target.value); })} />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span>Step ({unit})</span>
              <Input className="h-7 w-20 text-right text-xs" type="number" value={s.stepMdM}
                onChange={(e) => onCaseChange((d) => { d.params.sanding.stepMdM = Math.max(1, num(e.target.value)); })} />
            </label>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            Kirsch hoop stress at the cavity wall vs effective strength; onset when the flowing
            pressure drops below the critical pwf. Worst-case tunnel azimuth for the perf-tunnel
            geometry. This is a screening criterion, not a sand-rate prediction.
          </div>
        </Card>

        <Card title="Governing point" testId="ps-governing-card">
          {curvesMissing ? (
            <div className="text-xs text-amber-300" data-testid="ps-curves-missing">
              Missing published {curvesMissing} curve. Publish SHMIN/SHMAX/UCS from Geomechanics
              Studio and PP/OBG from Pore Pressure Studio for this wellbore.
            </div>
          ) : !sanding ? (
            <div className="text-xs text-slate-500">No published curves loaded.</div>
          ) : (
            <div className="text-xs text-slate-300">
              <div>MD <span className="float-right font-mono" data-testid="ps-gov-md">{Math.round(depthDisp(sanding.governing.mdM, depthUnit))} {unit}</span></div>
              <div>Critical pwf <span className="float-right font-mono" data-testid="ps-gov-pwf">{(sanding.governing.pwfCritPa / 1e6).toFixed(2)} MPa</span></div>
              <div>Reservoir pressure <span className="float-right font-mono">{(sanding.governing.ppPa / 1e6).toFixed(2)} MPa</span></div>
              <div className="mt-1 border-t border-slate-800 pt-1">
                Drawdown margin <span className={`float-right font-mono font-semibold ${sanding.governing.cdpPa < 0 ? 'text-red-400' : ''}`} data-testid="ps-gov-cdp">{(sanding.governing.cdpPa / 1e6).toFixed(2)} MPa</span>
              </div>
              {sanding.governing.cdpPa < 0 && (
                <div className="mt-1 text-[10px] text-red-400">Sanding indicated at any drawdown: plan sand control, not sand avoidance.</div>
              )}
            </div>
          )}
        </Card>

        <Card title="Run history (immutable)" testId="ps-runs-card">
          <div className="mb-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSaveRun}
              disabled={savingRun || !res} data-testid="ps-save-run">
              Save run
            </Button>
          </div>
          <div className="flex flex-col gap-1" data-testid="ps-run-rows">
            {(runs || []).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded border border-slate-800 px-2 py-1 text-[11px] text-slate-400">
                <span>{new Date(r.created_at).toLocaleString()} · skin {r.summary?.totalSkin?.toFixed?.(2) ?? '--'} · {r.summary?.status ?? '--'}</span>
                <button type="button" className="text-slate-600 hover:text-red-400" onClick={() => onDeleteRun(r.id)}>
                  <Trash className="h-3 w-3" />
                </button>
              </div>
            ))}
            {!runs?.length && <div className="text-[11px] text-slate-600">No runs saved yet.</div>}
          </div>
        </Card>
      </div>

      <div className="min-h-[420px]">
        <CdpChart sanding={sanding} depthUnit={depthUnit} />
      </div>
    </div>
  );
}
