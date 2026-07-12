// Seismic Explorer — the workspace's left data tree (Petrel-explorer
// style): Volumes / Horizons / Faults / Wells / Traverses with eye
// visibility toggles, per-row context menus and import launchers.
// Presentational: all state lives in the workspace controller
// (ViewerPanel) and arrives through `tree` + `actions`.

import React, { useState } from 'react';
import {
  Database, Layers, Slash, CircleDot, Route, Eye, EyeOff, Loader2, Upload,
  Plus, RefreshCw, ChevronDown, ChevronRight, Pencil, ArrowLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { horizonColor, faultColor, wellColor } from './interpretationColors';

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
  selected, onClick, onDoubleClick, badge, menu, title,
}) {
  const row = (
    <div
      role="button"
      tabIndex={0}
      title={title}
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

/**
 * @param {Object} p
 * @param {Object} p.tree grouped, memoized tree model from the controller
 * @param {Object} p.actions controller callbacks (select/toggle/delete/open…)
 */
export default function SeismicExplorer({ tree, actions }) {
  const {
    volumes, activeVolumeId, horizons, visibleIds, horizonBusyId, editTargetId,
    faults, visibleFaultIds, faultBusyId,
    wells, visibleWellIds, wellBusyId, wellsError,
    savedTraverses, traverseSavedId,
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
        <Section icon={Database} title="Volumes" count={volumes.length || ''}>
          {volumes.map((v) => (
            <Row
              key={v.id}
              icon={Database}
              label={v.name}
              title={geometrySummary(v.survey_meta)}
              meta={v.status !== 'ready' ? v.status : ''}
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
                    onSelect={() => actions.openExport()}
                  >
                    Export surfaces…
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
            />
          ))}
          {!volumes.length && (
            <Hint>No volumes yet — import a SEG-Y file to get started.</Hint>
          )}
        </Section>

        <Section icon={Layers} title="Horizons" count={horizons.length || ''}>
          {horizons.map((h, idx) => (
            <Row
              key={h.id}
              icon={Layers}
              color={horizonColor(idx)}
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
              meta={h.stats?.coverage != null ? `${Math.round(h.stats.coverage * 100)}%` : ''}
              title={h.stats?.min_twt_ms != null
                ? `${h.stats.min_twt_ms.toFixed(0)}–${h.stats.max_twt_ms.toFixed(0)} ms`
                : undefined}
              onClick={() => actions.toggleHorizon(h)}
              menu={(
                <>
                  <ContextMenuItem onSelect={() => actions.toggleHorizon(h)}>
                    {visibleIds.has(h.id) ? 'Hide' : 'Show'}
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
              meta={`${f.sticks.length} stick${f.sticks.length === 1 ? '' : 's'}`}
              onClick={() => actions.toggleFault(f)}
              menu={(
                <>
                  <ContextMenuItem onSelect={() => actions.toggleFault(f)}>
                    {visibleFaultIds.has(f.id) ? 'Hide' : 'Show'}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-red-400 focus:text-red-300"
                    onSelect={() => actions.deleteFault(f)}
                  >
                    Delete fault…
                  </ContextMenuItem>
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
    </div>
  );
}
