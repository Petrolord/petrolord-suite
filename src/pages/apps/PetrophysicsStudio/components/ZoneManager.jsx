// Zone manager (Petrophysics Studio G2.3): the selected well's
// geo_wells_zones with LIVE net-pay summaries computed from the
// current preview curves (the G2.5 publish action snapshots the same
// numbers into zone.properties). Owner-only edits — read-only wells
// show summaries without the editing affordances, mirroring RLS.

import React, { useState } from 'react';
import { Trash2, Plus, Loader2, UploadCloud } from 'lucide-react';

const inputCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d));

export default function ZoneManager({
  zones, summaries, isOwn, busy, onAdd, onDelete, onPublish,
}) {
  const [draft, setDraft] = useState({ name: '', top: '', base: '' });
  const [error, setError] = useState(null);

  const add = async () => {
    const top = Number(draft.top);
    const base = Number(draft.base);
    if (!draft.name.trim()) { setError('The zone needs a name.'); return; }
    if (!Number.isFinite(top) || !Number.isFinite(base) || !(base > top)) {
      setError('Top and base must be numbers with base below top (m MD).');
      return;
    }
    setError(null);
    try {
      await onAdd({ name: draft.name.trim(), topMdM: top, baseMdM: base });
      setDraft({ name: '', top: '', base: '' });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="p-2 space-y-2 text-xs" data-testid="petro-zones">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        Zones {busy && <Loader2 className="w-3 h-3 animate-spin inline ml-1" />}
      </div>

      {zones.map((z) => {
        const s = summaries?.[z.id];
        return (
          <div key={z.id} className="rounded border border-slate-800 p-1.5" data-testid="petro-zone-card" data-zone-name={z.name}>
            <div className="flex items-center gap-1">
              <span className="text-slate-200 font-medium">{z.name}</span>
              <span className="text-slate-500">{fmt(z.top_md_m, 1)}–{fmt(z.base_md_m, 1)} m</span>
              {isOwn && (
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    title={s ? `Publish ${z.name} summary to the registry` : 'Compute curves first'}
                    disabled={!s}
                    className="text-slate-500 hover:text-emerald-400 disabled:opacity-30"
                    data-testid={`petro-zone-publish-${z.name}`}
                    onClick={() => onPublish(z)}
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title={`Delete zone ${z.name}`}
                    className="text-slate-500 hover:text-red-400"
                    data-testid={`petro-zone-delete-${z.name}`}
                    onClick={() => onDelete(z)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            {s ? (
              <div className="grid grid-cols-3 gap-x-2 mt-1 text-[11px] text-slate-400" data-testid={`petro-zone-summary-${z.name}`}>
                <span>net <b className="text-slate-200" data-testid={`petro-zone-net-${z.name}`}>{fmt(s.net_m, 1)}</b> m</span>
                <span>gross {fmt(s.gross_m, 1)} m</span>
                <span>NTG {fmt(s.ntg, 3)}</span>
                <span>φ {fmt(s.phi_avg, 3)}</span>
                <span>Sw {fmt(s.sw_avg, 3)}</span>
                <span>Vsh {fmt(s.vsh_avg, 3)}</span>
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-slate-600">no computed curves yet</div>
            )}
            {Object.keys(z.properties || {}).length > 0 && (
              <div className="mt-1 text-[10px] text-emerald-400/80">published summary on record</div>
            )}
          </div>
        );
      })}
      {!zones.length && <p className="text-slate-600">No zones on this well yet.</p>}

      {isOwn && (
        <div className="rounded border border-slate-800/60 p-1.5 space-y-1">
          <div className="flex items-center gap-1">
            <input className={`${inputCls} flex-1`} placeholder="Zone name" value={draft.name}
              data-testid="petro-zone-name"
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </div>
          <div className="flex items-center gap-1">
            <input className={`${inputCls} w-20`} placeholder="Top m" value={draft.top}
              data-testid="petro-zone-top"
              onChange={(e) => setDraft((d) => ({ ...d, top: e.target.value }))} />
            <input className={`${inputCls} w-20`} placeholder="Base m" value={draft.base}
              data-testid="petro-zone-base"
              onChange={(e) => setDraft((d) => ({ ...d, base: e.target.value }))} />
            <button
              type="button"
              data-testid="petro-zone-add"
              className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded border
                border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10"
              onClick={add}
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          {error && <div className="text-red-400" data-testid="petro-zone-error">{error}</div>}
        </div>
      )}
      {!isOwn && (
        <p className="text-[10px] text-slate-600">
          Org-shared well — zones are read-only for you.
        </p>
      )}
    </div>
  );
}
