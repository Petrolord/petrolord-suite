// Section controls (Well Correlation right dock, WC series 2026-09-03):
// datum, view (unit, depth reference, spacing, template), tops (pick,
// reload, show/hide, rename, delete), zones, propagation and the shared
// track layout editor. Presentational; the controller owns state and
// persistence.

import React, { useState } from 'react';
import { Crosshair, RefreshCw, Pencil, Trash2, Check, X } from 'lucide-react';
import LayoutPanel from '@/components/wells/LayoutPanel';
import { topColor } from '@/components/wells/topColors';
import { toDisplay, fromDisplay } from '@/components/wells/depthModes';
import { DEPTH_REF_LABEL } from '../engine/sectionFrame';

const selCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const inputCls = selCls;
const btnCls = 'flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs';
const Section = ({ title, children, testId }) => (
  <div data-testid={testId}>
    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{title}</div>
    {children}
  </div>
);

const unitTxt = (u) => (u === 'ft' ? 'ft' : 'm');
const fmtDisplay = (mdM, unit) => (Number.isFinite(mdM) ? String(Number(toDisplay(mdM, unit).toFixed(1))) : '');

function TopRow({ name, shown, onToggle, canEdit, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const color = topColor(name);
  const commit = () => {
    const v = draft.trim();
    setEditing(false);
    if (v && v !== name) onRename(name, v);
  };
  return (
    <div className="flex items-center gap-1.5 py-px" data-testid={`corr-top-row-${name}`}>
      <label className="flex items-center gap-1.5 min-w-0 flex-1" data-testid={`corr-toggle-${name}`}>
        <input type="checkbox" checked={shown} onChange={onToggle} />
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
        {editing ? (
          <input
            className={`${inputCls} flex-1 min-w-0`}
            value={draft}
            autoFocus
            data-testid={`corr-top-rename-input-${name}`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setDraft(name); }
            }}
          />
        ) : <span className="text-slate-300 truncate">{name}</span>}
      </label>
      {canEdit && (editing ? (
        <>
          <button type="button" className="text-emerald-300 hover:text-emerald-200" title="Apply the new name" data-testid={`corr-top-rename-ok-${name}`} onClick={commit}><Check className="w-3.5 h-3.5" /></button>
          <button type="button" className="text-slate-500 hover:text-slate-300" title="Cancel" onClick={() => { setEditing(false); setDraft(name); }}><X className="w-3.5 h-3.5" /></button>
        </>
      ) : (
        <>
          <button type="button" className="text-slate-500 hover:text-cyan-300" title="Rename this top on every well you own" data-testid={`corr-top-rename-${name}`} onClick={() => { setDraft(name); setEditing(true); }}><Pencil className="w-3.5 h-3.5" /></button>
          <button
            type="button"
            className={confirming ? 'text-red-300 text-[10px] whitespace-nowrap' : 'text-slate-500 hover:text-red-400'}
            title={confirming ? 'Click again to delete this top from every well you own' : 'Delete this top from every well you own'}
            data-testid={`corr-top-delete-${name}`}
            onClick={() => { if (confirming) { setConfirming(false); onDelete(name); } else { setConfirming(true); setTimeout(() => setConfirming(false), 4000); } }}
          >
            {confirming ? 'confirm delete' : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </>
      ))}
    </div>
  );
}

export default function SectionControls({
  topNames, datum, onDatum,
  depthUnit, onDepthUnit, depthRef, onDepthRef, spacing, onSpacing,
  layouts, onLayoutsChange, logSources, onStatus,
  shownTops, onToggleTop, onShowAllTops,
  pickMode, onPickMode, onReloadTops, onRenameTop, onDeleteTop,
  zoneMode, onZoneMode, zonePair, onZonePair,
  onPropagate, canEdit,
}) {
  const [propName, setPropName] = useState(topNames[0] || '');
  const [propMd, setPropMd] = useState('');
  const u = unitTxt(depthUnit);

  return (
    <div className="p-2 space-y-3 text-xs" data-testid="corr-controls">
      <Section title="Datum">
        <div className="flex items-center gap-1.5 flex-wrap">
          <select className={selCls} value={datum.mode} data-testid="corr-datum-mode"
            onChange={(e) => onDatum(e.target.value === 'flatten'
              ? { mode: 'flatten', topName: datum.topName || topNames[0], datumM: datum.datumM ?? 1500 }
              : { mode: 'structural' })}>
            <option value="structural">Structural (true depth)</option>
            <option value="flatten">Flatten on top</option>
          </select>
          {datum.mode === 'flatten' && (
            <>
              <select className={selCls} value={datum.topName} data-testid="corr-datum-top"
                onChange={(e) => onDatum({ ...datum, topName: e.target.value })}>
                {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <input className={`${inputCls} w-16`} value={fmtDisplay(datum.datumM, depthUnit)} data-testid="corr-datum-depth"
                title={`Datum depth (${u})`} onChange={(e) => onDatum({ ...datum, datumM: fromDisplay(Number(e.target.value), depthUnit) })} />
              <span className="text-slate-500">{u}</span>
            </>
          )}
        </div>
      </Section>

      <Section title="View">
        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex items-center gap-1 text-slate-400">unit
            <select className={selCls} value={depthUnit} data-testid="corr-depth-unit" onChange={(e) => onDepthUnit(e.target.value)}>
              <option value="m">m</option>
              <option value="ft">ft</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-slate-400">depth
            <select className={selCls} value={depthRef} data-testid="corr-depth-ref" onChange={(e) => onDepthRef(e.target.value)}>
              {Object.entries(DEPTH_REF_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-slate-400">spacing
            <select className={selCls} value={spacing} data-testid="corr-spacing" onChange={(e) => onSpacing(e.target.value)}>
              <option value="equal">equal</option>
              <option value="proportional">by distance</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-slate-400 col-span-2">template
            <select className={`${selCls} flex-1 min-w-0`} value={layouts.activeTemplateId} data-testid="corr-template"
              onChange={(e) => onLayoutsChange({ ...layouts, activeTemplateId: e.target.value })}>
              {layouts.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
      </Section>

      <Section title="Tops" testId="corr-tops">
        <div className="flex items-center gap-1 mb-1 flex-wrap">
          {canEdit && (
            <button type="button" data-testid="corr-top-pick"
              className={`${btnCls} ${pickMode === 'top' ? 'border-cyan-500/60 text-cyan-300' : ''}`}
              title="Click on a well column to place a new top (Esc to finish)"
              onClick={() => onPickMode(pickMode === 'top' ? null : 'top')}>
              <Crosshair className="w-3.5 h-3.5" /> {pickMode === 'top' ? 'Picking… (Esc)' : 'Pick top'}
            </button>
          )}
          <button type="button" data-testid="corr-reload-tops" className={btnCls} title="Reload tops edited in Petrophysics Studio or Well Data Manager" onClick={onReloadTops}>
            <RefreshCw className="w-3.5 h-3.5" /> Reload
          </button>
          <label className="ml-auto flex items-center gap-1 text-slate-400">
            <input type="checkbox" data-testid="corr-tops-show-all" checked={topNames.length > 0 && shownTops.length === topNames.length}
              onChange={(e) => onShowAllTops(e.target.checked)} /> all
          </label>
        </div>
        <div className="space-y-0.5">
          {topNames.map((n) => (
            <TopRow key={n} name={n} shown={shownTops.includes(n)} onToggle={() => onToggleTop(n)}
              canEdit={canEdit} onRename={onRenameTop} onDelete={onDeleteTop} />
          ))}
          {!topNames.length && <p className="text-slate-600">No tops in the section yet. Pick one on a column, or propagate a top below.</p>}
        </div>
      </Section>

      <Section title="Zones">
        <div className="flex items-center gap-1 flex-wrap">
          <select className={selCls} value={zoneMode} data-testid="corr-zone-mode" onChange={(e) => onZoneMode(e.target.value)}>
            <option value="none">no fill</option>
            <option value="consecutive">between shown tops</option>
            <option value="pair">one pair</option>
          </select>
          {zoneMode === 'pair' && (
            <>
              <select className={selCls} value={zonePair?.[0] || ''} data-testid="corr-zone-top"
                onChange={(e) => onZonePair(e.target.value ? [e.target.value, zonePair?.[1] || topNames[1] || ''] : null)}>
                <option value="">—</option>
                {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-slate-500">to</span>
              <select className={selCls} value={zonePair?.[1] || ''} data-testid="corr-zone-base"
                onChange={(e) => onZonePair(zonePair?.[0] && e.target.value ? [zonePair[0], e.target.value] : zonePair)}>
                <option value="">—</option>
                {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </>
          )}
        </div>
      </Section>

      {canEdit && (
        <Section title="Propagate top">
          <div className="flex items-center gap-1">
            <input className={`${inputCls} flex-1 min-w-0`} placeholder="Top name" value={propName}
              data-testid="corr-prop-name" onChange={(e) => setPropName(e.target.value)} list="corr-topnames" />
            <datalist id="corr-topnames">{topNames.map((n) => <option key={n} value={n} />)}</datalist>
            <input className={`${inputCls} w-16`} placeholder={`MD ${u}`} value={propMd}
              data-testid="corr-prop-md" onChange={(e) => setPropMd(e.target.value)} />
            <button type="button" data-testid="corr-prop-run"
              className="px-2 py-0.5 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10"
              onClick={() => onPropagate(propName.trim(), fromDisplay(Number(propMd), depthUnit))}>
              Add
            </button>
          </div>
          <p className="mt-1 text-[10px] text-slate-600">Seeds the top on every owned well in the section at that MD; drag each tag to correct it.</p>
        </Section>
      )}

      <details className="rounded border border-slate-800/80" data-testid="corr-tracks-details">
        <summary className="cursor-pointer px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 select-none">Track layout</summary>
        <div className="border-t border-slate-800/80">
          <LayoutPanel layouts={layouts} onLayoutsChange={onLayoutsChange} logSources={logSources} onStatus={onStatus} />
        </div>
      </details>
    </div>
  );
}
