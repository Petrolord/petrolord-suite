// Seismic Explorer — the workspace's left data tree (Petrel-explorer
// style): Volumes / Horizons / Surfaces / Faults / Wells / Traverses
// with eye visibility toggles, per-row context menus and import
// launchers. Horizons are INTERPRETATIONS (pick lattices); Surfaces
// are first-class gridded objects converted from them (shared
// geo_surfaces registry).
// Presentational: all state lives in the workspace controller
// (ViewerPanel) and arrives through `tree` + `actions`.

import React, { useState } from 'react';
import {
  Database, Layers, Slash, CircleDot, Route, Eye, EyeOff, Loader2, Upload,
  Plus, RefreshCw, ChevronDown, ChevronRight, Pencil, ArrowLeft,
  Rows, Columns, Clock, Settings2, Mountain, Download, Building2, Globe2,
  Activity, Folder, FolderPlus, History, Spline,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuSub, ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '@/components/ui/context-menu';
import { SURFACE_EXPORT_FORMATS } from '../../services/surfacesService';
import StorageMeter from '../StorageMeter';
import {
  horizonColor, faultColor, wellColor, surfaceColor,
} from './interpretationColors';

function Section({ icon: Icon, title, count, actions, children, hint }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-slate-800/60">
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          type="button"
          className="flex flex-1 min-w-0 items-center gap-1 text-[11px] font-semibold
            uppercase tracking-wider text-slate-400 hover:text-slate-200"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{title}</span>
          <span className="text-slate-600 font-normal">{count}</span>
        </button>
        <div className="flex items-center gap-0.5">{actions}</div>
      </div>
      {open && (
        <div className="pb-1.5">
          {children}
          {hint}
        </div>
      )}
    </div>
  );
}

const Hint = ({ children }) => (
  <p className="px-3 py-1 text-xs text-slate-600 leading-snug">{children}</p>
);

function IconButton({ title, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800"
    >
      {children}
    </button>
  );
}

/** One tree row: optional eye toggle, colored type icon, label, meta,
 *  busy spinner; wrapped in a context menu when `menu` is given. */
function Row({
  visible, onToggleVisible, busy, color, icon: Icon, label, meta,
  selected, onClick, onDoubleClick, badge, menu, title, depth = 0,
}) {
  const row = (
    <div
      role="button"
      tabIndex={0}
      title={title}
      style={depth ? { paddingLeft: `${10 + depth * 16}px` } : undefined}
      className={`group flex items-center gap-1.5 pl-2.5 pr-2 py-[3px] text-[13px]
        cursor-pointer select-none min-w-0
        ${selected ? 'bg-cyan-500/10 text-cyan-200' : 'text-slate-300 hover:bg-slate-800/70'}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' && onClick) onClick(); }}
    >
      {onToggleVisible ? (
        <button
          type="button"
          title={visible ? 'Hide' : 'Show'}
          className={visible ? 'text-cyan-400' : 'text-slate-600 hover:text-slate-400'}
          onClick={(e) => { e.stopPropagation(); onToggleVisible(); }}
        >
          {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
      ) : <span className="w-3.5" />}
      <Icon className="w-3.5 h-3.5 shrink-0" style={color ? { color } : undefined} />
      <span className="truncate">{label}</span>
      {badge}
      <span className="ml-auto pl-2 text-[11px] text-slate-500 whitespace-nowrap">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : meta}
      </span>
    </div>
  );
  if (!menu) return row;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">{menu}</ContextMenuContent>
    </ContextMenu>
  );
}

const geometrySummary = (meta) => (meta?.il
  ? `IL ${meta.il.min}–${meta.il.max} · XL ${meta.xl.min}–${meta.xl.max} · `
    + `${meta.ns} samples @ ${meta.dt_us / 1000} ms`
  : 'No geometry recorded');

// The active volume's slice-plane children (Petrel-style): one row per
// orientation with its own visibility eye. The eye shows/hides that
// plane's footprint in the MAP window (the time slice as an amplitude
// raster, inline/crossline as location lines); clicking the row makes it
// the Section window's orientation.
const PLANE_ICONS = { inline: Rows, xline: Columns, time: Clock };
const PLANE_TITLES = {
  inline: 'Inline plane — eye shows its location line in the Map window; click to open in the Section window',
  xline: 'Crossline plane — eye shows its location line in the Map window; click to open in the Section window',
  time: 'Time slice — eye shows the amplitude slice in the Map window; click to open in the Section window',
};

/**
 * @param {Object} p
 * @param {Object} p.tree grouped, memoized tree model from the controller
 * @param {Object} p.actions controller callbacks (select/toggle/delete/open…)
 */
export default function SeismicExplorer({ tree, actions }) {
  const {
    volumes, projects, lines2d, visibleLineIds,
    activeVolumeId, horizons, visibleIds, horizonBusyId, editTargetId,
    horizonVersions, visibleVersionIds, versionChainOf,
    surfaces, surfaceBusyId, visibleSurfaceIds,
    culture, cultureBusyId, visibleCultureIds,
    faults, visibleFaultIds, faultBusyId,
    wells, visibleWellIds, wellBusyId, wellsError,
    savedTraverses, traverseSavedId,
    slicePlanes, horizonColorById,
  } = tree;

  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-900/40">
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-slate-800">
        <Link
          to="/dashboard/geoscience"
          title="Back to Geoscience"
          className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <span className="text-sm font-semibold text-slate-200 truncate">Seismic Explorer</span>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton title="Import SEG-Y volume…" onClick={actions.openImport}>
            <Upload className="w-4 h-4" />
          </IconButton>
          <IconButton title="Import well…" onClick={actions.openWellImport}>
            <Plus className="w-4 h-4" />
          </IconButton>
          <IconButton title="Refresh volumes and wells" onClick={actions.refresh}>
            <RefreshCw className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <Section
          icon={Database}
          title="Volumes"
          count={volumes.length || ''}
          actions={(
            <IconButton title="New project (explorer grouping)…" onClick={actions.createProject}>
              <FolderPlus className="w-3.5 h-3.5" />
            </IconButton>
          )}
        >
          {(() => {
            // Derived (attribute) volumes nest under their parent; a child
            // whose parent is gone lists at the top level like any volume.
            const ids = new Set(volumes.map((v) => v.id));
            const roots = volumes.filter(
              (v) => !(v.parent_volume_id && ids.has(v.parent_volume_id)),
            );
            const childrenOf = (id) => volumes.filter((v) => v.parent_volume_id === id);
            const volumeRow = (v, depth = 0) => (
              <Row
                icon={v.kind === 'attribute' ? Activity : Database}
                depth={depth}
                label={v.name}
                title={v.is_own === false
                  ? `Shared by a teammate (read-only). ${geometrySummary(v.survey_meta)}`
                  : geometrySummary(v.survey_meta)}
                meta={v.status !== 'ready' ? v.status
                  : (depth > 0 && v.attribute_params?.name) || ''}
                badge={v.organization_id ? (
                  <span
                    title={v.is_own === false
                      ? 'Shared by a teammate (read-only)'
                      : 'Shared with your organization (read-only for members)'}
                    className="shrink-0"
                  >
                    <Building2 className={`w-3 h-3 ${v.is_own === false
                      ? 'text-sky-400' : 'text-emerald-400'}`} />
                  </span>
                ) : null}
                selected={v.id === activeVolumeId}
                onClick={() => v.status === 'ready' && actions.selectVolume(v.id)}
                menu={(
                  <>
                    <ContextMenuItem
                      disabled={v.status !== 'ready'}
                      onSelect={() => actions.selectVolume(v.id)}
                    >
                      Set active
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={v.id !== activeVolumeId}
                      onSelect={() => actions.openAttribute()}
                    >
                      Compute attribute volume…
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={v.id !== activeVolumeId}
                      onSelect={() => actions.openExport()}
                    >
                      Export surface / picks…
                    </ContextMenuItem>
                    {v.is_own !== false && (
                      <>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>
                            <Folder className="w-3.5 h-3.5 mr-1.5" />
                            Move to project
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="w-52">
                            {(projects || []).map((pr) => (
                              <ContextMenuItem
                                key={pr.id}
                                disabled={v.project_id === pr.id}
                                onSelect={() => actions.moveVolumeToProject(v, pr.id)}
                              >
                                {pr.name}
                              </ContextMenuItem>
                            ))}
                            <ContextMenuItem
                              disabled={!v.project_id}
                              onSelect={() => actions.moveVolumeToProject(v, null)}
                            >
                              No project (flat list)
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem onSelect={() => actions.createProject()}>
                              New project…
                            </ContextMenuItem>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuItem onSelect={() => actions.shareVolume(v)}>
                          <Building2 className="w-3.5 h-3.5 mr-1.5" />
                          {v.organization_id ? 'Make private' : 'Share with organization'}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          className="text-red-400 focus:text-red-300"
                          onSelect={() => actions.deleteVolume(v)}
                        >
                          Delete volume…
                        </ContextMenuItem>
                      </>
                    )}
                  </>
                )}
              />
            );
            // W4.2: group by project (flat list stays the default); a
            // project header row carries its own delete (volumes unfile)
            const projList = projects || [];
            const filed = new Set(projList.map((pr) => pr.id));
            const rootsIn = (pid) => roots.filter((v) => (pid
              ? v.project_id === pid
              : !v.project_id || !filed.has(v.project_id)));
            const renderRoot = (v, depth = 0) => (
              <React.Fragment key={v.id}>
                {volumeRow(v, depth)}
                {v.id === activeVolumeId && (slicePlanes || []).map((pl) => (
                  <Row
                    key={pl.key}
                    depth={depth + 1}
                    icon={PLANE_ICONS[pl.key] || Layers}
                    label={pl.label}
                    title={PLANE_TITLES[pl.key]}
                    visible={pl.visible}
                    onToggleVisible={() => actions.toggleSlicePlane(pl.key)}
                    onClick={() => actions.selectPlane(pl.key)}
                  />
                ))}
                {childrenOf(v.id).map((c) => (
                  <React.Fragment key={c.id}>
                    {volumeRow(c, depth + 1)}
                    {c.id === activeVolumeId && (slicePlanes || []).map((pl) => (
                      <Row
                        key={pl.key}
                        depth={depth + 2}
                        icon={PLANE_ICONS[pl.key] || Layers}
                        label={pl.label}
                        title={PLANE_TITLES[pl.key]}
                        visible={pl.visible}
                        onToggleVisible={() => actions.toggleSlicePlane(pl.key)}
                        onClick={() => actions.selectPlane(pl.key)}
                      />
                    ))}
                  </React.Fragment>
                ))}
              </React.Fragment>
            );
            return (
              <>
                {projList.map((pr) => {
                  const inProject = rootsIn(pr.id);
                  return (
                    <React.Fragment key={pr.id}>
                      <Row
                        icon={Folder}
                        label={pr.name}
                        meta={String(inProject.length || '')}
                        title="Project (explorer grouping) — volumes inside are unchanged"
                        menu={(
                          <>
                            <ContextMenuItem
                              className="text-red-400 focus:text-red-300"
                              onSelect={() => actions.deleteProject(pr)}
                            >
                              Delete project (volumes stay)…
                            </ContextMenuItem>
                          </>
                        )}
                      />
                      {inProject.map((v) => renderRoot(v, 1))}
                      {!inProject.length && (
                        <Hint>Empty project — use a volume&apos;s &quot;Move to project&quot;.</Hint>
                      )}
                    </React.Fragment>
                  );
                })}
                {rootsIn(null).map((v) => renderRoot(v, 0))}
              </>
            );
          })()}
          {!volumes.length && (
            <Hint>No volumes yet — import a SEG-Y file to get started.</Hint>
          )}
        </Section>

        <Section icon={Spline} title="2D Lines" count={(lines2d || []).length || ''}>
          {(lines2d || []).map((l, idx) => (
            <Row
              key={l.id}
              icon={Spline}
              color={wellColor(idx)}
              label={l.name}
              visible={visibleLineIds?.has(l.id)}
              onToggleVisible={() => actions.toggleLine2d(l)}
              meta={l.status !== 'ready' ? l.status
                : (l.is_own === false ? 'teammate'
                  : `${((l.survey_meta?.length_m || 0) / 1000).toFixed(1)} km`)}
              badge={l.organization_id ? (
                <span
                  title={l.is_own === false
                    ? 'Shared by a teammate (read-only)'
                    : 'Shared with your organization (read-only for members)'}
                  className="shrink-0"
                >
                  <Building2 className={`w-3 h-3 ${l.is_own === false
                    ? 'text-sky-400' : 'text-emerald-400'}`} />
                </span>
              ) : null}
              title={`2D line · ${l.survey_meta?.ntraces || '?'} traces · the eye shows its navigation on the map; open it in the 2D Lines window`}
              onClick={() => actions.openLineWindow()}
              menu={(
                <>
                  <ContextMenuItem onSelect={() => actions.openLineWindow()}>
                    Open the 2D Lines window
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => actions.toggleLine2d(l)}>
                    {visibleLineIds?.has(l.id) ? 'Hide on map' : 'Show on map'}
                  </ContextMenuItem>
                  {l.is_own !== false && (
                    <>
                      <ContextMenuItem onSelect={() => actions.shareLine(l)}>
                        <Building2 className="w-3.5 h-3.5 mr-1.5" />
                        {l.organization_id ? 'Make private' : 'Share with organization'}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        className="text-red-400 focus:text-red-300"
                        onSelect={() => actions.deleteLine(l)}
                      >
                        Delete line…
                      </ContextMenuItem>
                    </>
                  )}
                </>
              )}
            />
          ))}
          {!(lines2d || []).length && (
            <Hint>
              No 2D lines yet — import a 2D SEG-Y in the 2D Lines window.
              Crooked lines are fine: navigation comes from the trace headers.
            </Hint>
          )}
        </Section>

        <Section icon={Layers} title="Horizons" count={horizons.length || ''}>
          {horizons.map((h, idx) => (
            <Row
              key={h.id}
              icon={Layers}
              color={horizonColorById?.[h.id] || horizonColor(idx)}
              label={h.name}
              visible={visibleIds.has(h.id)}
              onToggleVisible={() => actions.toggleHorizon(h)}
              busy={horizonBusyId === h.id}
              badge={editTargetId === h.id
                ? (
                  <span title="Edit target" className="shrink-0">
                    <Pencil className="w-3 h-3 text-yellow-400" />
                  </span>
                )
                : null}
              meta={[h.version > 1 ? `v${h.version}` : '',
                h.is_own === false ? 'teammate'
                  : (h.stats?.coverage != null ? `${Math.round(h.stats.coverage * 100)}%` : ''),
              ].filter(Boolean).join(' ')}
              title={h.stats?.min_twt_ms != null
                ? `${h.stats.min_twt_ms.toFixed(0)}–${h.stats.max_twt_ms.toFixed(0)} ms`
                : undefined}
              onClick={() => actions.toggleHorizon(h)}
              menu={(
                <>
                  <ContextMenuItem onSelect={() => actions.openHorizonSettings(h)}>
                    <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                    Settings…
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => actions.toggleHorizon(h)}>
                    {visibleIds.has(h.id) ? 'Hide' : 'Show'}
                  </ContextMenuItem>
                  {(() => {
                    const chain = versionChainOf ? versionChainOf(h) : [];
                    if (!chain.length) return null;
                    return (
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>
                          <History className="w-3.5 h-3.5 mr-1.5" />
                          {`History (${chain.length})`}
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-64">
                          {chain.map((v) => (
                            <React.Fragment key={v.id}>
                              <ContextMenuItem onSelect={() => actions.toggleVersion(v)}>
                                {`${visibleVersionIds?.has(v.id) ? 'Hide' : 'Show'} v${v.version}`}
                                <span className="ml-auto pl-2 text-[10px] text-slate-500 truncate">
                                  {v.interpreter || ''}
                                </span>
                              </ContextMenuItem>
                              {h.is_own !== false && (
                                <ContextMenuItem onSelect={() => actions.restoreVersion(h, v)}>
                                  {`Restore v${v.version} as new version`}
                                </ContextMenuItem>
                              )}
                            </React.Fragment>
                          ))}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                    );
                  })()}
                  {h.is_own !== false && (
                    <>
                      <ContextMenuItem onSelect={() => actions.newHorizonVersion(h)}>
                        <History className="w-3.5 h-3.5 mr-1.5" />
                        New version (snapshot)
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => actions.setEditTarget(h.id)}>
                        Set as edit target
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        className="text-red-400 focus:text-red-300"
                        onSelect={() => actions.deleteHorizon(h)}
                      >
                        Delete horizon…
                      </ContextMenuItem>
                    </>
                  )}
                </>
              )}
            />
          ))}
          {!horizons.length && (
            <Hint>
              {activeVolumeId
                ? 'No horizons yet — pick a seed on the section, then Track 3D.'
                : 'Select a volume to see its horizons.'}
            </Hint>
          )}
        </Section>

        <Section
          icon={Mountain}
          title="Surfaces"
          count={(surfaces || []).length || ''}
          actions={(
            <IconButton title="Import surface, picks or faults…" onClick={actions.openSurfaceImport}>
              <Upload className="w-3.5 h-3.5" />
            </IconButton>
          )}
        >
          {(surfaces || []).map((s, idx) => (
            <Row
              key={s.id}
              icon={Mountain}
              color={surfaceColor(idx)}
              label={s.name}
              busy={surfaceBusyId === s.id}
              visible={visibleSurfaceIds?.has(s.id)}
              onToggleVisible={() => actions.toggleSurface(s)}
              meta={`${s.nx}×${s.ny}`}
              badge={s.organization_id ? (
                <span
                  title={s.is_own === false
                    ? 'Shared by a teammate (read-only)'
                    : 'Shared with your organization (read-only for members)'}
                  className="shrink-0"
                >
                  <Building2 className={`w-3 h-3 ${s.is_own === false
                    ? 'text-sky-400' : 'text-emerald-400'}`} />
                </span>
              ) : null}
              title={`${s.z_domain === 'time' ? 'TWT'
                : s.z_domain === 'attribute' ? 'Amplitude attribute' : 'Depth'} surface from `
                + `${s.is_own === false ? 'a teammate (org-shared, read-only)'
                  : s.provenance?.horizon?.name
                  || (s.provenance?.imported_from ? 'import' : 'horizon')} · cell `
                + `${s.dx} m. The eye shows it in the Map window${
                  s.z_domain === 'attribute' ? ' (attribute surfaces are map-only)'
                    : ' and dashed on sections (depth surfaces need a velocity model there)'}.`}
              onClick={() => actions.toggleSurface(s)}
              menu={(
                <>
                  <ContextMenuItem onSelect={() => actions.toggleSurface(s)}>
                    {visibleSurfaceIds?.has(s.id) ? 'Hide' : 'Show'}
                  </ContextMenuItem>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Export as
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-48">
                      {SURFACE_EXPORT_FORMATS.map((f) => (
                        <ContextMenuItem
                          key={f.key}
                          onSelect={() => actions.exportSurface(s, f.key)}
                        >
                          {f.label}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  {s.is_own !== false && (
                    <>
                      <ContextMenuItem onSelect={() => actions.shareSurface(s)}>
                        <Building2 className="w-3.5 h-3.5 mr-1.5" />
                        {s.organization_id ? 'Make private' : 'Share with organization'}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        className="text-red-400 focus:text-red-300"
                        onSelect={() => actions.deleteSurface(s)}
                      >
                        Delete surface…
                      </ContextMenuItem>
                    </>
                  )}
                </>
              )}
            />
          ))}
          {!(surfaces || []).length && (
            <Hint>
              {activeVolumeId
                ? 'No surfaces yet. Grid a horizon in Export and choose "Save as '
                  + 'surface", or import a surface file here.'
                : 'Select a volume to see its surfaces.'}
            </Hint>
          )}
        </Section>

        <Section
          icon={Globe2}
          title="Culture"
          count={(culture || []).length || ''}
          actions={(
            <IconButton title="Import GeoJSON or shapefile…" onClick={actions.openCultureImport}>
              <Upload className="w-3.5 h-3.5" />
            </IconButton>
          )}
        >
          {(culture || []).map((c) => (
            <Row
              key={c.id}
              icon={Globe2}
              color={c.style?.color || '#f59e0b'}
              label={c.name}
              busy={cultureBusyId === c.id}
              visible={visibleCultureIds?.has(c.id)}
              onToggleVisible={() => actions.toggleCulture(c)}
              meta={`${c.feature_count}`}
              badge={c.organization_id ? (
                <span
                  title={c.is_own === false
                    ? 'Shared by a teammate (read-only)'
                    : 'Shared with your organization (read-only for members)'}
                  className="shrink-0"
                >
                  <Building2 className={`w-3 h-3 ${c.is_own === false
                    ? 'text-sky-400' : 'text-emerald-400'}`} />
                </span>
              ) : null}
              title={`${c.kind.replace('_', ' ')} · ${c.geometry_type} · `
                + `${c.crs || 'unknown CRS'}. The eye shows it in the Map window `
                + '(converted into the active volume’s frame when both CRS are known).'}
              onClick={() => actions.toggleCulture(c)}
              menu={(
                <>
                  <ContextMenuItem onSelect={() => actions.toggleCulture(c)}>
                    {visibleCultureIds?.has(c.id) ? 'Hide' : 'Show'}
                  </ContextMenuItem>
                  {c.is_own !== false && (
                    <>
                      <ContextMenuItem onSelect={() => actions.shareCulture(c)}>
                        <Building2 className="w-3.5 h-3.5 mr-1.5" />
                        {c.organization_id ? 'Make private' : 'Share with organization'}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        className="text-red-400 focus:text-red-300"
                        onSelect={() => actions.deleteCulture(c)}
                      >
                        Delete layer…
                      </ContextMenuItem>
                    </>
                  )}
                </>
              )}
            />
          ))}
          {!(culture || []).length && (
            <Hint>
              No culture layers yet. Import license blocks, field outlines,
              pipelines or coastlines from GeoJSON or a shapefile.
            </Hint>
          )}
        </Section>

        <Section icon={Slash} title="Faults" count={faults.length || ''}>
          {faults.map((f, idx) => (
            <Row
              key={f.id}
              icon={Slash}
              color={faultColor(idx)}
              label={f.name}
              visible={visibleFaultIds.has(f.id)}
              onToggleVisible={() => actions.toggleFault(f)}
              busy={faultBusyId === f.id}
              meta={f.is_own === false ? 'teammate'
                : `${f.sticks.length} stick${f.sticks.length === 1 ? '' : 's'}`}
              onClick={() => actions.toggleFault(f)}
              menu={(
                <>
                  <ContextMenuItem onSelect={() => actions.toggleFault(f)}>
                    {visibleFaultIds.has(f.id) ? 'Hide' : 'Show'}
                  </ContextMenuItem>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Export sticks
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-60">
                      <ContextMenuItem onSelect={() => actions.exportFaultSticks(f, 'positive')}>
                        Charisma, positive down (Petrel)
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => actions.exportFaultSticks(f, 'negative')}>
                        Charisma, negative down (suite)
                      </ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Export surface (XYZ)
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-60">
                      <ContextMenuItem onSelect={() => actions.exportFaultSurface(f, 'positive')}>
                        TWT positive down (Petrel)
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => actions.exportFaultSurface(f, 'negative')}>
                        TWT negative down (suite)
                      </ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  {(horizons || []).length > 0 && (
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Fault polygon vs horizon
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-60">
                        {horizons.map((h) => (
                          <ContextMenuItem
                            key={h.id}
                            onSelect={() => actions.exportFaultPolygon(f, h)}
                          >
                            {h.name}
                          </ContextMenuItem>
                        ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  )}
                  {f.is_own !== false && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        className="text-red-400 focus:text-red-300"
                        onSelect={() => actions.deleteFault(f)}
                      >
                        Delete fault…
                      </ContextMenuItem>
                    </>
                  )}
                </>
              )}
            />
          ))}
          {!faults.length && (
            <Hint>
              {activeVolumeId
                ? 'No faults yet — pick fault points on a section, then Save fault.'
                : 'Select a volume to see its faults.'}
            </Hint>
          )}
        </Section>

        <Section
          icon={CircleDot}
          title="Wells"
          count={wells.length || ''}
          actions={(
            <IconButton title="Import well…" onClick={actions.openWellImport}>
              <Plus className="w-3.5 h-3.5" />
            </IconButton>
          )}
        >
          {wells.map((w, idx) => (
            <Row
              key={w.id}
              icon={CircleDot}
              color={wellColor(idx)}
              label={w.name}
              visible={visibleWellIds.has(w.id)}
              onToggleVisible={() => actions.toggleWell(w)}
              busy={wellBusyId === w.id}
              meta={`${w.deviation?.length >= 2 ? `${w.deviation.length} stn` : 'vertical'}`
                + `${w.tops?.length ? ` · ${w.tops.length} tops` : ''}`
                + `${w.checkshots?.length ? ' · T-D' : ''}`}
              title={w.td_md_m ? `TD ${Math.round(w.td_md_m)} m MD` : undefined}
              onClick={() => actions.toggleWell(w)}
              menu={(
                <>
                  <ContextMenuItem onSelect={() => actions.toggleWell(w)}>
                    {visibleWellIds.has(w.id) ? 'Hide' : 'Show'}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-red-400 focus:text-red-300"
                    onSelect={() => actions.deleteWell(w)}
                  >
                    Delete well…
                  </ContextMenuItem>
                </>
              )}
            />
          ))}
          {wellsError && <Hint>{wellsError}</Hint>}
          {!wells.length && !wellsError && (
            <Hint>
              No wells yet — import one with a pasted deviation survey, or just
              name + surface X/Y + TD for a vertical well.
            </Hint>
          )}
        </Section>

        <Section icon={Route} title="Traverses" count={savedTraverses.length || ''}>
          {savedTraverses.map((t) => (
            <Row
              key={t.id}
              icon={Route}
              label={t.name}
              selected={t.id === traverseSavedId}
              meta={`${t.vertices.length} pts`}
              onClick={() => actions.openTraverse(t)}
              menu={(
                <>
                  <ContextMenuItem onSelect={() => actions.openTraverse(t)}>
                    Open in Traverse window
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-red-400 focus:text-red-300"
                    onSelect={() => actions.deleteTraverse(t)}
                  >
                    Delete traverse…
                  </ContextMenuItem>
                </>
              )}
            />
          ))}
          {!savedTraverses.length && (
            <Hint>
              {activeVolumeId
                ? 'Draw a traverse in the Map window, then save it to keep it here.'
                : 'Select a volume to see its saved traverses.'}
            </Hint>
          )}
        </Section>
      </ScrollArea>
      <StorageMeter
        className="shrink-0 px-2 py-1.5 border-t border-slate-800"
        refreshKey={`${volumes.length}:${lines2d.length}`}
      />
    </div>
  );
}
