// Builder dock (Earth Modeling G8.2): everything that DEFINES the
// model — per-surface tie tops, the zone table (registry-zone
// mapping), population methods + variogram, fault-polygon drawing, and
// model save/load. The definition is small persistable state; grids
// are recomputed, never stored (plan decision 2).

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

const selCls = 'w-full rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';
const inCls = selCls;
const secCls = 'text-[10px] uppercase tracking-wider text-slate-500 pt-2';
const btnCls = 'w-full px-2 py-1 rounded border text-xs disabled:opacity-40';

export default function BuilderDock({
  definition, onDefinition, surfaces, topNames, zoneNames,
  drawing, pendingCount, onStartDraw, onFinishDraw, onCancelDraw,
  projects, onSaveProject, onLoadProject,
}) {
  const stackRows = definition.surfaceIds.map((id) => surfaces.find((s) => s.id === id)).filter(Boolean);
  const patch = (p) => onDefinition({ ...definition, ...p });
  const patchZone = (i, p) => {
    const zones = definition.zones.map((z, zi) => (zi === i ? { ...z, ...p } : z));
    patch({ zones });
  };
  const patchKrige = (p) => patch({ krige: { ...definition.krige, ...p } });
  const num = (v) => (v === '' ? '' : Number(v));

  return (
    <ScrollArea className="h-full min-h-0 bg-slate-900/60 border-l border-slate-800/60">
      <div className="p-2 space-y-2 text-xs" data-testid="em-builder">
        <div className={secCls}>Model</div>
        <input className={inCls} data-testid="em-model-name" value={definition.name}
          onChange={(e) => patch({ name: e.target.value })} placeholder="Model name" />

        <div className={secCls}>Tie tops (per stacked surface)</div>
        {stackRows.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            <span className="w-24 truncate text-slate-400">{s.name}</span>
            <select className={selCls} data-testid={`em-top-${i}`} value={definition.topNames[i] || ''}
              onChange={(e) => {
                const tn = [...definition.topNames];
                tn[i] = e.target.value;
                patch({ topNames: tn });
              }}>
              <option value="">no tie</option>
              {topNames.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        ))}
        {!stackRows.length && <p className="text-[10px] text-slate-600">Stack surfaces first (explorer).</p>}

        <div className={secCls}>Zones (between consecutive surfaces)</div>
        {definition.zones.map((z, i) => (
          <div key={i} className="flex items-center gap-1">
            <input className={inCls} value={z.name} data-testid={`em-zone-name-${i}`}
              onChange={(e) => patchZone(i, { name: e.target.value })} />
            <select className={selCls} data-testid={`em-zone-reg-${i}`} value={z.registryZone || ''}
              onChange={(e) => patchZone(i, { registryZone: e.target.value })}>
              <option value="">registry zone…</option>
              {zoneNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        ))}

        <div className={secCls}>Population method</div>
        {['phi', 'sw', 'ntg'].map((prop) => (
          <div key={prop} className="flex items-center gap-1">
            <span className="w-10 text-slate-400">{prop}</span>
            <select className={selCls} data-testid={`em-method-${prop}`} value={definition.methods[prop]}
              onChange={(e) => patch({ methods: { ...definition.methods, [prop]: e.target.value } })}>
              <option value="constant">constant (weighted mean)</option>
              <option value="trend">trend (LSQ plane)</option>
              <option value="krige">simple kriging</option>
            </select>
          </div>
        ))}
        <p className="text-[10px] text-slate-600">Per fault block; short blocks fall back krige → trend → constant (recorded in QC).</p>

        {Object.values(definition.methods).includes('krige') && (
          <>
            <div className={secCls}>Variogram (simple kriging)</div>
            <div className="grid grid-cols-2 gap-1">
              <select className={selCls} data-testid="em-vg-model" value={definition.krige.model}
                onChange={(e) => patchKrige({ model: e.target.value })}>
                <option value="spherical">spherical</option>
                <option value="exponential">exponential</option>
              </select>
              <input className={inCls} data-testid="em-vg-range" type="number" value={definition.krige.range}
                onChange={(e) => patchKrige({ range: num(e.target.value) })} placeholder="range m" title="range (m)" />
              <input className={inCls} data-testid="em-vg-sill" type="number" step="any" value={definition.krige.sill}
                onChange={(e) => patchKrige({ sill: num(e.target.value) })} placeholder="sill" title="sill" />
              <input className={inCls} data-testid="em-vg-nugget" type="number" step="any" value={definition.krige.nugget}
                onChange={(e) => patchKrige({ nugget: num(e.target.value) })} placeholder="nugget" title="nugget" />
            </div>
          </>
        )}

        <div className={secCls}>Fault polygons</div>
        {!drawing ? (
          <button type="button" data-testid="em-fault-draw" className={`${btnCls} border-yellow-700/60 text-yellow-300 hover:bg-yellow-500/10`}
            onClick={onStartDraw}>
            Draw fault polygon (click on map)
          </button>
        ) : (
          <div className="space-y-1">
            <button type="button" data-testid="em-fault-finish" className={`${btnCls} border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10`}
              disabled={pendingCount < 3} onClick={onFinishDraw}>
              Close polygon ({pendingCount} vertices)
            </button>
            <button type="button" data-testid="em-fault-cancel" className={`${btnCls} border-slate-700 text-slate-400 hover:bg-slate-700/30`}
              onClick={onCancelDraw}>
              Cancel drawing
            </button>
          </div>
        )}

        <div className={secCls}>Saved models</div>
        <button type="button" data-testid="em-save-model" className={`${btnCls} border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10`}
          onClick={onSaveProject}>
          Save model definition
        </button>
        {(projects || []).map((p) => (
          <div key={p.id} className="flex items-center gap-1">
            <span className="truncate flex-1 text-slate-400">{p.name}</span>
            <button type="button" className="px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-700/40"
              onClick={() => onLoadProject(p)}>
              load
            </button>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
