// Builder dock (Earth Modeling G8.2): everything that DEFINES the
// model — per-surface tie tops, the zone table (registry-zone
// mapping), population methods + variogram, fault-polygon drawing, and
// model save/load. The definition is small persistable state; grids
// are recomputed, never stored (plan decision 2).

import React, { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DERIVED_KINDS, describeDerived } from '../services/derivedSurfaces';

const selCls = 'w-full rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';
const inCls = selCls;
const secCls = 'text-[10px] uppercase tracking-wider text-slate-500 pt-2';
const btnCls = 'w-full px-2 py-1 rounded border text-xs disabled:opacity-40';

export default function BuilderDock({
  definition, onDefinition, surfaces, topNames, zoneNames,
  drawing, pendingCount, onStartDraw, onFinishDraw, onCancelDraw,
  projects, onSaveProject, onLoadProject, boundaries = [],
  registrySurfaces = null, depthUnit = 'm', onAddDerived, onRemoveDerived,
}) {
  // EM2 derived-horizon form (thickness typed in the display unit)
  const [dv, setDv] = useState({ kind: 'parallel', sourceId: '', thickness: '', isochoreId: '', baseId: '', fraction: '0.5', name: '' });
  const isochores = (registrySurfaces || surfaces).filter((s) => s.kind === 'isochore');
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

        <div className={secCls}>Model frame (EM0)</div>
        <div className="flex items-center gap-1">
          <span className="w-24 text-slate-400">cell size</span>
          <input className={inCls} data-testid="em-frame-cell" type="number" min="1" step="any" value={definition.frame?.cellM ?? ''}
            placeholder="top surface's cell" title="Model cell size in metres; empty keeps the top surface's cell"
            onChange={(e) => patch({ frame: { ...(definition.frame || {}), cellM: e.target.value } })} />
          <span className="text-slate-500">m</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-24 text-slate-400">boundary</span>
          <select className={selCls} data-testid="em-frame-boundary" value={definition.frame?.boundaryId || ''}
            title="Clip the model to a boundary polygon drawn in Mapping & Surface Studio"
            onChange={(e) => patch({ frame: { ...(definition.frame || {}), boundaryId: e.target.value } })}>
            <option value="">none (whole frame)</option>
            {boundaries.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

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

        <div className={secCls}>Derived horizons (EM2)</div>
        {(definition.derived || []).map((d) => (
          <div key={d.id} className="flex items-center gap-1" data-testid={`em-derived-row-${d.name}`}>
            <span className="truncate flex-1 text-slate-300" title={describeDerived(d, surfaces, depthUnit)}>{d.name}</span>
            <button type="button" className="px-1.5 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-red-400" title="Remove from the model" onClick={() => onRemoveDerived?.(d.id)}>x</button>
          </div>
        ))}
        <div className="space-y-1 rounded border border-slate-800 p-1.5">
          <select className={selCls} data-testid="em-derived-kind" value={dv.kind} onChange={(e) => setDv({ ...dv, kind: e.target.value })}>
            {DERIVED_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <select className={selCls} data-testid="em-derived-source" value={dv.sourceId} title="The surface the horizon derives from" onChange={(e) => setDv({ ...dv, sourceId: e.target.value })}>
            <option value="">source surface…</option>
            {surfaces.filter((s) => s.kind === 'structure').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {dv.kind === 'parallel' ? (
            <div className="flex items-center gap-1">
              <input className={inCls} data-testid="em-derived-thickness" type="number" step="any" value={dv.thickness} placeholder={`thickness ${depthUnit}`}
                title={`Thickness below the source in ${depthUnit}; negative places the horizon above`} onChange={(e) => setDv({ ...dv, thickness: e.target.value, isochoreId: '' })} />
              <select className={selCls} data-testid="em-derived-isochore" value={dv.isochoreId} title="Or a thickness (isochore) surface from the registry" onChange={(e) => setDv({ ...dv, isochoreId: e.target.value, thickness: '' })}>
                <option value="">or isochore…</option>
                {isochores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <select className={selCls} data-testid="em-derived-base" value={dv.baseId} title="The base surface" onChange={(e) => setDv({ ...dv, baseId: e.target.value })}>
                <option value="">base surface…</option>
                {surfaces.filter((s) => s.kind === 'structure').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input className={`${inCls} w-16`} data-testid="em-derived-fraction" type="number" step="0.05" min="0.05" max="0.95" value={dv.fraction} title="Fraction of the way from source to base (0.5 = midway)" onChange={(e) => setDv({ ...dv, fraction: e.target.value })} />
            </div>
          )}
          <div className="flex items-center gap-1">
            <input className={inCls} data-testid="em-derived-name" value={dv.name} placeholder="name (optional)" onChange={(e) => setDv({ ...dv, name: e.target.value })} />
            <button type="button" data-testid="em-derived-add" className="px-2 py-1 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
              disabled={!dv.sourceId} onClick={() => { onAddDerived?.(dv); setDv({ ...dv, name: '' }); }}>Add</button>
          </div>
        </div>

        <div className={secCls}>Well adjustment (EM1)</div>
        <label className="flex items-center gap-1 text-slate-400" title="Warp each tied surface through its tie residuals so it passes through the well tops (Franke-Little correction field, zero beyond the radius)">
          <input type="checkbox" data-testid="em-adjust-on" checked={!!definition.adjust?.enabled}
            onChange={(e) => patch({ adjust: { ...(definition.adjust || {}), enabled: e.target.checked } })} />
          adjust surfaces to the well tops
        </label>
        <div className="flex items-center gap-1">
          <span className="w-24 text-slate-400">radius</span>
          <input className={inCls} data-testid="em-adjust-radius" type="number" min="1" step="any" value={definition.adjust?.radiusM ?? ''}
            placeholder="3 x median tie spacing" title="Influence radius in metres; empty = three times the median spacing between ties"
            disabled={!definition.adjust?.enabled}
            onChange={(e) => patch({ adjust: { ...(definition.adjust || {}), radiusM: e.target.value } })} />
          <span className="text-slate-500">m</span>
        </div>

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
