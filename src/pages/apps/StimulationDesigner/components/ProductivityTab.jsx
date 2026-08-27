// Productivity tab: dimensionless conductivity vs the UFD optimum,
// Cinco-Ley pseudo-skin, effective wellbore radius and folds of
// increase. Every number is the engine's — recomputed by the e2e spec
// through stRun.

import React from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { CFD_OPTIMUM } from '../services/stRun';

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

const Field = ({ label, value, onChange, step = 1 }) => (
  <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
    <span>{label}</span>
    <Input className="h-7 w-24 text-right text-xs" type="number" step={step} value={value}
      onChange={(e) => onChange(num(e.target.value))} />
  </label>
);

export default function ProductivityTab({ caseDraft, onCaseChange, res }) {
  const r = caseDraft.params.reservoir;
  const prod = res?.productivity || null;

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title="Reservoir" testId="st-reservoir-card">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Field label="k (mD)" value={r.kMd} step={0.5}
              onChange={(v) => onCaseChange((d) => { d.params.reservoir.kMd = v; })} />
            <Field label="re (m)" value={r.reM} step={50}
              onChange={(v) => onCaseChange((d) => { d.params.reservoir.reM = v; })} />
            <Field label="rw (m)" value={r.rwM} step={0.001}
              onChange={(v) => onCaseChange((d) => { d.params.reservoir.rwM = v; })} />
          </div>
        </Card>

        <Card title="Finite-conductivity fracture (Cinco-Ley & Samaniego)" testId="st-prod-card">
          {!prod ? (
            <div className="text-xs text-amber-300">Needs the closure stress for the proppant pack first.</div>
          ) : (
            <div className="text-xs text-slate-300">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div>C_fD <span className="float-right font-mono" data-testid="st-cfd">{prod.cfd.toFixed(3)}</span></div>
                <div>UFD optimum <span className="float-right font-mono">{CFD_OPTIMUM}</span></div>
                <div>Pseudo-skin s_f <span className="float-right font-mono" data-testid="st-sf">{prod.sF.toFixed(3)}</span></div>
                <div>Effective r'w <span className="float-right font-mono" data-testid="st-rwp">{prod.rwPrimeM.toFixed(1)} m</span></div>
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                {prod.cfd < CFD_OPTIMUM
                  ? 'Below the 1.6 optimum: for this proppant mass, a shorter wider frac carries more of the rate.'
                  : 'At or above the 1.6 optimum: for this proppant mass, added length pays more than added conductivity.'}
              </div>
              {prod.warnings.map((w, i) => (
                <div key={i} className="mt-1 text-[10px] text-amber-300">{w}</div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Folds of increase" testId="st-foi-card">
          {prod && (
            <div className="text-xs text-slate-300">
              <div>FOI vs unstimulated radial <span className="float-right font-mono font-semibold" data-testid="st-foi">{prod.pr.ratio.toFixed(2)}x</span></div>
              <div className="mt-1 text-[10px] text-slate-500">
                Steady-state radial identity ln(re/rw) = {prod.pr.lnReRw.toFixed(2)}, the same shared
                engine the Perforation designer uses. Rates and operating points live in the
                {' '}<Link className="text-cyan-400 hover:underline" to="/dashboard/apps/production/nodal-analysis-studio">Nodal Analysis Studio</Link>;
                perforation skin in the
                {' '}<Link className="text-cyan-400 hover:underline" to="/dashboard/apps/drilling/perforation-sand-control">Perforation &amp; Sand Control Designer</Link>.
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
