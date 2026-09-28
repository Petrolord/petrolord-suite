// Tops (markers) dock panel (PT3, 2026-09-03): show/hide all, per-top
// visibility and colour (view state, works on shared wells too), and on
// own wells the pick mode plus rename, an editable depth (PT8) and
// delete. Depths print and are typed in the display unit. Colours and visibility persist with the interpretation
// through layouts.topStyles; the rows are the registry's geo_wells_tops.

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Crosshair, Loader2, Pencil, Trash2, Map as MapIcon } from 'lucide-react';
import { topColor, topKey } from '@/components/wells/topColors';
import { depthLabel, toDisplay, fromDisplay } from '../viewer/depthModes';

const inputCls = 'rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs';

export default function TopsPanel({
  tops, topStyles, onShowAll, onStyle, isOwn, busy, pickMode, onPick, onRename, onMove, onDelete, depthUnit = 'm',
  snapSamples = false, onSnapSamples, mapHrefFor = null,
}) {
  const [renaming, setRenaming] = useState(null); // {id, value}
  // PT8: the depth is editable in place next to the name. The draft is
  // held per row so a half-typed number never reaches the registry, and
  // it is entered in the DISPLAY unit like every other depth in this app.
  const [editingMd, setEditingMd] = useState(null); // {id, value}
  const commitMd = async (t) => {
    const draft = editingMd;
    setEditingMd(null);
    if (!draft || draft.id !== t.id) return;
    const typed = Number(String(draft.value).trim());
    if (!Number.isFinite(typed)) return;
    const mdM = Number(fromDisplay(typed, depthUnit).toFixed(2));
    if (Math.abs(mdM - t.md_m) < 1e-9) return;
    await onMove(t, mdM);
  };
  const byName = topStyles?.byName || {};
  const showAll = topStyles?.showAll !== false;
  return (
    <div className="p-2 space-y-2 text-xs" data-testid="petro-tops">
      <div className="flex items-center gap-2">
        <div className="text-[10px] uppercase tracking-wider text-pl-muted">
          Tops {busy && <Loader2 className="w-3 h-3 animate-spin inline ml-1" />}
        </div>
        <label className="ml-auto flex items-center gap-1 text-pl-muted">
          <input type="checkbox" checked={showAll} onChange={(e) => onShowAll(e.target.checked)} data-testid="petro-tops-show-all" />
          Show tops
        </label>
        {isOwn && onSnapSamples && (
          <label className="flex items-center gap-1 text-pl-muted" title="Dragging a top or a zone edge lands on the nearest logged sample">
            <input type="checkbox" checked={snapSamples} onChange={(e) => onSnapSamples(e.target.checked)} data-testid="petro-top-snap" />
            Snap
          </label>
        )}
        {isOwn && onPick && (
          <button
            type="button"
            data-testid="petro-top-pick"
            className={`flex items-center gap-1 px-2 py-0.5 rounded border ${pickMode === 'top'
              ? 'border-pl-primary text-pl-primary-text bg-pl-primary/10' : 'border-pl-border text-pl-text hover:bg-pl-sunken'}`}
            onClick={() => onPick(pickMode === 'top' ? null : 'top')}
            title="Click in the log area to place a new top (Esc to finish)"
          >
            <Crosshair className="w-3 h-3" /> {pickMode === 'top' ? 'Picking…' : 'Pick top'}
          </button>
        )}
      </div>

      {!tops?.length && <p className="text-pl-muted">No tops on this well yet.</p>}
      {(tops || []).map((t) => {
        const st = byName[topKey(t.name)] || {};
        const color = topColor(t.name, { overrides: byName });
        return (
          <div key={t.id} className="flex items-center gap-1.5 rounded border border-pl-border px-1.5 py-1" data-testid={`petro-top-row-${t.name}`}>
            <input type="checkbox" checked={!st.hidden} disabled={!showAll}
              onChange={(e) => onStyle(t.name, { hidden: !e.target.checked })} data-testid={`petro-top-visible-${t.name}`} title="Show this top" />
            <input type="color" className="w-5 h-4 rounded border border-pl-border bg-transparent" value={color}
              onChange={(e) => onStyle(t.name, { color: e.target.value })} data-testid={`petro-top-color-${t.name}`} title="Colour for this top name on every well" />
            {renaming?.id === t.id ? (
              <input
                className={`${inputCls} flex-1`}
                value={renaming.value}
                autoFocus
                data-testid="petro-top-rename-input"
                onChange={(e) => setRenaming({ id: t.id, value: e.target.value })}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') { const v = renaming.value.trim(); setRenaming(null); if (v && v !== t.name) await onRename(t, v); }
                  if (e.key === 'Escape') setRenaming(null);
                }}
                onBlur={() => setRenaming(null)}
              />
            ) : (
              <span className="flex-1 truncate text-pl-text" style={{ color }}>{t.name}</span>
            )}
            {isOwn && onMove ? (
              <span className="flex items-center gap-0.5 shrink-0">
                <input
                  className={`${inputCls} w-20 text-right font-mono`}
                  value={editingMd?.id === t.id ? editingMd.value : toDisplay(t.md_m, depthUnit).toFixed(2)}
                  data-testid={`petro-top-md-${t.name}`}
                  title={`Depth of ${t.name} in ${depthUnit === 'ft' ? 'feet' : 'metres'} MD. Press Enter to move it`}
                  onChange={(e) => setEditingMd({ id: t.id, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.currentTarget.blur(); }
                    if (e.key === 'Escape') { setEditingMd(null); e.currentTarget.blur(); }
                  }}
                  onBlur={() => commitMd(t)}
                />
                <span className="text-pl-muted">{depthUnit === 'ft' ? 'ft' : 'm'}</span>
              </span>
            ) : (
              <span className="text-pl-muted font-mono" data-testid={`petro-top-md-${t.name}`}>{depthLabel(t.md_m, depthUnit)}</span>
            )}
            {mapHrefFor && (
              <Link to={mapHrefFor(t)} className="text-pl-muted hover:text-pl-primary-text" title="Map this top in Mapping & Surface Studio (TVDSS structure map across the wells carrying it)"
                data-testid={`petro-map-top-${t.name}`}>
                <MapIcon className="w-3 h-3" />
              </Link>
            )}
            {isOwn && (
              <>
                <button type="button" className="text-pl-muted hover:text-pl-primary-text-hover" title="Rename"
                  onClick={() => setRenaming({ id: t.id, value: t.name })} data-testid={`petro-top-rename-${t.name}`}>
                  <Pencil className="w-3 h-3" />
                </button>
                <button type="button" className="text-pl-muted hover:text-pl-danger-text" title="Delete this top"
                  onClick={() => onDelete(t)} data-testid={`petro-top-delete-${t.name}`}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        );
      })}
      {!isOwn && (
        <p className="text-pl-muted">Org-shared well: tops are read-only for you. Colours and visibility are yours.</p>
      )}
    </div>
  );
}
