// Perforating tab: gun selection + run-in clearance (through-tubing guns
// against the linked Completion Design through-bore; casing guns against
// the snapshotted casing program drift), the Karakas-Tariq skin breakdown,
// productivity ratio and the underbalance guideline band. Every number is
// the engine's — recomputed by the e2e spec through psRun.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import {
  GUN_CATALOG, gunFromCatalog, programFromCtCase, depthDisp, depthLabel,
} from '../services/psRun';

const IN = 0.0254;

const STATUS_CLASSES = {
  PASS: 'bg-emerald-500/15 text-emerald-300',
  WARN: 'bg-amber-500/15 text-amber-300',
  FAIL: 'bg-red-500/15 text-red-300',
};

const Status = ({ s, testId }) => (
  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASSES[s] || 'bg-slate-700 text-slate-300'}`} data-testid={testId}>{s}</span>
);

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

const Field = ({ label, value, onChange, step = 1, testId }) => (
  <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
    <span>{label}</span>
    <Input className="h-7 w-24 text-right text-xs" type="number" step={step} value={value}
      data-testid={testId} onChange={(e) => onChange(num(e.target.value))} />
  </label>
);

export default function PerforatingTab({
  caseDraft, onCaseChange, res, depthUnit, cdCases, ctCases,
}) {
  const unit = depthLabel(depthUnit);
  const r = caseDraft.params.reservoir;
  const cz = caseDraft.params.crushedZone;
  const perf = res?.perforation || null;
  const clr = res?.clearance || null;
  const gun = caseDraft.gun;

  const onPickGun = (name) => {
    const row = GUN_CATALOG.find((g) => g.name === name);
    if (row) onCaseChange((d) => { d.gun = gunFromCatalog(row); });
  };

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title="Gun (published-typical API target data; vendor sheets govern)" testId="ps-gun-card">
          <select className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
            value={gun.name} data-testid="ps-gun-select" onChange={(e) => onPickGun(e.target.value)}>
            {['through-tubing', 'casing'].map((conv) => (
              <optgroup key={conv} label={conv === 'through-tubing' ? 'Through-tubing (runs inside the completion)' : 'Casing guns (run before the completion)'}>
                {GUN_CATALOG.filter((g) => g.conveyance === conv).map((g) => (
                  <option key={g.name} value={g.name}>{g.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
            <div>OD <span className="float-right font-mono" data-testid="ps-gun-od">{gun.odIn.toFixed(3)}"</span></div>
            <div>Shot density <span className="float-right font-mono">{gun.spfPerFt} spf</span></div>
            <div>Phasing <span className="float-right font-mono">{gun.phasingDeg} deg</span></div>
            <div>Entrance hole <span className="float-right font-mono">{gun.entranceHoleIn.toFixed(2)}"</span></div>
            <div>Penetration <span className="float-right font-mono">{gun.penetrationIn.toFixed(0)}"</span></div>
            <div className="text-[10px] text-slate-500">nominal, API concrete target</div>
          </div>
        </Card>

        <Card title="Run-in clearance" testId="ps-clearance-card">
          {!clr ? <div className="text-xs text-slate-500">Fix the case inputs.</div> : (
            <div className="text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <Status s={clr.status} testId="ps-clearance-status" />
                <span className="text-[11px] text-slate-400">
                  {clr.basis === 'completion' ? 'through the completion bore' : 'through the casing drift to interval bottom'}
                </span>
              </div>
              {clr.missing ? (
                <div className="mt-1 text-[11px] text-amber-300">{clr.note}</div>
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div>Bore <span className="float-right font-mono" data-testid="ps-clearance-bore">{(clr.boreM / IN).toFixed(3)}"</span></div>
                  <div>Clearance <span className="float-right font-mono" data-testid="ps-clearance-mm">{(clr.clearanceM * 1000).toFixed(1)} mm</span></div>
                  <div className="text-[10px] text-slate-500">controls: {clr.controlling}</div>
                </div>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-800 pt-2">
                <label className="flex items-center justify-between gap-2">
                  <span>Completion case</span>
                  <select className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-xs"
                    value={caseDraft.cd_case_id || ''} data-testid="ps-cd-case"
                    onChange={(e) => onCaseChange((d) => { d.cd_case_id = e.target.value || null; })}>
                    <option value="">none linked</option>
                    {cdCases.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <div className="flex items-center justify-end gap-1">
                  {ctCases.map((c) => (
                    <Button key={c.id} size="sm" variant="outline" className="h-6 text-[10px]" data-testid="ps-snapshot-ct"
                      onClick={() => onCaseChange((d) => {
                        d.casing_program = { ...programFromCtCase(c), ct_case_id: c.id };
                      })}>
                      Snapshot "{c.name}"
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card title="Reservoir + crushed zone" testId="ps-reservoir-card">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Field label="k (mD)" value={r.kMd} testId="ps-k"
              onChange={(v) => onCaseChange((d) => { d.params.reservoir.kMd = v; })} />
            <Field label="kH/kV" value={r.khOverKv} step={0.1}
              onChange={(v) => onCaseChange((d) => { d.params.reservoir.khOverKv = v; })} />
            <Field label="re (m)" value={r.reM}
              onChange={(v) => onCaseChange((d) => { d.params.reservoir.reM = v; })} />
            <Field label="rw (m)" value={r.rwM} step={0.001}
              onChange={(v) => onCaseChange((d) => { d.params.reservoir.rwM = v; })} />
            <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
              <span>Fluid</span>
              <select className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-xs"
                value={r.fluid} onChange={(e) => onCaseChange((d) => { d.params.reservoir.fluid = e.target.value; })}>
                <option value="oil">oil</option>
                <option value="gas">gas</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
              <span>Crushed zone</span>
              <input type="checkbox" checked={!!cz.enabled}
                onChange={(e) => onCaseChange((d) => { d.params.crushedZone.enabled = e.target.checked; })} />
            </label>
            {cz.enabled && (
              <>
                <Field label={'Thickness (in)'} value={cz.thicknessIn} step={0.1}
                  onChange={(v) => onCaseChange((d) => { d.params.crushedZone.thicknessIn = v; })} />
                <Field label="k/kc" value={cz.kOverKc} step={0.5}
                  onChange={(v) => onCaseChange((d) => { d.params.crushedZone.kOverKc = v; })} />
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <Card title="Karakas-Tariq perforation skin (SPE 18247)" testId="ps-skin-card">
          {!perf ? <div className="text-xs text-slate-500">Fix the case inputs.</div> : (
            <div className="text-xs text-slate-300">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div>Plane flow s_h <span className="float-right font-mono" data-testid="ps-sh">{perf.skin.sH.toFixed(3)}</span></div>
                <div>Vertical s_v <span className="float-right font-mono" data-testid="ps-sv">{perf.skin.sV.toFixed(3)}</span></div>
                <div>Wellbore s_wb <span className="float-right font-mono" data-testid="ps-swb">{perf.skin.sWb.toFixed(3)}</span></div>
                <div>Crushed zone s_cz <span className="float-right font-mono" data-testid="ps-scz">{perf.skin.sCz.toFixed(3)}</span></div>
              </div>
              <div className="mt-2 border-t border-slate-800 pt-2 text-sm">
                Total perforation skin <span className="float-right font-mono font-semibold" data-testid="ps-skin-total">{perf.skin.total.toFixed(3)}</span>
              </div>
              {perf.skin.warnings.map((w, i) => (
                <div key={i} className="mt-1 text-[10px] text-amber-300">{w}</div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Productivity vs ideal openhole" testId="ps-pr-card">
          {perf && (
            <div className="text-xs text-slate-300">
              <div>Productivity ratio <span className="float-right font-mono" data-testid="ps-pr">{perf.pr.ratio.toFixed(3)}</span></div>
              <div className="mt-1 text-[10px] text-slate-500">
                Steady-state radial flow, ln(re/rw) = {perf.pr.lnReRw.toFixed(2)}. A ratio above 1 means the
                perforated completion beats the openhole ideal. Rates and operating points live in the
                {' '}<Link className="text-cyan-400 hover:underline" to="/dashboard/apps/production/nodal-analysis-studio">Nodal Analysis Studio</Link>.
              </div>
            </div>
          )}
        </Card>

        <Card title="Underbalance guideline (planning band)" testId="ps-underbalance-card">
          {perf && (
            <div className="text-xs text-slate-300">
              <div data-testid="ps-ub-band">
                {perf.underbalance.minPsi} to {perf.underbalance.maxPsi} psi ({perf.underbalance.fluid})
              </div>
              <div className="mt-1 text-[10px] text-slate-500">{perf.underbalance.classLabel}. {perf.underbalance.provenance}</div>
              {res?.sanding && res.sanding.governing && (
                <div className="mt-1 text-[10px] text-amber-300">
                  Check the Sanding tab: the drawdown margin at {Math.round(depthDisp(res.sanding.governing.mdM, depthUnit))} {unit} caps how much underbalance the rock takes.
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
