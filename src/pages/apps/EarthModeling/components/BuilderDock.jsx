// Builder dock (Earth Modeling G8.2): everything that DEFINES the
// model — per-surface tie tops, the zone table (registry-zone
// mapping), population methods + variogram, fault-polygon drawing, and
// model save/load. The definition is small persistable state; grids
// are recomputed, never stored (plan decision 2).

import { SharedRowNote, useSharingNames } from '@/components/recordSharing';
import { splitOwnAndShared } from '@/lib/recordSharing/rules';
import React, { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DERIVED_KINDS, describeDerived } from '../services/derivedSurfaces';
import { POPULATION_METHODS, parseFluidsInput, BG_UNITS, MAX_LAYERS } from '../services/modelBuild';
import { VARIOGRAM_MODELS } from '../services/propertyKriging';
import { mapKind } from '../services/propertyMaps';
import { LAYER_FT_OPTIONS, LAYERING_STYLES } from '../services/grid3d/layering';

const selCls = 'w-full rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-1 text-xs';
const inCls = selCls;
const secCls = 'text-[10px] uppercase tracking-wider text-pl-muted pt-2';
const btnCls = 'w-full px-2 py-1 rounded border text-xs disabled:opacity-40';

export default function BuilderDock({
  definition, onDefinition, surfaces, topNames, zoneNames,
  drawing, pendingCount, onStartDraw, onFinishDraw, onCancelDraw,
  projects, onSaveProject, onLoadProject, boundaries = [],
  registrySurfaces = null, depthUnit = 'm', onAddDerived, onRemoveDerived,
  bgUnit = 'm3/m3', onBgUnit, projectId = null, onSaveAsNew, report = null, onReport,
  userId = null, sharingStore = null, sharingSlot = null,
  scalProjects = [],
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

  // U2-014: the user's own models, then the ones colleagues shared with the organisation
  const { own, shared } = splitOwnAndShared(projects, userId);
  const names = useSharingNames(sharingStore, projects);
  const modelRow = (p) => (
    <div key={p.id} className="flex flex-wrap items-center gap-x-1" data-testid="em-model-row" data-open={p.id === projectId ? 'true' : undefined}>
      <span className={`truncate flex-1 ${p.id === projectId ? 'text-pl-text font-medium' : 'text-pl-muted'}`}>{p.name}</span>
      <button type="button" className="px-1.5 py-0.5 rounded border border-pl-border text-pl-text hover:bg-pl-sunken"
        onClick={() => onLoadProject(p)}>
        load
      </button>
      <SharedRowNote table="em_models" row={p} userId={userId} names={names} className="basis-full" />
    </div>
  );

  return (
    <ScrollArea className="h-full min-h-0 bg-pl-surface border-l border-pl-border [&_[data-radix-scroll-area-viewport]>div]:!block">
      <div className="p-2 space-y-2 text-xs" data-testid="em-builder">
        <div className={secCls}>Model</div>
        <input className={inCls} data-testid="em-model-name" value={definition.name}
          onChange={(e) => patch({ name: e.target.value })} placeholder="Model name" />
        {report && (
          <div className="grid grid-cols-2 gap-1" title="Printed in the volumes CSV header for the reviewer; kept in this browser">
            <input className={inCls} data-testid="em-report-field" value={report.field} placeholder="Field" onChange={(e) => onReport?.({ field: e.target.value })} />
            <input className={inCls} data-testid="em-report-analyst" value={report.analyst} placeholder="Analyst" onChange={(e) => onReport?.({ analyst: e.target.value })} />
          </div>
        )}

        <div className={secCls}>Model frame (EM0)</div>
        <div className="flex items-center gap-1">
          <span className="w-24 text-pl-muted">cell size</span>
          <input className={inCls} data-testid="em-frame-cell" type="number" min="1" step="any" value={definition.frame?.cellM ?? ''}
            placeholder="top surface's cell" title="Model cell size in metres; empty keeps the top surface's cell"
            onChange={(e) => patch({ frame: { ...(definition.frame || {}), cellM: e.target.value } })} />
          <span className="text-pl-muted">m</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-24 text-pl-muted">boundary</span>
          <select className={selCls} data-testid="em-frame-boundary" value={definition.frame?.boundaryId || ''}
            title="Clip the model to a boundary polygon drawn in Mapping & Surface Studio"
            onChange={(e) => patch({ frame: { ...(definition.frame || {}), boundaryId: e.target.value } })}>
            <option value="">none (whole frame)</option>
            {boundaries.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-24 text-pl-muted">edge</span>
          <select className={selCls} data-testid="em-frame-edge" value={definition.frame?.edge === 'smooth' ? 'smooth' : 'nodes'}
            title="Smooth: the model ends at the data limit traced halfway past the last mapped node, so a fine cell keeps the map's area and the edge has no steps. Node cells: each mapped node of the top surface is one whole cell (earlier releases)."
            onChange={(e) => patch({ frame: { ...(definition.frame || {}), edge: e.target.value } })}>
            <option value="smooth">smooth (traced data limit)</option>
            <option value="nodes">node cells (stepped)</option>
          </select>
        </div>

        <div className={secCls}>3D grid</div>
        <label className="flex items-center gap-1 text-pl-muted" title="Cut every zone into thin layers of cells, so properties vary down the zone as well as across it">
          <input type="checkbox" data-testid="em-grid-on" checked={!!definition.grid?.enabled}
            onChange={(e) => patch({ grid: { ...(definition.grid || {}), enabled: e.target.checked } })} />
          fine 3D grid (layers of cells in every zone)
        </label>
        {definition.grid?.enabled && (
          <div className="grid grid-cols-2 gap-1" data-testid="em-grid-settings">
            <label className="flex items-center gap-1 text-pl-muted">layers
              <select className={selCls} data-testid="em-grid-layer" value={String(definition.grid?.layerFt ?? 2.5)}
                title="Layer thickness in feet"
                onChange={(e) => patch({ grid: { ...(definition.grid || {}), layerFt: Number(e.target.value) } })}>
                {LAYER_FT_OPTIONS.map((v) => <option key={v} value={String(v)}>{v} ft</option>)}
              </select>
            </label>
            <select className={selCls} data-testid="em-grid-style" value={definition.grid?.style || 'proportional'}
              title="Proportional: the same number of layers everywhere, thinning with the zone. Follow top: layers of this thickness hung from the zone top, cut by the base. Follow base: stacked up from the base, cut by the top (onlap)."
              onChange={(e) => patch({ grid: { ...(definition.grid || {}), style: e.target.value } })}>
              {LAYERING_STYLES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
            </select>
          </div>
        )}

        <div className={secCls}>Tie tops (per stacked surface)</div>
        {stackRows.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            <span className="w-24 truncate text-pl-muted">{s.name}</span>
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
        {!stackRows.length && <p className="text-[10px] text-pl-muted">Stack surfaces first (explorer).</p>}

        <div className={secCls}>Derived horizons (EM2)</div>
        {(definition.derived || []).map((d) => (
          <div key={d.id} className="flex items-center gap-1" data-testid={`em-derived-row-${d.name}`}>
            <span className="truncate flex-1 text-pl-text" title={describeDerived(d, surfaces, depthUnit)}>{d.name}</span>
            <button type="button" className="px-1.5 py-0.5 rounded border border-pl-border text-pl-muted hover:text-pl-danger-text" title="Remove from the model" onClick={() => onRemoveDerived?.(d.id)}>x</button>
          </div>
        ))}
        <div className="space-y-1 rounded border border-pl-border p-1.5">
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
            <button type="button" data-testid="em-derived-add" className="px-2 py-1 rounded border border-pl-primary/50 text-pl-primary-text hover:bg-pl-primary/10 disabled:opacity-40"
              disabled={!dv.sourceId} onClick={() => { onAddDerived?.(dv); setDv({ ...dv, name: '' }); }}>Add</button>
          </div>
        </div>

        <div className={secCls}>Well adjustment (EM1)</div>
        <label className="flex items-center gap-1 text-pl-muted" title="Warp each tied surface through its tie residuals so it passes through the well tops (Franke-Little correction field, zero beyond the radius)">
          <input type="checkbox" data-testid="em-adjust-on" checked={!!definition.adjust?.enabled}
            onChange={(e) => patch({ adjust: { ...(definition.adjust || {}), enabled: e.target.checked } })} />
          adjust surfaces to the well tops
        </label>
        <div className="flex items-center gap-1">
          <span className="w-24 text-pl-muted">radius</span>
          <input className={inCls} data-testid="em-adjust-radius" type="number" min="1" step="any" value={definition.adjust?.radiusM ?? ''}
            placeholder="3 x median tie spacing" title="Influence radius in metres; empty = three times the median spacing between ties"
            disabled={!definition.adjust?.enabled}
            onChange={(e) => patch({ adjust: { ...(definition.adjust || {}), radiusM: e.target.value } })} />
          <span className="text-pl-muted">m</span>
        </div>

        <div className={secCls}>Zones (between consecutive surfaces)</div>
        <div className="space-y-1 rounded border border-pl-border p-1.5" data-testid="em-cap">
          <label className="flex items-center gap-1 text-pl-muted" title="A slab of the seal above the top surface, parallel to it, modelled as a zone of its own (the cap rock over the reservoir)">
            <input type="checkbox" data-testid="em-cap-on" checked={!!definition.cap?.on}
              onChange={(e) => patch({ cap: { ...(definition.cap || {}), on: e.target.checked, unit: definition.cap?.unit || depthUnit } })} />
            cap above the top surface
          </label>
          {definition.cap?.on && (
            <div className="grid grid-cols-2 gap-1">
              <input className={inCls} data-testid="em-cap-name" value={definition.cap?.name ?? 'Cap'} placeholder="name"
                onChange={(e) => patch({ cap: { ...(definition.cap || {}), name: e.target.value } })} />
              <label className="flex items-center gap-1 text-pl-muted">
                <input className={inCls} data-testid="em-cap-thickness" type="number" min="1" step="any" value={definition.cap?.thickness ?? '50'}
                  title="Cap thickness above the top surface"
                  onChange={(e) => patch({ cap: { ...(definition.cap || {}), thickness: e.target.value, unit: depthUnit } })} />
                {definition.cap?.unit || depthUnit}
              </label>
            </div>
          )}
        </div>
        {definition.zones.map((z, i) => (
          <div key={i} className="flex items-center gap-1">
            <input className={inCls} value={z.name} data-testid={`em-zone-name-${i}`}
              onChange={(e) => patchZone(i, { name: e.target.value })} />
            <select className={selCls} data-testid={`em-zone-reg-${i}`} value={z.registryZone || ''}
              onChange={(e) => patchZone(i, { registryZone: e.target.value })}>
              <option value="">registry zone…</option>
              {zoneNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {!definition.grid?.enabled && (
              <input className="w-12 shrink-0 rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-1 text-xs" type="number" min="1" max={MAX_LAYERS} step="1" data-testid={`em-layers-${i}`}
                value={z.layers ?? 1} title="Proportional layers in the zone: each layer gets its own properties from the wells, and the volumes add up layer by layer"
                onChange={(e) => patchZone(i, { layers: e.target.value })} />
            )}
          </div>
        ))}
        {definition.zones.map((z, i) => {
          // tops picked between the zone's two tie tops can split it
          const tTop = definition.topNames[i]; const tBase = definition.topNames[i + 1];
          const a = topNames.indexOf(tTop); const b = topNames.indexOf(tBase);
          const inside = a >= 0 && b > a ? topNames.slice(a + 1, b) : [];
          if (!inside.length) return null;
          const chosen = z.splitTops || [];
          const toggle = (t) => {
            const next = chosen.includes(t) ? chosen.filter((x) => x !== t) : [...chosen, t];
            patchZone(i, { splitTops: next.sort((x, y) => topNames.indexOf(x) - topNames.indexOf(y)) });
          };
          return (
            <div key={`split-${i}`} className="rounded border border-pl-border p-1.5 space-y-0.5" data-testid={`em-split-${i}`}
              title="Cut the zone at well tops picked inside it: each top's place in the zone at the wells is interpolated between them, so the new zones follow the stacked surfaces">
              <div className="text-[10px] text-pl-muted">{z.name}: split at the well tops</div>
              {inside.map((t) => (
                <label key={t} className="flex items-center gap-1 text-pl-text">
                  <input type="checkbox" data-testid={`em-split-${i}-${t}`} checked={chosen.includes(t)} onChange={() => toggle(t)} /> {t}
                </label>
              ))}
              {chosen.length > 0 && <div className="text-[10px] text-pl-muted" data-testid={`em-split-names-${i}`}>makes {chosen.length === 2 ? `${z.name} Upper, Middle and Lower` : chosen.length === 1 ? `${z.name} Upper and Lower` : `${chosen.length + 1} zones`}</div>}
            </div>
          );
        })}
        {definition.zones.length > 0 && !definition.grid?.enabled && <p className="text-[10px] text-pl-muted">The number after each zone is its proportional layers (1 = the zone as one layer).</p>}

        <div className={secCls}>Fluid contacts and FVF (per zone)</div>
        <label className="flex items-center gap-1 text-pl-muted" title="The unit Bg is typed in from now on; values already typed keep the unit they were typed in">
          <span className="w-24">Bg unit</span>
          <select className={selCls} data-testid="em-bg-unit" value={bgUnit} onChange={(e) => onBgUnit?.(e.target.value)}>
            {BG_UNITS.map((u) => <option key={u} value={u}>{u === 'm3/m3' ? 'rm3/sm3' : u}</option>)}
          </select>
        </label>
        {definition.zones.map((z, i) => {
          const f = (definition.fluidsInput || [])[i] || {};
          // U1 (EM-U1-006, -007): every value keeps the unit it was typed in
          const unitKey = { goc: 'gocUnit', owc: 'owcUnit', bg: 'bgUnit' };
          const setF = (k, v) => {
            const next = [...(definition.fluidsInput || [])];
            next[i] = { ...f, [k]: v, ...(unitKey[k] ? { [unitKey[k]]: k === 'bg' ? bgUnit : depthUnit } : {}) };
            patch({ fluidsInput: next });
          };
          const uOf = (k) => f[unitKey[k]] || (k === 'bg' ? 'm3/m3' : f.unit || depthUnit);
          let read = null;
          try {
            const [p] = parseFluidsInput([f]);
            const bits = [];
            if (p?.goc != null) bits.push(`GOC ${p.goc.toFixed(1)} m`);
            if (p?.owc != null) bits.push(`OWC ${p.owc.toFixed(1)} m`);
            if (p?.bo != null) bits.push(`Bo ${p.bo}`);
            if (p?.bg != null) bits.push(`Bg ${p.bg.toPrecision(3)} rm3/sm3`);
            if (p?.gasZone) bits.push('gas zone');
            for (const [lab, b] of Object.entries(p?.blocks || {})) bits.push(`block ${lab}${b.goc != null ? ` GOC ${b.goc.toFixed(1)} m` : ''}${b.owc != null ? ` OWC ${b.owc.toFixed(1)} m` : ''}`);
            read = bits.length ? `reads as ${bits.join(', ')} below datum` : null;
          } catch (e) { read = e.message; }
          return (
            <div key={`fl-${i}`} className="grid grid-cols-4 gap-1" data-testid={`em-fluids-${i}`}
              title="Contacts as depth below datum (positive down; a negative value is read as an elevation). Bo in rb/stb (rm3/sm3). Blank = not given; with no OWC the whole zone counts as hydrocarbon. Bg with no Bo and no GOC makes a gas zone.">
              <span className="col-span-4 text-[10px] text-pl-muted">{z.name}</span>
              <input className={inCls} value={f.goc ?? ''} placeholder={`GOC ${uOf('goc')}`} data-testid={`em-goc-${i}`} onChange={(e) => setF('goc', e.target.value)} />
              <input className={inCls} value={f.owc ?? ''} placeholder={`OWC ${uOf('owc')}`} data-testid={`em-owc-${i}`} onChange={(e) => setF('owc', e.target.value)} />
              <input className={inCls} value={f.bo ?? ''} placeholder="Bo rb/stb" data-testid={`em-bo-${i}`} onChange={(e) => setF('bo', e.target.value)} />
              <input className={inCls} value={f.bg ?? ''} placeholder={`Bg ${bgUnit === 'm3/m3' ? 'rm3/sm3' : bgUnit}`} data-testid={`em-bg-${i}`} onChange={(e) => setF('bg', e.target.value)} />
              {read && <span className="col-span-4 text-[10px] text-pl-muted" data-testid={`em-fluids-read-${i}`}>{read}</span>}
              <label className="col-span-4 flex items-center gap-1 text-[10px] text-pl-muted"
                title="Mapping's closure and spill engine on the zone top: a contact below the spill point fills the trap only to the spill, and nodes above the contact outside the trap hold no hydrocarbon">
                <input type="checkbox" data-testid={`em-trap-${i}`} checked={f.trap === 'closure'}
                  onChange={(e) => { const next = [...(definition.fluidsInput || [])]; next[i] = { ...f, trap: e.target.checked ? 'closure' : undefined }; patch({ fluidsInput: next }); }} />
                bound the leg by the closure and spill
              </label>
              {(definition.faultPolygons || []).length > 0 && (
                <details className="col-span-4" data-testid={`em-block-contacts-${i}`} open={Object.keys(f.blocks || {}).length > 0}>
                  <summary className="cursor-pointer text-[10px] text-pl-primary-text" title="A fault block can hold its own GOC and OWC (a fault that seals). Blank = the zone contact.">Contacts per fault block</summary>
                  {[{ lab: '0', name: 'Outside the fault polygons' }, ...(definition.faultPolygons || []).map((p, k) => ({ lab: String(k + 1), name: p.name }))].map(({ lab, name }) => {
                    const b = (f.blocks || {})[lab] || {};
                    const setB = (k, v) => {
                      const next = [...(definition.fluidsInput || [])];
                      const blocks = { ...(f.blocks || {}), [lab]: { ...b, [k]: v, [unitKey[k]]: depthUnit } };
                      next[i] = { ...f, blocks };
                      patch({ fluidsInput: next });
                    };
                    return (
                      <div key={lab} className="grid grid-cols-3 gap-1 mt-1 items-center">
                        <span className="text-[10px] text-pl-muted truncate" title={name}>{lab}: {name}</span>
                        <input className={inCls} value={b.goc ?? ''} placeholder={`GOC ${b.gocUnit || depthUnit}`} data-testid={`em-goc-${i}-b${lab}`} onChange={(e) => setB('goc', e.target.value)} />
                        <input className={inCls} value={b.owc ?? ''} placeholder={`OWC ${b.owcUnit || depthUnit}`} data-testid={`em-owc-${i}-b${lab}`} onChange={(e) => setB('owc', e.target.value)} />
                      </div>
                    );
                  })}
                </details>
              )}
            </div>
          );
        })}

        <div className={secCls}>Rock properties from</div>
        <select className={selCls} data-testid="em-control" value={definition.control || 'zones'}
          title="Where each layer's porosity, NTG and Sw at the wells come from"
          onChange={(e) => patch({ control: e.target.value })}>
          <option value="zones">published zone averages (one per well)</option>
          <option value="logs">the well logs, upscaled to each layer</option>
        </select>
        {definition.control === 'logs' && (
          <div className="space-y-1 rounded border border-pl-border p-1.5" data-testid="em-cutoffs">
            <div className="text-[10px] text-pl-muted">PHIE, VSH, SW and permeability as Petrophysics Studio published them. Net reservoir is rock with Vsh at most and porosity at least these; water is cut by the contact, so Sw counts only above the OWC.</div>
            <div className="grid grid-cols-2 gap-1">
              <label className="flex items-center gap-1 text-pl-muted">Vsh &le;
                <input className={inCls} data-testid="em-cut-vsh" value={definition.cutoffs?.vsh ?? ''} placeholder="0.5"
                  onChange={(e) => patch({ cutoffs: { ...(definition.cutoffs || {}), vsh: e.target.value } })} /></label>
              <label className="flex items-center gap-1 text-pl-muted">PHIE &ge;
                <input className={inCls} data-testid="em-cut-phi" value={definition.cutoffs?.phi ?? ''} placeholder="0.08"
                  onChange={(e) => patch({ cutoffs: { ...(definition.cutoffs || {}), phi: e.target.value } })} /></label>
            </div>
          </div>
        )}

        <div className={secCls}>Population method</div>
        {['phi', 'sw', 'ntg'].map((prop) => (
          <div key={prop} className="flex items-center gap-1">
            <span className="w-10 text-pl-muted">{prop}</span>
            <select className={selCls} data-testid={`em-method-${prop}`} value={definition.methods[prop]}
              onChange={(e) => patch({ methods: { ...definition.methods, [prop]: e.target.value } })}>
              {POPULATION_METHODS.filter((m) => !m.only || m.only === prop || (Array.isArray(m.only) && m.only.includes(prop))).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        ))}
        <p className="text-[10px] text-pl-muted">Per fault block; short blocks fall back kriging to trend to constant (recorded in QC).</p>
        {definition.methods.phi === 'sgs' && (
          <div className="space-y-1 rounded border border-pl-border p-1.5" data-testid="em-sgs">
            <div className="text-[10px] text-pl-muted">Sequential Gaussian simulation of porosity over each zone: honours the upscaled wells, reproduces their histogram and this variogram. One seed gives one realisation.</div>
            <div className="grid grid-cols-2 gap-1">
              <label className="flex items-center gap-1 text-pl-muted">seed
                <input className={inCls} data-testid="em-sgs-seed" value={definition.sgs?.seed ?? '2026'} onChange={(e) => patch({ sgs: { ...(definition.sgs || {}), seed: e.target.value } })} /></label>
              <label className="flex items-center gap-1 text-pl-muted">nugget
                <input className={inCls} data-testid="em-sgs-nugget" value={definition.sgs?.nugget ?? '0.1'} title="Nugget as a fraction of the sill" onChange={(e) => patch({ sgs: { ...(definition.sgs || {}), nugget: e.target.value } })} /></label>
              <label className="flex items-center gap-1 text-pl-muted">across
                <input className={inCls} data-testid="em-sgs-range" value={definition.sgs?.rangeM ?? ''} placeholder={String(definition.krige?.range ?? 900)} title="Range across the layers in metres (blank: the variogram range)" onChange={(e) => patch({ sgs: { ...(definition.sgs || {}), rangeM: e.target.value } })} />m</label>
              <label className="flex items-center gap-1 text-pl-muted">down
                <input className={inCls} data-testid="em-sgs-vrange" value={definition.sgs?.rangeVFt ?? '10'} title="Range down the layers in feet" onChange={(e) => patch({ sgs: { ...(definition.sgs || {}), rangeVFt: e.target.value } })} />ft</label>
            </div>
          </div>
        )}
        {Object.values(definition.methods).includes('idw') && (
          <label className="flex items-center gap-1 text-pl-muted" title="Weights fall as one over the distance to this power">
            <span className="w-24">IDW power</span>
            <input className={inCls} data-testid="em-idw-power" type="number" min="0.5" step="0.5" value={definition.idw?.power ?? 2}
              onChange={(e) => patch({ idw: { ...(definition.idw || {}), power: e.target.value } })} />
          </label>
        )}
        {['phi', 'sw', 'ntg'].some((p) => definition.methods[p] === 'typed') && (
          <div className="space-y-1 rounded border border-pl-border p-1.5" data-testid="em-typed">
            <div className="text-[10px] text-pl-muted">Typed values per zone (fractions), the same at every node: a booked case.</div>
            {definition.zones.map((z, i) => (
              <div key={`ty-${i}`} className="grid grid-cols-4 gap-1 items-center">
                <span className="text-[10px] text-pl-muted truncate" title={z.name}>{z.name}</span>
                {['phi', 'sw', 'ntg'].map((p) => (definition.methods[p] === 'typed' ? (
                  <input key={p} className={inCls} data-testid={`em-typed-${p}-${i}`} value={z.typed?.[p] ?? ''} placeholder={p}
                    onChange={(e) => patchZone(i, { typed: { ...(z.typed || {}), [p]: e.target.value } })} />
                ) : <span key={p} />))}
              </div>
            ))}
          </div>
        )}
        {(definition.methods.ntg === 'map' || definition.methods.sw === 'map') && (
          <div className="space-y-1 rounded border border-pl-border p-1.5" data-testid="em-propmaps">
            <div className="text-[10px] text-pl-muted">Petrophysics maps per zone (Mapping grids the zone net pay and HCPV as attribute maps; pick the TVT keys). NTG = net pay / thickness; Sw = 1 - HCPV / (thickness x NTG x porosity).</div>
            {definition.zones.map((z, i) => {
              const attrs = (registrySurfaces || surfaces).filter((s) => s.kind === 'attribute' && ['m', 'ft'].includes(s.z_unit));
              const opt = (want) => attrs.slice().sort((a, b) => (mapKind(b) === want) - (mapKind(a) === want)).map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.provenance?.source?.key ? ` [${s.provenance.source.key}]` : ''}</option>
              ));
              return (
                <div key={`pm-${i}`} className="grid grid-cols-2 gap-1">
                  <span className="col-span-2 text-[10px] text-pl-muted">{z.name}</span>
                  {definition.methods.ntg === 'map' && (
                    <select className={selCls} data-testid={`em-map-ntg-${i}`} value={z.maps?.ntg || ''} title="Net pay map for NTG"
                      onChange={(e) => patchZone(i, { maps: { ...(z.maps || {}), ntg: e.target.value } })}>
                      <option value="">net pay map…</option>{opt('net')}
                    </select>
                  )}
                  {definition.methods.sw === 'map' && (
                    <select className={selCls} data-testid={`em-map-sw-${i}`} value={z.maps?.sw || ''} title="HCPV map for Sw"
                      onChange={(e) => patchZone(i, { maps: { ...(z.maps || {}), sw: e.target.value } })}>
                      <option value="">HCPV map…</option>{opt('hcpv')}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {definition.methods.sw === 'shm' && (
          <div className="space-y-1 rounded border border-pl-border p-1.5" data-testid="em-shm">
            <div className="text-[10px] text-pl-muted">Sw from a SCAL Studio saturation-height function: per node, the mean Sw over the hydrocarbon leg from its height above the free-water level.</div>
            <select className={selCls} data-testid="em-shm-project" value={definition.shm?.projectId || ''}
              onChange={(e) => patch({ shm: { ...(definition.shm || {}), projectId: e.target.value, projectName: (scalProjects.find((p) => p.id === e.target.value) || {}).name || '' } })}>
              <option value="">SCAL Studio project…</option>
              {scalProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {!scalProjects.length && <p className="text-[10px] text-pl-muted">No saved SCAL Studio projects. Fit a J function and save it in SCAL Studio.</p>}
            <div className="grid grid-cols-2 gap-1">
              <input className={inCls} data-testid="em-shm-fwl" value={definition.shm?.fwl ?? ''} placeholder={`FWL ${depthUnit} (blank: the project's)`}
                title="Free-water level as depth below datum; blank uses the SCAL project's"
                onChange={(e) => patch({ shm: { ...(definition.shm || {}), fwl: e.target.value, fwlUnit: depthUnit } })} />
              <select className={selCls} data-testid="em-shm-rock" value={definition.shm?.rock || 'project'} title="Porosity for the Leverett scaling"
                onChange={(e) => patch({ shm: { ...(definition.shm || {}), rock: e.target.value } })}>
                <option value="project">rock of the project</option>
                <option value="model">modelled porosity</option>
              </select>
            </div>
          </div>
        )}

        {(Object.values(definition.methods).includes('krige') || Object.values(definition.methods).includes('okrige')) && (
          <>
            <div className={secCls}>Variogram</div>
            {Object.values(definition.methods).includes('okrige') && (
              <>
                <label className="flex items-center gap-1 text-pl-muted" title="Fit range and sill from the experimental semivariogram of each property's control points (per block)">
                  <input type="checkbox" data-testid="em-vg-fit" checked={definition.krige.fit !== false} onChange={(e) => patchKrige({ fit: e.target.checked })} /> fit from the wells
                </label>
                <label className="flex items-center gap-1 text-pl-muted" title="Fit a plane first and krige the residuals, so a regional trend is honoured">
                  <input type="checkbox" data-testid="em-vg-detrend" checked={definition.krige.detrend !== false} onChange={(e) => patchKrige({ detrend: e.target.checked })} /> remove the trend first
                </label>
              </>
            )}
            <div className="grid grid-cols-2 gap-1">
              <select className={selCls} data-testid="em-vg-model" value={definition.krige.model}
                onChange={(e) => patchKrige({ model: e.target.value })}>
                {VARIOGRAM_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
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
          <button type="button" data-testid="em-fault-draw" className={`${btnCls} border-pl-border text-pl-text hover:bg-pl-sunken`}
            onClick={onStartDraw}>
            Draw fault polygon (click on map)
          </button>
        ) : (
          <div className="space-y-1">
            <button type="button" data-testid="em-fault-finish" className={`${btnCls} border-pl-border text-pl-primary-text hover:bg-pl-sunken`}
              disabled={pendingCount < 3} onClick={onFinishDraw}>
              Close polygon ({pendingCount} vertices)
            </button>
            <button type="button" data-testid="em-fault-cancel" className={`${btnCls} border-pl-border text-pl-muted hover:bg-pl-sunken`}
              onClick={onCancelDraw}>
              Cancel drawing
            </button>
          </div>
        )}

        <div className={secCls}>Saved models</div>
        <button type="button" data-testid="em-save-model" className={`${btnCls} border-pl-primary/50 text-pl-primary-text hover:bg-pl-primary/10`}
          onClick={onSaveProject}>
          {projectId ? 'Save model (overwrite)' : 'Save model definition'}
        </button>
        {projectId && (
          <button type="button" data-testid="em-save-as-new" className={`${btnCls} border-pl-border text-pl-text hover:bg-pl-sunken`}
            onClick={onSaveAsNew}>
            Save as a new model
          </button>
        )}
        {sharingSlot}
        {own.map(modelRow)}
        {shared.length > 0 && (
          <>
            <div className={secCls} data-testid="em-shared-models">Shared with me</div>
            {shared.map(modelRow)}
          </>
        )}
      </div>
    </ScrollArea>
  );
}
