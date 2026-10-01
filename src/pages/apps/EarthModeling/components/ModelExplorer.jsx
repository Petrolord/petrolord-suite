// Left explorer (Earth Modeling G8.2): the registry surfaces (add to
// the model stack), the model tree (stack order + zones), wells, and
// fault polygons. Selection/ordering only — the heavy controls live in
// the builder dock.

import React from 'react';
import { Link } from 'react-router-dom';
import { Layers3, ArrowUp, ArrowDown, X, Plus, CircleDot, Spline, Map as MapIcon } from 'lucide-react';
import { mapSurfaceHref } from '@/components/wells/appLinks';
import { ScrollArea } from '@/components/ui/scroll-area';
import { normalizeSeismicFault } from '../services/seismicFaultZones';

const secCls = 'text-[10px] uppercase tracking-wider text-pl-muted px-2 pt-3 pb-1';
const rowCls = 'flex items-center gap-1 px-2 py-1 text-xs text-pl-text hover:bg-pl-sunken rounded';
const btnCls = 'p-0.5 rounded hover:bg-pl-sunken text-pl-muted hover:text-pl-text';

export default function ModelExplorer({
  surfaces, wells, definition, onAddSurface, onRemoveSurface, onMoveSurface,
  onDeletePolygon, culturePolygons = [], onAddCulturePolygon, mappingPath = undefined,
  seismicFaults = null, onAddSeismicFault = null, seismicHookReason = null, onAddSeismicFaultPerZone = null,
}) {
  const inModel = new Set((definition.faultPolygons || []).map((p) => p.cultureId).filter(Boolean));
  const inStack = new Set(definition.surfaceIds);
  const stackRows = definition.surfaceIds.map((id) => surfaces.find((s) => s.id === id)).filter(Boolean);

  return (
    <ScrollArea className="h-full min-h-0 bg-pl-surface border-r border-pl-border">
      <div className="pb-3" data-testid="em-explorer">
        <div className={secCls}>Model stack (shallow → deep)</div>
        {!stackRows.length && <p className="px-2 text-[11px] text-pl-muted">Add registry surfaces below.</p>}
        {stackRows.map((s, i) => (
          <div className={rowCls} key={s.id} data-testid={`em-stack-${i}`}>
            <Layers3 className="w-3 h-3 text-pl-primary-text shrink-0" />
            <span className="truncate flex-1">{s.name}</span>
            <button type="button" className={btnCls} disabled={i === 0} onClick={() => onMoveSurface(i, -1)} title="Move up"><ArrowUp className="w-3 h-3" /></button>
            <button type="button" className={btnCls} disabled={i === stackRows.length - 1} onClick={() => onMoveSurface(i, 1)} title="Move down"><ArrowDown className="w-3 h-3" /></button>
            <button type="button" className={btnCls} onClick={() => onRemoveSurface(s.id)} title="Remove"><X className="w-3 h-3" /></button>
          </div>
        ))}

        <div className={secCls}>Registry surfaces</div>
        {surfaces.filter((s) => !inStack.has(s.id)).map((s) => (
          <div className={rowCls} key={s.id}>
            <span className="truncate flex-1" title={`${s.kind} · ${s.nx}×${s.ny}`}>{s.name}</span>
            <span className="text-[10px] text-pl-muted">{s.kind}</span>
            {!s.derived && (
              <Link to={mapSurfaceHref(s.id, mappingPath)} className={btnCls} data-testid={`em-map-${s.name}`} title="Open in Mapping & Surface Studio">
                <MapIcon className="w-3 h-3" />
              </Link>
            )}
            <button type="button" className={btnCls} data-testid={`em-add-${s.name}`} onClick={() => onAddSurface(s.id)} title="Add to stack">
              <Plus className="w-3 h-3" />
            </button>
          </div>
        ))}
        {!surfaces.length && <p className="px-2 text-[11px] text-pl-muted">No surfaces in the registry. Build them in Mapping &amp; Surface Studio.</p>}

        <div className={secCls}>Fault polygons</div>
        {(definition.faultPolygons || []).map((p, i) => (
          <div className={rowCls} key={p.name}>
            <Spline className="w-3 h-3 text-pl-muted shrink-0" />
            <span className="truncate flex-1">{p.name}</span>
            <span className="text-[10px] text-pl-muted">{p.rails ? 'per zone top' : `${p.vertices.length} pts`}</span>
            <button type="button" className={btnCls} onClick={() => onDeletePolygon(i)} title="Delete"><X className="w-3 h-3" /></button>
          </div>
        ))}
        {!(definition.faultPolygons || []).length && (
          <p className="px-2 text-[11px] text-pl-muted">None yet. Draw one from the dock (blocks default to a single block).</p>
        )}

        <div className={secCls}>Fault polygons from Mapping</div>
        {culturePolygons.map((cp) => (
          <div className={rowCls} key={cp.id} data-testid={`em-culture-row-${cp.name}`}>
            <Spline className="w-3 h-3 text-pl-muted shrink-0" />
            <span className="truncate flex-1">{cp.name}</span>
            <span className="text-[10px] text-pl-muted">{cp.vertices.length} pts</span>
            <button type="button" className={btnCls} data-testid={`em-culture-add-${cp.name}`} disabled={inModel.has(cp.id)}
              onClick={() => onAddCulturePolygon(cp)} title={inModel.has(cp.id) ? 'Already in the model' : 'Add to the model'}>
              <Plus className="w-3 h-3" />
            </button>
          </div>
        ))}
        {!culturePolygons.length && (
          <p className="px-2 text-[11px] text-pl-muted">No fault polygons in the registry. Draw them in Mapping &amp; Surface Studio (Polygons, fault block).</p>
        )}

        {seismicHookReason && <p className="px-2 text-[11px] text-pl-muted" data-testid="em-seis-hook">{seismicHookReason}</p>}
        {seismicFaults && (
          <>
            <div className={secCls}>Faults from Seismolord</div>
            <p className="px-2 text-[10px] text-pl-muted">+ adds the hanging-wall block at one TWT level (a vertical polygon); per zone cuts a fault with depth with every zone top (U2-001).</p>
            {seismicFaults.faults.map((sf) => {
              const added = (definition.faultPolygons || []).some((p) => p.seismicFaultId === sf.id);
              return (
                <div className={rowCls} key={sf.id} data-testid={`em-seis-row-${sf.name}`}
                  title={[`${sf.sticks.length} sticks in ${sf.volumeName}`, sf.trace ? `trace at ${Math.round(sf.levelMs)} ms TWT` : null, ...sf.notes].filter(Boolean).join('; ')}>
                  <Spline className="w-3 h-3 text-pl-muted shrink-0" />
                  <span className="truncate flex-1">{sf.name}</span>
                  <span className="text-[10px] text-pl-muted whitespace-nowrap">{sf.sticks.length} sticks{sf.trace ? ` · ${Math.round(sf.levelMs)} ms` : ''}</span>
                  <button type="button" className={btnCls} data-testid={`em-seis-add-${sf.name}`} disabled={added || !sf.trace}
                    onClick={() => onAddSeismicFault(sf)} title={added ? 'Already in the model' : sf.trace ? 'Add its hanging-wall block to the model' : sf.notes[0]}>
                    <Plus className="w-3 h-3" />
                  </button>
                  {onAddSeismicFaultPerZone && (() => {
                    const n = normalizeSeismicFault(sf);
                    return (
                      <button type="button" className={`${btnCls} text-[9px]`} data-testid={`em-seis-zones-${sf.name}`} disabled={added || !n.ok}
                        onClick={() => onAddSeismicFaultPerZone(sf)} title={added ? 'Already in the model' : n.ok ? 'Add its hanging-wall block as a polygon per zone top (the fault surface cut with each top)' : n.reason}>
                        per zone
                      </button>
                    );
                  })()}
                </div>
              );
            })}
            {(seismicFaults.skipped || []).map((k) => (
              <p key={k.name} className="px-2 text-[10px] text-pl-muted" data-testid="em-seis-skipped">{k.name}: {k.reason}</p>
            ))}
            {!seismicFaults.faults.length && !(seismicFaults.skipped || []).length && (
              <p className="px-2 text-[11px] text-pl-muted">No interpreted faults. Pick fault sticks in Seismolord to use them here.</p>
            )}
          </>
        )}

        <div className={secCls}>Wells ({(wells || []).length})</div>
        {(wells || []).map((w) => (
          <div className={rowCls} key={w.id}>
            <CircleDot className="w-3 h-3 text-pl-muted shrink-0" />
            <span className="truncate flex-1">{w.name}</span>
            <span className="text-[10px] text-pl-muted">{(w.tops || []).length} tops · {(w.zones || []).length} zones</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
