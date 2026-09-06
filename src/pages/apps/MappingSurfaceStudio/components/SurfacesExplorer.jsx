// Surfaces explorer (Mapping & Surface Studio G4.3, MS2): saved
// surfaces list (select to view; a right-click menu with export in the
// industry formats, the control points CSV, rename, re-grid, share and
// delete; badges for domain/unit and CRS; share toggle + owner-only
// delete kept as buttons) plus the "grid a new surface" form: a
// control-point source from the registry (a top across wells with its
// depth reference, or a zone attribute with its zone), a cell size,
// and Grid. Presentational; the controller owns state + the engine
// calls. On OWN rows the org/private badge is the share toggle
// (read-only for members, the geo_wells model); teammates' rows keep a
// passive badge.

import React, { useState } from 'react';
import { SAND_FAMILY } from '@/lib/stratigraphy/stratMaps';
import { LITHOLOGIES } from '@/lib/stratigraphy/lithology';
import {
  Layers, Building2, Lock, Trash2, Grid3x3, Loader2, FileUp, Download, Pencil, RefreshCw, Table2, Share2, ExternalLink,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
} from '@/components/ui/context-menu';
import { Link } from 'react-router-dom';
import { normalizeTag, isTransformableTag } from '@/lib/crs/tags';
import { EXPORT_FORMATS, describeSurface, isLengthSurface } from '../services/surfaceExport';
import { GRID_METHODS, VARIOGRAM_MODELS } from '../services/krigingPlan';
import { OpenInAppSubmenu } from '@/components/wells/OpenInAppMenu';
import { appPath, earthModelingSurfaceHref, MAPPING_ID } from '@/components/wells/appLinks';

const selCls = 'w-full rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';

/** Short domain/unit badge text: `depth · m`, `TWT ms`, `attr`. */
export function domainBadge(s) {
  if (!s) return '';
  if (s.z_domain === 'time') return 'TWT ms';
  if (!isLengthSurface(s)) return 'attr';
  return `${s.kind === 'isochore' ? 'thick' : 'depth'} · ${s.z_unit || 'm'}`;
}

function SurfaceRow({
  s, selected, onSelect, onDelete, onToggleShare, sharingId, onExport, onPointsCsv, onRename, onRegrid, replacing, appPaths = {},
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(s.name);
  const shared = !!s.organization_id;
  const crsOk = isTransformableTag(s.crs);
  const canRegrid = s.is_own && (s.provenance?.source?.type === 'top' || s.provenance?.source?.type === 'zone');
  const hasPoints = Array.isArray(s.provenance?.points) && s.provenance.points.length > 0;

  const commitRename = () => {
    setRenaming(false);
    const v = draft.trim();
    if (v && v !== s.name) onRename(s, v);
    else setDraft(s.name);
  };

  const row = (
    <div role="button" tabIndex={0} data-testid="map-surface-row" data-surface-name={s.name}
      title={describeSurface(s)}
      className={`group flex items-center gap-1.5 pl-2.5 pr-2 py-[3px] text-[13px] cursor-pointer select-none min-w-0
        ${selected ? 'bg-cyan-500/10 text-cyan-200' : 'text-slate-300 hover:bg-slate-800/70'}
        ${replacing ? 'ring-1 ring-inset ring-amber-500/60' : ''}`}
      onClick={() => onSelect(s.id)} onKeyDown={(e) => { if (e.key === 'Enter' && !renaming) onSelect(s.id); }}>
      <Layers className="w-3.5 h-3.5 shrink-0 text-amber-400" />
      {renaming ? (
        <input autoFocus data-testid="map-rename-input" value={draft}
          className="flex-1 min-w-0 rounded bg-slate-950 border border-cyan-700 px-1 text-[12px] text-slate-100"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') { setRenaming(false); setDraft(s.name); }
          }}
          onBlur={commitRename} />
      ) : (
        <span className="truncate">{s.name}</span>
      )}
      <span className="text-[10px] text-slate-500 whitespace-nowrap" data-testid="map-row-badge">{domainBadge(s)}</span>
      <span className={`text-[10px] whitespace-nowrap ${crsOk ? 'text-sky-400/80' : 'text-amber-400/80'}`}
        title={crsOk ? `Grid frame: ${normalizeTag(s.crs)}` : 'Placement unverified: no CRS on this surface'}>
        {crsOk ? normalizeTag(s.crs).replace('EPSG:', 'E') : 'no CRS'}
      </span>
      {replacing && <span className="text-[10px] text-amber-300" data-testid="map-row-replacing">re-gridding</span>}
      {s.is_own ? (
        <button type="button" data-testid={`map-share-${s.name}`}
          className={`ml-auto inline-flex items-center rounded px-1 py-0.5 text-[10px] border border-transparent
            hover:border-slate-600 disabled:opacity-40
            ${shared ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-400'}`}
          title={shared
            ? 'Shared with your organization (read-only for members): click to make private'
            : 'Private: click to share with your organization (read-only for members)'}
          disabled={sharingId === s.id}
          onClick={(e) => { e.stopPropagation(); onToggleShare(s); }}>
          {sharingId === s.id
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : shared ? <Building2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
        </button>
      ) : (
        <span className="ml-auto inline-flex items-center rounded px-1 text-[10px] bg-sky-500/15 text-sky-300"
          title="Shared by a teammate (read-only)">
          <Building2 className="w-3 h-3" />
        </span>
      )}
      {s.is_own && (
        <button type="button" title={`Delete ${s.name}`} data-testid={`map-delete-${s.name}`}
          className="text-slate-500 hover:text-red-400" onClick={(e) => { e.stopPropagation(); onDelete(s); }}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ContextMenuSub>
          <ContextMenuSubTrigger data-testid="map-row-export-sub"><Download className="w-4 h-4 mr-2" /> Export as</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-56">
            {EXPORT_FORMATS.map((f) => (
              <ContextMenuItem key={f.key} data-testid={`map-row-export-${f.key}`} onSelect={() => onExport(s, f.key)}>
                {f.label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem data-testid="map-row-points-csv" disabled={!hasPoints} onSelect={() => onPointsCsv(s)}>
          <Table2 className="w-4 h-4 mr-2" /> Control points CSV
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem asChild>
          <Link to={appPath('reservoircalc-pro', appPaths)} data-testid="map-row-open-reservoircalc-pro" title="Volumetrics: the surface is listed in its Surface import"><ExternalLink className="w-4 h-4 mr-2" /> Open in ReservoirCalc Pro</Link>
        </ContextMenuItem>
        <ContextMenuItem asChild>
          <Link to={earthModelingSurfaceHref(s.id, appPath('earth-modeling', appPaths))} data-testid="map-row-open-earth-modeling" title="Stack this surface in an Earth Modeling framework"><ExternalLink className="w-4 h-4 mr-2" /> Open in Earth Modeling</Link>
        </ContextMenuItem>
        <ContextMenuItem asChild>
          <Link to={appPath('seismolord', appPaths)} data-testid="map-row-open-seismolord" title="Seismolord lists registry surfaces in its Surfaces section"><ExternalLink className="w-4 h-4 mr-2" /> Show in Seismolord</Link>
        </ContextMenuItem>
        {s.is_own && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem data-testid="map-row-rename" onSelect={() => { setDraft(s.name); setRenaming(true); }}>
              <Pencil className="w-4 h-4 mr-2" /> Rename
            </ContextMenuItem>
            <ContextMenuItem data-testid="map-row-regrid" disabled={!canRegrid} onSelect={() => onRegrid(s)}>
              <RefreshCw className="w-4 h-4 mr-2" /> Re-grid in place
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onToggleShare(s)}>
              <Share2 className="w-4 h-4 mr-2" /> {shared ? 'Stop sharing with organization' : 'Share with organization'}
            </ContextMenuItem>
            <ContextMenuItem className="text-red-400" data-testid="map-row-delete" onSelect={() => onDelete(s)}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

const NET_CODES = LITHOLOGIES.filter((l) => ['sandstone', 'siltstone', 'conglomerate', 'limestone', 'dolomite', 'chalk', 'coal'].includes(l.code));

export default function SurfacesExplorer({
  surfaces, selectedId, onSelect, onDelete, onToggleShare, sharingId,
  topNames, zoneNames = [], zoneKeys, source, onSource,
  depthRef = 'tvdss', onDepthRef, cellM, onCellM, onGrid, gridding,
  gridMethod = 'tps', onGridMethod, variogram, onVariogram, onFitVariogram, variance = null,
  onImport, onExport, onPointsCsv, onRename, onRegrid, replaceId = null, appPaths = {}, wells = [],
  environmentRows = [],
}) {
  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-900/60" data-testid="map-explorer">
      <div className="p-2 space-y-1.5 border-b border-slate-800/60">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Grid a new surface</div>
        <select className={selCls} value={`${source.type}:${source.key}`} data-testid="map-source"
          onChange={(e) => {
            const [type, key] = e.target.value.split(':');
            onSource(type === 'top'
              ? { type: 'top', key }
              : type === 'net'
                ? { type: 'net', key, measure: key, upper: source.upper || topNames[0] || '', lower: source.lower || topNames[topNames.length - 1] || '', codes: source.codes || [...SAND_FAMILY] }
                : { type: 'zone', zoneName: source.zoneName || zoneNames[0] || '', key });
          }}>
          <optgroup label="Structure: top across wells">
            {topNames.map((n) => <option key={`top:${n}`} value={`top:${n}`}>Top: {n}</option>)}
          </optgroup>
          <optgroup label="Attribute: zone property">
            {zoneKeys.map((k) => <option key={`zone:${k}`} value={`zone:${k}`}>Zone: {k}</option>)}
          </optgroup>
          <optgroup label="Stratigraphy: between two tops">
            <option value="net:net">Net sand thickness</option>
            <option value="net:gross">Gross thickness</option>
            <option value="net:ratio">Net to gross</option>
          </optgroup>
        </select>
        {source.type === 'net' && (
          <div className="space-y-1 rounded border border-slate-800 p-1.5" data-testid="map-net-form">
            <div className="flex items-center gap-1">
              <select className={`${selCls} flex-1`} value={source.upper} data-testid="map-net-upper" title="Upper surface" onChange={(e) => onSource({ ...source, upper: e.target.value })}>
                {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-slate-500">to</span>
              <select className={`${selCls} flex-1`} value={source.lower} data-testid="map-net-lower" title="Lower surface" onChange={(e) => onSource({ ...source, lower: e.target.value })}>
                {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {source.measure !== 'gross' && (
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-400" data-testid="map-net-codes" title="Lithologies counted as net">
                {NET_CODES.map((c) => (
                  <label key={c.code} className="flex items-center gap-1">
                    <input type="checkbox" checked={(source.codes || []).includes(c.code)} data-testid={`map-net-code-${c.code}`}
                      onChange={(e) => onSource({ ...source, codes: e.target.checked ? [...(source.codes || []), c.code] : (source.codes || []).filter((x) => x !== c.code) })} />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
            <div className="text-[10px] text-slate-500">Measured-depth thickness between the two picks; net from each well's lithology log.</div>
            {environmentRows.length > 0 && (
              <div className="space-y-0.5" data-testid="map-env-table">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Environment between the tops</div>
                {environmentRows.map((r) => (
                  <div key={r.well} className="flex items-center gap-1 text-[11px] text-slate-300" data-testid={`map-env-${r.well}`}>
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: r.colour }} />
                    <span className="w-16 truncate">{r.well}</span>
                    <span className="text-slate-400 truncate">{r.label}</span>
                    <span className="ml-auto text-slate-500">{Math.round(r.thickness_m)} m</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {source.type === 'top' && (
          <select className={selCls} value={depthRef} data-testid="map-depth-ref"
            title="Depth reference of the structure map. TVDSS and TVD grid elevations at the borehole position through each well's survey and KB; MD is the raw measured depth."
            onChange={(e) => onDepthRef?.(e.target.value)}>
            <option value="tvdss">TVDSS (elevation, below datum)</option>
            <option value="tvd">TVD (below KB)</option>
            <option value="md">MD (measured, raw)</option>
          </select>
        )}
        {source.type === 'zone' && (
          <select className={selCls} value={source.zoneName || ''} data-testid="map-zone"
            title="Zone whose property is mapped"
            onChange={(e) => onSource({ ...source, zoneName: e.target.value })}>
            {zoneNames.map((n) => <option key={n} value={n}>{n}</option>)}
            {!zoneNames.length && <option value="">no zones in the registry</option>}
          </select>
        )}
        <select className={selCls} value={gridMethod} data-testid="map-grid-method"
          title="Gridding method. The thin-plate spline passes exactly through the wells; ordinary kriging weights them by a variogram and reports a variance map."
          onChange={(e) => onGridMethod?.(e.target.value)}>
          {GRID_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        {gridMethod === 'kriging' && variogram && (
          <div className="space-y-1 rounded border border-slate-800 p-1.5" data-testid="map-variogram">
            <div className="flex items-center gap-1">
              <select className={`${selCls} flex-1`} value={variogram.model} data-testid="map-vg-model" title="Variogram model"
                onChange={(e) => onVariogram({ ...variogram, model: e.target.value })}>
                {VARIOGRAM_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <button type="button" data-testid="map-vg-fit" title="Fit range and sill from the experimental variogram of the control points"
                className="px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800" onClick={onFitVariogram}>Fit</button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <input className={selCls} value={variogram.range} data-testid="map-vg-range" placeholder="range m" title="Range (m): beyond it wells no longer correlate"
                onChange={(e) => onVariogram({ ...variogram, range: e.target.value })} />
              <input className={selCls} value={variogram.sill} data-testid="map-vg-sill" placeholder="sill" title="Sill: the variance of the field (metres squared)"
                onChange={(e) => onVariogram({ ...variogram, sill: e.target.value })} />
              <input className={selCls} value={variogram.nugget} data-testid="map-vg-nugget" placeholder="nugget" title="Nugget: measurement noise at zero distance"
                onChange={(e) => onVariogram({ ...variogram, nugget: e.target.value })} />
            </div>
            <label className="flex items-center gap-1 text-[10px] text-slate-400" title="Fit a plane through the wells first and krige the residuals, so a regional dip is honoured">
              <input type="checkbox" data-testid="map-vg-detrend" checked={variogram.detrend !== false} onChange={(e) => onVariogram({ ...variogram, detrend: e.target.checked })} /> remove the trend first
            </label>
            {variance && (
              <label className="flex items-center gap-1 text-[10px] text-slate-400" title="Show the kriging variance instead of the surface">
                <input type="checkbox" data-testid="map-vg-variance" checked={variance.shown} onChange={(e) => variance.onToggle(e.target.checked)} /> show the variance map
              </label>
            )}
          </div>
        )}
        <div className="flex items-center gap-1">
          <input className={`${selCls} flex-1`} value={cellM} data-testid="map-cell"
            onChange={(e) => onCellM(e.target.value)} placeholder="cell m" title="Grid cell size (m)" />
          <button type="button" data-testid="map-grid-run"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
            disabled={gridding} onClick={onGrid}>
            <Grid3x3 className="w-3.5 h-3.5" /> Grid
          </button>
        </div>
      </div>

      <div className="px-2.5 py-1 flex items-center text-[11px] uppercase tracking-wider text-slate-500">
        <span>Surfaces <span data-testid="map-surface-count">{surfaces.length}</span></span>
        {onImport && (
          <button type="button" data-testid="map-import" title="Import a surface grid file (XYZ, CPS-3, ZMAP+, Irap)"
            className="ml-auto inline-flex items-center gap-1 normal-case tracking-normal text-[11px] text-cyan-300 hover:text-cyan-200"
            onClick={onImport}>
            <FileUp className="w-3.5 h-3.5" /> Import
          </button>
        )}
      </div>
      <ScrollArea className="flex-1 min-h-0">
        {surfaces.map((s) => (
          <SurfaceRow key={s.id} s={s} selected={s.id === selectedId} onSelect={onSelect} onDelete={onDelete}
            onToggleShare={onToggleShare} sharingId={sharingId} onExport={onExport} onPointsCsv={onPointsCsv}
            onRename={onRename} onRegrid={onRegrid} replacing={replaceId === s.id} appPaths={appPaths} />
        ))}
        {!surfaces.length && <p className="px-3 py-2 text-xs text-slate-600 leading-snug">No surfaces yet: grid a top above, import a file, then publish.</p>}
        <div className="px-2.5 pt-2 pb-1 text-[11px] uppercase tracking-wider text-slate-500 border-t border-slate-800/60 mt-1">
          Wells <span data-testid="map-well-count">{wells.length}</span>
        </div>
        {wells.map((w) => (
          <ContextMenu key={w.id}>
            <ContextMenuTrigger asChild>
              <div role="button" tabIndex={0} data-testid="map-well-row" data-well-name={w.name}
                title="Right-click to open this well in another Geoscience app"
                className="flex items-center gap-1.5 pl-2.5 pr-2 py-[2px] text-[12px] text-slate-400 hover:bg-slate-800/70 cursor-context-menu select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                <span className="truncate">{w.name}</span>
                <span className="ml-auto text-[10px] text-slate-600">{(w.tops || []).length} tops</span>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <OpenInAppSubmenu wellIds={[w.id]} paths={appPaths} testIdPrefix="map-well" exclude={[MAPPING_ID]} />
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </ScrollArea>
    </div>
  );
}
