// Section controls (Well Correlation right dock, WC series 2026-09-03):
// datum, view (unit, depth reference, spacing, template), tops (pick,
// reload, show/hide, rename, delete), zones, propagation and the shared
// track layout editor. Presentational; the controller owns state and
// persistence.

import React, { useState } from 'react';
import { Crosshair, RefreshCw, Pencil, Trash2, Check, X, Map as MapIcon, Upload, Download } from 'lucide-react';
import TopsFilePanel from './TopsFilePanel';
import { Link } from 'react-router-dom';
import LayoutPanel, { NumText } from '@/components/wells/LayoutPanel';
import { topColor } from '@/components/wells/topColors';
import { toDisplay, fromDisplay } from '@/components/wells/depthModes';
import { DEPTH_REF_LABEL } from '../engine/sectionFrame';
import { COLUMN_WIDTHS } from '@/components/wells/section/sectionFrame';
import { PDF_SCALES_M, PDF_SCALES_FT, scaleLabel } from '../services/sectionPdf';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const selCls = 'rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs';
const inputCls = selCls;
const btnCls = 'flex items-center gap-1 px-2 py-0.5 rounded border border-pl-border text-pl-text hover:bg-pl-sunken text-xs';
const Section = ({ title, children, testId }) => (
  <div data-testid={testId}>
    <div className="text-[10px] uppercase tracking-wider text-pl-muted mb-1">{title}</div>
    {children}
  </div>
);

const unitTxt = (u) => (u === 'ft' ? 'ft' : 'm');
const fmtDisplay = (mdM, unit) => (Number.isFinite(mdM) ? String(Number(toDisplay(mdM, unit).toFixed(1))) : '');

function TopRow({ name, shown, onToggle, canEdit, onRename, onDelete, mapHref, variants = [] }) {
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
        ) : <span className="text-pl-text truncate" title={JSON.stringify(name)}>{name}</span>}
      </label>
      {variants.length > 0 && !editing && (
        <span className="text-[10px] text-pl-warning-text whitespace-nowrap" data-testid={`corr-top-variant-${name}`}
          title={`Also spelled ${variants.map((v) => JSON.stringify(v)).join(', ')} in this section. These are separate tops until one is renamed to the other.`}>
          also {variants.map((v) => JSON.stringify(v)).join(', ')}
        </span>
      )}
      {mapHref && !editing && (
        <Link to={mapHref} className="text-pl-muted hover:text-pl-primary-text-hover" title="Map this top in Mapping & Surface Studio (TVDSS structure map from the section wells)" data-testid={`corr-map-top-${name}`}>
          <MapIcon className="w-3.5 h-3.5" />
        </Link>
      )}
      {canEdit && (editing ? (
        <>
          <button type="button" className="text-pl-primary-text hover:text-pl-primary-text-hover" title="Apply the new name" data-testid={`corr-top-rename-ok-${name}`} onClick={commit}><Check className="w-3.5 h-3.5" /></button>
          <button type="button" className="text-pl-muted hover:text-pl-text" title="Cancel" onClick={() => { setEditing(false); setDraft(name); }}><X className="w-3.5 h-3.5" /></button>
        </>
      ) : (
        <>
          <button type="button" className="text-pl-muted hover:text-pl-primary-text-hover" title="Rename this top on every well you own" data-testid={`corr-top-rename-${name}`} onClick={() => { setDraft(name); setEditing(true); }}><Pencil className="w-3.5 h-3.5" /></button>
          <button
            type="button"
            className={confirming ? 'text-pl-danger-text text-[10px] whitespace-nowrap' : 'text-pl-muted hover:text-pl-danger-text'}
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
  topNames, datum, onDatum, datumNames = null, horizons = null, strips = null,
  depthUnit, onDepthUnit, depthRef, onDepthRef, spacing, onSpacing, columnWidth = 'auto', onColumnWidth = null, hasLine = false,
  layouts, onLayoutsChange, logSources, onStatus,
  shownTops, onToggleTop, onShowAllTops,
  pickMode, onPickMode, onReloadTops, onRenameTop, onDeleteTop,
  zoneMode, onZoneMode, zonePair, onZonePair,
  onPropagate, canEdit, propRefLabel = 'MD',
  mapHrefFor = null, isochoreFor = null,
  ghost = null, onGhost = null, sectionWells = [],
  datumDefault = () => undefined, topVariants = {}, report = null, onReport = null, topsFile = null,
}) {
  const [importing, setImporting] = useState(false);
  const [propName, setPropName] = useState(topNames[0] || '');
  const [propMd, setPropMd] = useState('');
  const [propRef, setPropRef] = useState('displayed'); // U2-005
  const [iso, setIso] = useState({ upper: '', lower: '' }); // U2-013
  const u = unitTxt(depthUnit);
  const dn = datumNames || topNames; // U2-003: flatten or stretch on a top or a seismic horizon
  // U2-003: in time the datum and the ghost shift are in ms (no ft conversion)
  const ru = depthRef === 'twt' ? 'ms' : depthUnit;
  const ul = depthRef === 'twt' ? 'ms' : u;

  return (
    <div className="p-2 space-y-3 text-xs" data-testid="corr-controls">
      <Section title="Datum">
        <div className="flex items-center gap-1.5 flex-wrap">
          <select className={selCls} value={datum.mode} data-testid="corr-datum-mode"
            onChange={(e) => onDatum(e.target.value === 'flatten'
              ? { mode: 'flatten', topName: datum.topName || dn[0], datumM: datum.datumM ?? datumDefault(datum.topName || dn[0]) ?? 0 }
              : e.target.value === 'stretch'
                ? { mode: 'stretch', upperName: datum.upperName || dn[0], lowerName: datum.lowerName || dn[dn.length - 1] }
                : { mode: 'structural' })}>
            <option value="structural">Structural (true depth)</option>
            <option value="flatten">Flatten on top</option>
            <option value="stretch">Stretch between two tops</option>
          </select>
          {datum.mode === 'stretch' && (
            <>
              <select className={selCls} value={datum.upperName} data-testid="corr-datum-upper" onChange={(e) => onDatum({ ...datum, upperName: e.target.value })}>
                {dn.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-pl-muted">to</span>
              <select className={selCls} value={datum.lowerName} data-testid="corr-datum-lower" onChange={(e) => onDatum({ ...datum, lowerName: e.target.value })}>
                {dn.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </>
          )}
          {datum.mode === 'flatten' && (
            <>
              <select className={selCls} value={datum.topName} data-testid="corr-datum-top"
                onChange={(e) => onDatum({ ...datum, topName: e.target.value, datumM: datumDefault(e.target.value) ?? datum.datumM })}>
                {dn.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              {/* WC-U1-009: typed like every numeric field (clearing, "-" and "2." do not snap) */}
              <NumText className={`${inputCls} w-16`} value={fmtDisplay(datum.datumM, ru)} data-testid="corr-datum-depth"
                title={`Datum depth (${ul}): where the chosen top is drawn`} onCommit={(v) => onDatum({ ...datum, datumM: fromDisplay(v, ru) })} />
              <span className="text-pl-muted">{ul}</span>
            </>
          )}
        </div>
      </Section>

      {onGhost && (
        <Section title="Ghost curve">
          <div className="flex items-center gap-1.5 flex-wrap">
            <select className={selCls} value={ghost?.sourceWellId || ''} data-testid="corr-ghost-source" title="Draw this well's first track on another column"
              onChange={(e) => onGhost(e.target.value ? { sourceWellId: e.target.value, targetWellId: ghost?.targetWellId || sectionWells.find((w) => w.id !== e.target.value)?.id, shiftM: ghost?.shiftM || 0 } : null)}>
              <option value="">off</option>
              {sectionWells.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {ghost && (
              <>
                <span className="text-pl-muted">on</span>
                <select className={selCls} value={ghost.targetWellId || ''} data-testid="corr-ghost-target" onChange={(e) => onGhost({ ...ghost, targetWellId: e.target.value })}>
                  {sectionWells.filter((w) => w.id !== ghost.sourceWellId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {/* WC-U1-012: the shift reads and moves in the display unit */}
                <input type="range" min={Math.round(toDisplay(-200, ru))} max={Math.round(toDisplay(200, ru))} step={1}
                  value={Math.round(toDisplay(ghost.shiftM || 0, ru))} data-testid="corr-ghost-shift"
                  onChange={(e) => onGhost({ ...ghost, shiftM: fromDisplay(Number(e.target.value), ru) })} />
                <span className="text-pl-muted" data-testid="corr-ghost-shift-value">{(ghost.shiftM || 0) >= 0 ? '+' : ''}{Math.round(toDisplay(ghost.shiftM || 0, ru))} {ul}</span>
              </>
            )}
          </div>
        </Section>
      )}

      <Section title="View">
        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex items-center gap-1 text-pl-muted">unit
            <select className={selCls} value={depthUnit} data-testid="corr-depth-unit" onChange={(e) => onDepthUnit(e.target.value)}>
              <option value="m">m</option>
              <option value="ft">ft</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-pl-muted">depth
            <select className={selCls} value={depthRef} data-testid="corr-depth-ref" onChange={(e) => onDepthRef(e.target.value)}>
              {Object.entries(DEPTH_REF_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-pl-muted">spacing
            <select className={selCls} value={spacing} data-testid="corr-spacing" onChange={(e) => onSpacing(e.target.value)}>
              <option value="equal">equal</option>
              <option value="proportional">by distance</option>
              {(hasLine || spacing === 'line') && <option value="line">along the section line</option>}
            </select>
          </label>
          {onColumnWidth && (
            <label className="flex items-center gap-1 text-pl-muted" title="Column width: fit the window, or a fixed width with a horizontal scroll (auto fixes it once fitted columns get narrower than 90 px)">columns
              <select className={selCls} value={String(columnWidth)} data-testid="corr-col-width"
                onChange={(e) => onColumnWidth(e.target.value === 'auto' || e.target.value === 'fit' ? e.target.value : Number(e.target.value))}>
                {COLUMN_WIDTHS.map((c) => <option key={c} value={String(c)}>{typeof c === 'number' ? `${c} px` : c}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1 text-pl-muted col-span-2">template
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
              className={`${btnCls} ${pickMode === 'top' ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : ''}`}
              title="Click on a well column to place a new top (Esc to finish)"
              onClick={() => onPickMode(pickMode === 'top' ? null : 'top')}>
              <Crosshair className="w-3.5 h-3.5" /> {pickMode === 'top' ? 'Picking… (Esc)' : 'Pick top'}
            </button>
          )}
          <button type="button" data-testid="corr-reload-tops" className={btnCls} title="Reload tops edited in Petrophysics Studio or Well Data Manager" onClick={onReloadTops}>
            <RefreshCw className="w-3.5 h-3.5" /> Reload
          </button>
          {topsFile && canEdit && (
            <button type="button" data-testid="corr-tops-import-open" className={btnCls} title="Import a tops file (Petrel, Kingdom, Petra; MD, TVD, TVDSS or Z, m or ft)"
              onClick={() => setImporting((v) => !v)}>
              <Upload className="w-3.5 h-3.5" /> Import
            </button>
          )}
          {topsFile && (
            <button type="button" data-testid="corr-tops-export" className={btnCls} disabled={!topNames.length}
              title="Download the shown tops of the section wells as CSV (MD, TVD, TVDSS in the display unit; TWT from checkshots)"
              onClick={topsFile.onExport}>
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          )}
          <label className="ml-auto flex items-center gap-1 text-pl-muted">
            <input type="checkbox" data-testid="corr-tops-show-all" checked={topNames.length > 0 && shownTops.length === topNames.length}
              onChange={(e) => onShowAllTops(e.target.checked)} /> all
          </label>
        </div>
        {importing && topsFile && (
          <TopsFilePanel wells={topsFile.wells} loadRows={topsFile.loadRows} unit={depthUnit}
            onApply={topsFile.onApply} onClose={() => setImporting(false)} />
        )}
        <div className="space-y-0.5">
          {topNames.map((n) => (
            <TopRow key={n} name={n} shown={shownTops.includes(n)} onToggle={() => onToggleTop(n)}
              canEdit={canEdit} onRename={onRenameTop} onDelete={onDeleteTop}
              mapHref={mapHrefFor ? mapHrefFor(n) : null} variants={topVariants[n] || []} />
          ))}
          {!topNames.length && <p className="text-pl-muted">No tops in the section yet. Pick one on a column, or propagate a top below.</p>}
        </div>
      </Section>

      {horizons && (
        <Section title="Seismic horizons" testId="corr-horizons">
          {/* U2-003: read only from the surface registry (Seismolord converts its horizons there) */}
          {!horizons.list.length && <p className="text-pl-muted">No time or depth structure surfaces in the registry. Convert a Seismolord horizon to a surface to see it here.</p>}
          {horizons.list.map((h) => {
            const on = horizons.on.includes(h.id);
            const drawn = Object.values(horizons.picks || {}).flat().filter((t) => t.id.startsWith(`hz:${h.id}:`)).length;
            const probs = horizons.problems?.[h.id] || [];
            return (
              <div key={h.id} className="py-px" data-testid={`corr-hz-row-${h.id}`}>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={on} data-testid={`corr-hz-${h.id}`} onChange={() => horizons.onToggle(h.id)} />
                  <span className="text-pl-text truncate" title={`${h.name} (${h.source})`}>{h.horizonName}</span>
                  <span className="text-pl-muted text-[10px] whitespace-nowrap">{h.domain === 'time' ? 'TWT ms' : `depth ${h.zUnit}`} · {h.source}</span>
                </label>
                {on && horizons.loaded?.[h.id] && (
                  <p className="pl-5 text-[10px] text-pl-muted" data-testid={`corr-hz-note-${h.id}`}>
                    drawn on {drawn} well{drawn === 1 ? '' : 's'}{probs.length ? `; not on ${probs.join(', ')}` : ''}
                  </p>
                )}
              </div>
            );
          })}
          <p className="mt-1 text-[10px] text-pl-muted">Each horizon is sampled where the wellbore crosses it (time horizons through the well's checkshots) and drawn dotted; flatten on it from Datum. Nothing is written.</p>
        </Section>
      )}

      {strips && (
        <Section title="Petrophysics and stratigraphy" testId="corr-strips">
          {/* U2-008: what Petrophysics Studio and Stratigraphy Studio published, read only */}
          {[['pay', 'Pay flag (published PAY curve)', true], ['zones', 'Zones with their published net, PHIE, Sw', strips.hasZones], ['units', 'Stratigraphic units (tops linked to the column)', strips.hasUnits]]
            .filter(([, , ok]) => ok).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5 py-px">
                <input type="checkbox" checked={!!strips.on[k]} data-testid={`corr-strip-${k}`} onChange={(e) => strips.onChange({ ...strips.on, [k]: e.target.checked })} />
                <span className="text-pl-text">{label}</span>
              </label>
            ))}
          <p className="mt-1 text-[10px] text-pl-muted">Drawn as narrow strips at the left of each well; a well without the data says so in its header.</p>
        </Section>
      )}

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
                <option value="">{EMPTY_VALUE}</option>
                {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-pl-muted">to</span>
              <select className={selCls} value={zonePair?.[1] || ''} data-testid="corr-zone-base"
                onChange={(e) => onZonePair(zonePair?.[0] && e.target.value ? [zonePair[0], e.target.value] : zonePair)}>
                <option value="">{EMPTY_VALUE}</option>
                {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </>
          )}
        </div>
        {isochoreFor && topNames.length > 1 && (() => {
          const upper = iso.upper || zonePair?.[0] || topNames[0];
          const lower = iso.lower || zonePair?.[1] || topNames[1];
          const { href, wells } = upper && lower && upper !== lower ? isochoreFor(upper, lower) : { href: null, wells: 0 };
          return (
            <div className="mt-1.5 flex items-center gap-1 flex-wrap" data-testid="corr-isochore">
              <span className="text-pl-muted">Thickness map</span>
              <select className={selCls} value={upper} data-testid="corr-iso-upper" onChange={(e) => setIso({ upper: e.target.value, lower })}>
                {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-pl-muted">to</span>
              <select className={selCls} value={lower} data-testid="corr-iso-lower" onChange={(e) => setIso({ upper, lower: e.target.value })}>
                {topNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              {href && wells >= 3 ? (
                <Link to={href} className="flex items-center gap-1 text-pl-primary-text hover:text-pl-primary-text-hover" data-testid="corr-iso-link"
                  title="Open Mapping & Surface Studio and grid the gross thickness (MD) between these tops from the section wells carrying both. On a deviated well the MD thickness is longer than the vertical isochore.">
                  <MapIcon className="w-3.5 h-3.5" /> Map ({wells} wells)
                </Link>
              ) : (
                <span className="text-[10px] text-pl-warning-text" data-testid="corr-iso-why">
                  {upper === lower ? 'pick two different tops' : `${wells} section well${wells === 1 ? '' : 's'} carry both; a map needs 3`}
                </span>
              )}
            </div>
          );
        })()}
      </Section>

      {canEdit && (
        <Section title="Propagate top">
          <div className="flex items-center gap-1">
            <input className={`${inputCls} flex-1 min-w-0`} placeholder="Top name" value={propName}
              data-testid="corr-prop-name" onChange={(e) => setPropName(e.target.value)} list="corr-topnames" />
            <datalist id="corr-topnames">{topNames.map((n) => <option key={n} value={n} />)}</datalist>
            <input className={`${inputCls} w-16`} placeholder={u} value={propMd} title={`Depth in ${u}; blank seeds from an existing pick of this top`}
              data-testid="corr-prop-md" onChange={(e) => setPropMd(e.target.value)} />
            <button type="button" data-testid="corr-prop-run"
              className="px-2 py-0.5 rounded border border-pl-primary/60 text-pl-primary-text hover:bg-pl-primary/10"
              onClick={() => onPropagate(propName.trim(), propMd, propRef)}>
              Add
            </button>
          </div>
          <label className="mt-1 flex items-center gap-1 text-pl-muted">at
            <select className={`${selCls} min-w-0 flex-1`} value={propRef} data-testid="corr-prop-ref" onChange={(e) => setPropRef(e.target.value)}>
              <option value="displayed">the displayed depth ({propRefLabel})</option>
              <option value="md">one MD in every well</option>
            </select>
          </label>
          <p className="mt-1 text-[10px] text-pl-muted">Seeds the top on every owned well in the section; at the displayed depth each well gets its own MD through its survey and the flattening, so the seeds sit on one line across the section. Leave the depth blank to seed from an existing pick of the top. Drag each tag to correct it.</p>
        </Section>
      )}

      {onReport && (
        <Section title="Report header" testId="corr-report">
          {/* WC-U1-010: the exported picture names who made it and where */}
          <div className="grid grid-cols-[3.5rem_1fr] items-center gap-1">
            <span className="text-pl-muted">Field</span>
            <input className={inputCls} value={report?.field || ''} data-testid="corr-report-field" placeholder="Field or project"
              onChange={(e) => onReport({ ...(report || {}), field: e.target.value })} />
            <span className="text-pl-muted">Analyst</span>
            <input className={inputCls} value={report?.analyst || ''} data-testid="corr-report-analyst" placeholder="Name"
              onChange={(e) => onReport({ ...(report || {}), analyst: e.target.value })} />
          </div>
          <label className="mt-1 flex items-center gap-1 text-pl-muted">PDF scale
            <select className={selCls} data-testid="corr-pdf-scale" value={String(report?.pdfScale || (depthUnit === 'ft' ? 1200 : 1000))}
              onChange={(e) => onReport({ ...(report || {}), pdfScale: Number(e.target.value) })}>
              {PDF_SCALES_M.map((n) => <option key={`m${n}`} value={String(n)}>{scaleLabel(n, 'm')}</option>)}
              {PDF_SCALES_FT.filter((n) => !PDF_SCALES_M.includes(n)).map((n) => <option key={`f${n}`} value={String(n)}>{scaleLabel(n, 'ft')}</option>)}
            </select>
          </label>
          <p className="mt-1 text-[10px] text-pl-muted">Printed on the PNG and the PDF with the datum, depth reference, unit, vertical scale, date and build. The PDF plots the depth window on screen at this scale, every well at the current column width. Saved with the section.</p>
        </Section>
      )}

      <details className="rounded border border-pl-border" data-testid="corr-tracks-details">
        <summary className="cursor-pointer px-2 py-1 text-[10px] uppercase tracking-wider text-pl-muted select-none">Track layout</summary>
        <div className="border-t border-pl-border">
          <LayoutPanel layouts={layouts} onLayoutsChange={onLayoutsChange} logSources={logSources} onStatus={onStatus} />
        </div>
      </details>
    </div>
  );
}
