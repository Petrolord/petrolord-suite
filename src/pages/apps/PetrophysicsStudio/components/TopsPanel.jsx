// Tops (markers) dock panel (PT3, 2026-09-03): show/hide all, per-top
// visibility and colour (view state, works on shared wells too), and on
// own wells the pick mode plus rename and delete. Depths print in the
// display unit. Colours and visibility persist with the interpretation
// through layouts.topStyles; the rows are the registry's geo_wells_tops.

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Crosshair, Loader2, Pencil, Trash2, Map as MapIcon } from 'lucide-react';
import { topColor, topKey } from '@/components/wells/topColors';
import { depthLabel } from '../viewer/depthModes';

const inputCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';

export default function TopsPanel({
  tops, topStyles, onShowAll, onStyle, isOwn, busy, pickMode, onPick, onRename, onDelete, depthUnit = 'm',
  mapHrefFor = null,
}) {
  const [renaming, setRenaming] = useState(null); // {id, value}
  const byName = topStyles?.byName || {};
  const showAll = topStyles?.showAll !== false;
  return (
    <div className="p-2 space-y-2 text-xs" data-testid="petro-tops">
      <div className="flex items-center gap-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          Tops {busy && <Loader2 className="w-3 h-3 animate-spin inline ml-1" />}
        </div>
        <label className="ml-auto flex items-center gap-1 text-slate-400">
          <input type="checkbox" checked={showAll} onChange={(e) => onShowAll(e.target.checked)} data-testid="petro-tops-show-all" />
          Show tops
        </label>
        {isOwn && onPick && (
          <button
            type="button"
            data-testid="petro-top-pick"
            className={`flex items-center gap-1 px-2 py-0.5 rounded border ${pickMode === 'top'
              ? 'border-cyan-500/60 text-cyan-300 bg-cyan-500/10' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
            onClick={() => onPick(pickMode === 'top' ? null : 'top')}
            title="Click in the log area to place a new top (Esc to finish)"
          >
            <Crosshair className="w-3 h-3" /> {pickMode === 'top' ? 'Picking…' : 'Pick top'}
          </button>
        )}
      </div>

      {!tops?.length && <p className="text-slate-600">No tops on this well yet.</p>}
      {(tops || []).map((t) => {
        const st = byName[topKey(t.name)] || {};
        const color = topColor(t.name, { overrides: byName });
        return (
          <div key={t.id} className="flex items-center gap-1.5 rounded border border-slate-800 px-1.5 py-1" data-testid={`petro-top-row-${t.name}`}>
            <input type="checkbox" checked={!st.hidden} disabled={!showAll}
              onChange={(e) => onStyle(t.name, { hidden: !e.target.checked })} data-testid={`petro-top-visible-${t.name}`} title="Show this top" />
            <input type="color" className="w-5 h-4 rounded border border-slate-700 bg-transparent" value={color}
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
              <span className="flex-1 truncate text-slate-200" style={{ color }}>{t.name}</span>
            )}
            <span className="text-slate-500 font-mono" data-testid={`petro-top-md-${t.name}`}>{depthLabel(t.md_m, depthUnit)}</span>
            {mapHrefFor && (
              <Link to={mapHrefFor(t)} className="text-slate-500 hover:text-amber-300" title="Map this top in Mapping & Surface Studio (TVDSS structure map across the wells carrying it)"
                data-testid={`petro-map-top-${t.name}`}>
                <MapIcon className="w-3 h-3" />
              </Link>
            )}
            {isOwn && (
              <>
                <button type="button" className="text-slate-500 hover:text-cyan-300" title="Rename"
                  onClick={() => setRenaming({ id: t.id, value: t.name })} data-testid={`petro-top-rename-${t.name}`}>
                  <Pencil className="w-3 h-3" />
                </button>
                <button type="button" className="text-slate-500 hover:text-red-400" title="Delete this top"
                  onClick={() => onDelete(t)} data-testid={`petro-top-delete-${t.name}`}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        );
      })}
      {!isOwn && (
        <p className="text-slate-600">Org-shared well: tops are read-only for you. Colours and visibility are yours.</p>
      )}
    </div>
  );
}
