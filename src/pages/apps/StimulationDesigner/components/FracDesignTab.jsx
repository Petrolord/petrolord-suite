// Frac Design tab: treatment interval + rock context from the published
// curves, geometry inputs, PKN/KGD toggle, width/net-pressure results
// and the width profile chart. Every number is the engine's — recomputed
// by the e2e spec through stRun.

import React from 'react';
import { Input } from '@/components/ui/input';
import { depthDisp, depthStore, depthLabel } from '../services/stRun';
import { WidthProfileChart } from '../charts/StCharts';

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

const MPa = (v) => (v == null ? '--' : (v / 1e6).toFixed(2));

export default function FracDesignTab({ caseDraft, onCaseChange, res, depthUnit }) {
  const unit = depthLabel(depthUnit);
  const f = caseDraft.frac;
  const rock = res?.rock || null;
  const geo = res?.geometry || null;

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title={`Treatment interval (MD, ${unit}) + rock context`} testId="st-rock-card">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span>Top</span>
            <Input className="h-7 w-24 text-xs" type="number" data-testid="st-interval-top"
              value={Math.round(depthDisp(caseDraft.interval.topMdM, depthUnit))}
              onChange={(e) => onCaseChange((d) => { d.interval.topMdM = depthStore(num(e.target.value), depthUnit); })} />
            <span>Bottom</span>
            <Input className="h-7 w-24 text-xs" type="number" data-testid="st-interval-bottom"
              value={Math.round(depthDisp(caseDraft.interval.bottomMdM, depthUnit))}
              onChange={(e) => onCaseChange((d) => { d.interval.bottomMdM = depthStore(num(e.target.value), depthUnit); })} />
          </div>
          {rock && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-800 pt-2 text-xs text-slate-300">
              <div>Closure (SHMIN) <span className="float-right font-mono" data-testid="st-closure">{MPa(rock.closurePa)} MPa</span></div>
              <div>Reservoir p (PP) <span className="float-right font-mono" data-testid="st-pres">{MPa(rock.pResPa)} MPa</span></div>
              <div className="col-span-2 text-[10px] text-slate-500">
                {rock.source === 'published'
                  ? `From the published gm-1.0.0/pp-1.0.0 curves at ${Math.round(rock.midTvdM)} m TVD.`
                  : rock.source === 'manual'
                    ? 'Manual overrides in use.'
                    : 'Missing published curves: publish SHMIN from Geomechanics Studio and PP from Pore Pressure Studio, or the cards below stay dark.'}
              </div>
            </div>
          )}
        </Card>

        <Card title="Rock, fluid and pumping" testId="st-inputs-card">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Field label="E (GPa)" value={f.ePa / 1e9} step={1}
              onChange={(v) => onCaseChange((d) => { d.frac.ePa = v * 1e9; })} />
            <Field label="Poisson nu" value={f.nu} step={0.01}
              onChange={(v) => onCaseChange((d) => { d.frac.nu = v; })} />
            <Field label="Fluid mu (Pa.s)" value={f.muPaS} step={0.05}
              onChange={(v) => onCaseChange((d) => { d.frac.muPaS = v; })} />
            <Field label="Rate qi (m3/s)" value={f.qiM3s} step={0.005}
              onChange={(v) => onCaseChange((d) => { d.frac.qiM3s = v; })} />
            <Field label="Target xf (m)" value={f.xfM} step={10} testId="st-xf"
              onChange={(v) => onCaseChange((d) => { d.frac.xfM = v; })} />
            <Field label="Height hf (m)" value={f.hfM} step={5}
              onChange={(v) => onCaseChange((d) => { d.frac.hfM = v; })} />
          </div>
          {res && (
            <div className="mt-2 border-t border-slate-800 pt-2 text-xs text-slate-300">
              Plane strain E' <span className="float-right font-mono">{(res.ePrimePa / 1e9).toFixed(2)} GPa</span>
            </div>
          )}
        </Card>

        <Card title="2D model" testId="st-model-card">
          <div className="flex gap-1">
            {['pkn', 'kgd'].map((m) => (
              <button key={m} type="button" data-testid={`st-model-${m}`}
                onClick={() => onCaseChange((d) => { d.frac.model = m; })}
                className={`rounded px-3 py-1 text-xs uppercase ${f.model === m ? 'bg-lime-500/20 text-lime-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                {m}
              </button>
            ))}
          </div>
          {geo && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
              <div>Max width <span className="float-right font-mono" data-testid="st-wmax">{(geo.wMaxM * 1000).toFixed(2)} mm</span></div>
              <div>Average width <span className="float-right font-mono">{(geo.wAvgM * 1000).toFixed(2)} mm</span></div>
              <div>Net pressure <span className="float-right font-mono" data-testid="st-pnet">{MPa(geo.pNetPa)} MPa</span></div>
              <div>BH treating p <span className="float-right font-mono" data-testid="st-bhtp">{MPa(geo.bhtpPa)} MPa</span></div>
              <div className="col-span-2 text-[10px] text-slate-500">
                Newtonian 2D widths at the target half-length; hydrostatic and pipe or perforation
                friction are not included here.
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="min-h-[420px]">
        <WidthProfileChart geometry={geo} xfM={f.xfM} />
      </div>
    </div>
  );
}
