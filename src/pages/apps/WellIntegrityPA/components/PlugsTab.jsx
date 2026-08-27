// P&A Plugs tab: plug list + editor with the balanced-plug placement
// arithmetic and the D-010-style rule checks per flow zone.

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Trash2, Plus } from 'lucide-react';
import { plugRuleCheck, depthDisp, depthStore, depthLabel } from '../services/wiRun';

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

const select = 'h-7 rounded border border-slate-700 bg-slate-800 px-1 text-xs text-slate-200';

export default function PlugsTab({ caseDraft, onCaseChange, res, depthUnit }) {
  const plugs = caseDraft.pa.plugs || [];
  const [idx, setIdx] = useState(0);
  const sel = Math.min(idx, plugs.length - 1);
  const plug = plugs[sel] || null;
  const design = plug ? res?.program?.designs?.find((d) => d.name === plug.name) : null;
  const unit = depthLabel(depthUnit);

  const setPlug = (mutate) => onCaseChange((d) => { mutate(d.pa.plugs[sel]); });

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title="Plugs" testId="wi-plugs-card">
          <div className="flex flex-col gap-1">
            {plugs.map((p, i) => (
              <div key={p.name + i} className="flex items-center gap-2">
                <button type="button" data-testid={`wi-plug-${i}`}
                  onClick={() => setIdx(i)}
                  className={`flex-1 rounded px-2 py-1 text-left text-xs ${i === sel ? 'bg-lime-500/20 text-lime-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                  {p.name}
                  <span className="float-right font-mono">
                    {Math.round(depthDisp(p.topMdM, depthUnit))}-{Math.round(depthDisp(p.bottomMdM, depthUnit))} {unit}
                  </span>
                </button>
                <button type="button" className="text-slate-500 hover:text-red-400"
                  onClick={() => { onCaseChange((d) => { d.pa.plugs.splice(i, 1); }); setIdx(0); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" data-testid="wi-add-plug"
            className="mt-2 flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:text-slate-100"
            onClick={() => onCaseChange((d) => {
              d.pa.plugs.push({
                name: `Plug ${d.pa.plugs.length + 1}`, topMdM: 1000, bottomMdM: 1120,
                foundation: 'none', isSurfacePlug: false,
                geometry: { holeIdM: 0.216, stingerOdM: 0.127, stingerIdM: 0.1086, excessFrac: 0.2, spacerAheadM3: 1 },
              });
            })}>
            <Plus className="h-3 w-3" /> Add plug
          </button>
        </Card>

        {plug && (
          <Card title={`Plug editor (MD, ${unit})`} testId="wi-plug-editor">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <label className="col-span-2 flex items-center justify-between gap-2 text-xs text-slate-300">
                <span>Name</span>
                <Input className="h-7 w-48 text-xs" value={plug.name}
                  onChange={(e) => setPlug((p) => { p.name = e.target.value; })} />
              </label>
              <Field label={`Top MD (${unit})`} value={Math.round(depthDisp(plug.topMdM, depthUnit))} step={10} testId="wi-plug-top"
                onChange={(v) => setPlug((p) => { p.topMdM = depthStore(v, depthUnit); })} />
              <Field label={`Base MD (${unit})`} value={Math.round(depthDisp(plug.bottomMdM, depthUnit))} step={10} testId="wi-plug-bottom"
                onChange={(v) => setPlug((p) => { p.bottomMdM = depthStore(v, depthUnit); })} />
              <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
                <span>Foundation</span>
                <select className={select} value={plug.foundation} data-testid="wi-plug-foundation"
                  onChange={(e) => setPlug((p) => { p.foundation = e.target.value; })}>
                  <option value="none">none</option>
                  <option value="mechanical">mechanical plug</option>
                  <option value="tagged">tagged/verified</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={!!plug.isSurfacePlug}
                  onChange={(e) => setPlug((p) => { p.isSurfacePlug = e.target.checked; })} />
                Surface plug
              </label>
            </div>
            <div className="mt-2 border-t border-slate-800 pt-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Balanced plug geometry</div>
              {plug.geometry ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <Field label="Hole/casing ID (m)" value={plug.geometry.holeIdM} step={0.001}
                    onChange={(v) => setPlug((p) => { p.geometry.holeIdM = v; })} />
                  <Field label="Stinger OD (m)" value={plug.geometry.stingerOdM} step={0.001}
                    onChange={(v) => setPlug((p) => { p.geometry.stingerOdM = v; })} />
                  <Field label="Stinger ID (m)" value={plug.geometry.stingerIdM} step={0.001}
                    onChange={(v) => setPlug((p) => { p.geometry.stingerIdM = v; })} />
                  <Field label="Excess (frac)" value={plug.geometry.excessFrac} step={0.05} testId="wi-plug-excess"
                    onChange={(v) => setPlug((p) => { p.geometry.excessFrac = v; })} />
                  <Field label="Spacer ahead (m3)" value={plug.geometry.spacerAheadM3} step={0.1}
                    onChange={(v) => setPlug((p) => { p.geometry.spacerAheadM3 = v; })} />
                </div>
              ) : (
                <button type="button" className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:text-slate-100"
                  onClick={() => setPlug((p) => {
                    p.geometry = { holeIdM: 0.216, stingerOdM: 0.127, stingerIdM: 0.1086, excessFrac: 0.2, spacerAheadM3: 1 };
                  })}>
                  Add placement geometry
                </button>
              )}
            </div>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {design?.placement && (
          <Card title="Balanced plug placement" testId="wi-placement-card">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
              <div>Slurry volume <span className="float-right font-mono" data-testid="wi-slurry">{design.placement.slurryM3.toFixed(2)} m3</span></div>
              <div>Balanced height <span className="float-right font-mono" data-testid="wi-balanced-h">{design.placement.balancedHeightM.toFixed(1)} m</span></div>
              <div>Spacer behind <span className="float-right font-mono" data-testid="wi-spacer-behind">{design.placement.spacerBehindM3.toFixed(2)} m3</span></div>
              <div>Displacement <span className="float-right font-mono" data-testid="wi-displacement">{design.placement.displacementM3.toFixed(2)} m3</span></div>
              <div>Top while balanced <span className="float-right font-mono">{design.placement.asPumpedTopMdM.toFixed(0)} m MD</span></div>
              <div>Plug top after POOH <span className="float-right font-mono" data-testid="wi-plugtop">{design.placement.pluggedTopMdM.toFixed(0)} m MD</span></div>
            </div>
            {design.placement.warnings.map((w) => (
              <div key={w} className="mt-1 text-xs text-amber-400">{w}</div>
            ))}
            <div className="mt-2 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
              Classic balanced-plug arithmetic on the entered capacities; slurry design (density,
              yield, additives) belongs to the cementing program.
            </div>
          </Card>
        )}

        {plug && !plug.isSurfacePlug && (
          <Card title="Rule checks per flow zone (D-010 conventions)" testId="wi-plug-rules">
            {(caseDraft.pa.zones || []).filter((z) => z.flowPotential).map((z) => {
              const check = plugRuleCheck({ plug, sourceTopMdM: z.topMdM });
              return (
                <div key={z.name} className="mb-2">
                  <div className="text-xs font-semibold text-slate-300">{z.name}</div>
                  {check.checks.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className={c.pass ? 'text-emerald-400' : 'text-red-400'}>{c.pass ? 'PASS' : 'FAIL'}</span>
                      <span className="text-slate-400">{c.label}</span>
                      <span className="ml-auto font-mono text-slate-500">{Math.round(c.actualM)} m</span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="text-[10px] text-slate-500">
              Defaults follow the commonly cited NORSOK D-010 rev 4 conventions; the standard
              document governs.
            </div>
          </Card>
        )}
        {plug?.isSurfacePlug && (
          <Card title="Surface plug rule" testId="wi-surface-rule">
            {(() => {
              const check = plugRuleCheck({ plug });
              return check.checks.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className={c.pass ? 'text-emerald-400' : 'text-red-400'}>{c.pass ? 'PASS' : 'FAIL'}</span>
                  <span className="text-slate-400">{c.label}</span>
                </div>
              ));
            })()}
          </Card>
        )}
      </div>
    </div>
  );
}
