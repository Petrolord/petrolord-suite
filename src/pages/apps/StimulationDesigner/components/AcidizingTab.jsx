// Acidizing tab: Hawkins damage removal (sandstone volumetric front),
// carbonate wormhole skin, the matrix-rate ceiling, and the immutable
// run history. Screening grade by construction. Every number is the
// engine's — recomputed by the e2e spec through stRun.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash } from 'lucide-react';

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

const Field = ({ label, value, onChange, step = 0.1, testId }) => (
  <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
    <span>{label}</span>
    <Input className="h-7 w-24 text-right text-xs" type="number" step={step} value={value}
      data-testid={testId} onChange={(e) => onChange(num(e.target.value))} />
  </label>
);

export default function AcidizingTab({
  caseDraft, onCaseChange, res, onSaveRun, savingRun, runs, onDeleteRun,
}) {
  const a = caseDraft.acid;
  const acid = res?.acid || null;

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title="Sandstone damage removal (Hawkins + volumetric front)" testId="st-sandstone-card">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Field label="Damage k/ks" value={a.kOverKs} step={0.5}
              onChange={(v) => onCaseChange((d) => { d.acid.kOverKs = v; })} />
            <Field label="Damage radius rs (m)" value={a.rsM}
              onChange={(v) => onCaseChange((d) => { d.acid.rsM = v; })} />
            <Field label="Acid radius ra (m)" value={a.raM} testId="st-ra"
              onChange={(v) => onCaseChange((d) => { d.acid.raM = v; })} />
            <Field label="Porosity" value={a.porosity} step={0.01}
              onChange={(v) => onCaseChange((d) => { d.acid.porosity = v; })} />
            <Field label="Pore volumes" value={a.pvFactor}
              onChange={(v) => onCaseChange((d) => { d.acid.pvFactor = v; })} />
          </div>
          {acid && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-800 pt-2 text-xs text-slate-300">
              <div>Skin before <span className="float-right font-mono" data-testid="st-sbefore">{acid.sandstone.sBefore.toFixed(2)}</span></div>
              <div>Skin after <span className="float-right font-mono" data-testid="st-safter">{acid.sandstone.sAfter.toFixed(2)}</span></div>
              <div>Acid volume <span className="float-right font-mono" data-testid="st-acid-vol">{acid.sandstone.volumeM3.toFixed(1)} m3</span></div>
              <div className="text-[10px] text-slate-500">
                {acid.sandstone.removed ? 'Front reaches past the damage: skin removed.' : 'Partial removal: push ra past rs to zero the skin.'}
              </div>
            </div>
          )}
        </Card>

        <Card title="Carbonate wormholing (lab-calibrated PV_bt)" testId="st-carbonate-card">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Field label="Acid volume (m3)" value={a.volumeM3} step={1}
              onChange={(v) => onCaseChange((d) => { d.acid.volumeM3 = v; })} />
            <Field label="PV_bt" value={a.pvBt}
              onChange={(v) => onCaseChange((d) => { d.acid.pvBt = v; })} />
          </div>
          {acid && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-800 pt-2 text-xs text-slate-300">
              <div>Wormhole radius <span className="float-right font-mono">{acid.carbonate.rWhM.toFixed(2)} m</span></div>
              <div>Stimulation skin <span className="float-right font-mono" data-testid="st-carb-skin">{acid.carbonate.skin.toFixed(2)}</span></div>
              <div className="col-span-2 text-[10px] text-slate-500">
                PV_bt comes from core tests at the optimal interstitial velocity; the default is a
                placeholder until the lab number exists.
              </div>
            </div>
          )}
        </Card>

        <Card title="Matrix injection ceiling" testId="st-matrix-card">
          {!acid?.matrixRate ? (
            <div className="text-xs text-amber-300">Needs closure and reservoir pressure from the published curves.</div>
          ) : (
            <div className="text-xs text-slate-300">
              <div>Max rate below frac <span className="float-right font-mono" data-testid="st-qmax">{(acid.matrixRate.qM3s * 60000).toFixed(0)} L/min</span></div>
              <div className="mt-1 text-[10px] text-slate-500">
                Steady-state Darcy with p_wf held at closure; stay under it or you are fracturing,
                not matrix acidizing.
              </div>
            </div>
          )}
        </Card>

        <Card title="Run history (immutable)" testId="st-runs-card">
          <div className="mb-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSaveRun}
              disabled={savingRun || !res} data-testid="st-save-run">
              Save run
            </Button>
          </div>
          <div className="flex flex-col gap-1" data-testid="st-run-rows">
            {(runs || []).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded border border-slate-800 px-2 py-1 text-[11px] text-slate-400">
                <span>{new Date(r.created_at).toLocaleString()} · {r.summary?.status ?? '--'} · FOI {r.summary?.foi?.toFixed?.(2) ?? '--'}</span>
                <button type="button" className="text-slate-600 hover:text-red-400" onClick={() => onDeleteRun(r.id)}>
                  <Trash className="h-3 w-3" />
                </button>
              </div>
            ))}
            {!runs?.length && <div className="text-[11px] text-slate-600">No runs saved yet.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
