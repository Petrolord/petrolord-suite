// Events view (AppUpgrade STRAT-U2-009): biostratigraphic events of the
// selected well as typed datums, an event dictionary to date them from, and
// the well's range chart. An event is a typed top (surface type biozone)
// named "<EVENT> <taxon>", so Well Correlation, Petrophysics and Well Data
// Manager draw and list it like any other datum; nothing needs a schema.
// The dictionary (taxon, event, calibrated age, reference) is kept in the
// stratigraphy project (strat_projects.view.eventDictionary).

import React, { useMemo, useRef, useState } from 'react';
import { Loader2, ClipboardPaste, BookOpen, CalendarCheck } from 'lucide-react';
import { BIO_EVENTS, bioEvent, parseEventName, rangeChart, dictionaryAge } from '@/lib/stratigraphy/biostrat';
import { parseEventRows, parseEventDictionary } from '../services/biostratFiles';
import { fmtDepth } from '@/pages/apps/WellDataManager/engine/displayUnits';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS } from '@/utils/chartTheme';
import ChartExportButtons from '@/components/wells/section/ChartExportButtons';
import { chartHeaderLines } from '@/components/wells/section/chartExport';

const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';
const taCls = 'w-full h-24 bg-pl-surface border border-pl-border-strong rounded p-1 font-mono text-[11px] text-pl-text';
const EVENT_COLOUR = { FDO: '#b91c1c', LAD: '#b91c1c', LDO: '#1d4ed8', FAD: '#1d4ed8', ACME_TOP: '#a16207', ACME_BASE: '#a16207', LCO: '#15803d', FCO: '#15803d' };

/** The range chart: one column per taxon, depth down, the observed range as a bar. */
export function RangeChart({ chart, unit = 'm', testIdPrefix = 'strat-range' }) {
  const taxa = chart.taxa;
  if (!taxa.length) return <div className="text-xs text-pl-muted p-2" data-testid={`${testIdPrefix}-empty`}>No events on this well yet.</div>;
  const L = 60; const T = 120; const B = 16; const colW = 26;
  const width = L + taxa.length * colW + 20; const height = 420;
  const dMin = Math.min(...taxa.map((t) => t.top_md_m)); const dMax = Math.max(...taxa.map((t) => t.base_md_m));
  const pad = Math.max(5, (dMax - dMin) * 0.05);
  const lo = dMin - pad; const hi = dMax + pad;
  const plotH = height - T - B;
  const y = (md) => T + ((md - lo) / Math.max(1e-9, hi - lo)) * plotH;
  const ticks = Array.from({ length: 6 }, (_, i) => lo + (i * (hi - lo)) / 5);
  return (
    <div data-testid={`${testIdPrefix}-chart`} data-canvas="chart" data-taxa={taxa.length} className="relative inline-block max-w-full overflow-x-auto rounded border border-slate-200 bg-white pb-9">
      <svg width={width} height={height} className="block" xmlns="http://www.w3.org/2000/svg" fontFamily="sans-serif">
        <rect x="0" y="0" width={width} height={height} fill={CHART_COLORS.background} />
        <line x1={L} y1={T} x2={L} y2={T + plotH} stroke={CHART_COLORS.axisLine} />
        {ticks.map((d) => (
          <g key={d}>
            <line x1={L - 4} y1={y(d)} x2={width - 10} y2={y(d)} stroke={CHART_COLORS.grid} />
            <text x={L - 6} y={y(d) + 3} fontSize="9" fill={CHART_COLORS.axisText} textAnchor="end">{fmtDepth(d, unit, 0)}</text>
          </g>
        ))}
        <text x={12} y={T + plotH / 2} fontSize="10" fill={CHART_COLORS.axisLabel} textAnchor="middle" transform={`rotate(-90 12 ${T + plotH / 2})`}>MD ({unit}), depth down</text>
        {taxa.map((t, i) => {
          const cx = L + i * colW + colW / 2;
          return (
            <g key={t.taxon} data-testid={`${testIdPrefix}-taxon-${t.taxon}`} data-top={t.top_md_m} data-base={t.base_md_m}>
              <text x={cx} y={T - 6} fontSize="9" fill={CHART_COLORS.axisLabel} transform={`rotate(-60 ${cx} ${T - 6})`}>{t.taxon}</text>
              <line x1={cx} y1={y(t.top_md_m)} x2={cx} y2={y(t.base_md_m)} stroke="#334155" strokeWidth="4" strokeDasharray={t.openAbove || t.openBelow ? '6 2' : undefined} />
              {t.openAbove && <path d={`M ${cx - 4} ${y(t.top_md_m) - 2} L ${cx} ${y(t.top_md_m) - 8} L ${cx + 4} ${y(t.top_md_m) - 2}`} fill="none" stroke="#334155" />}
              {t.openBelow && <path d={`M ${cx - 4} ${y(t.base_md_m) + 2} L ${cx} ${y(t.base_md_m) + 8} L ${cx + 4} ${y(t.base_md_m) + 2}`} fill="none" stroke="#334155" />}
              {t.events.map((e) => (
                <g key={e.name}>
                  <circle cx={cx} cy={y(e.md_m)} r="4" fill={EVENT_COLOUR[e.event] || '#475569'}><title>{`${e.name} at ${fmtDepth(e.md_m, unit)} ${unit} MD${e.age_ma != null ? `, ${e.age_ma} Ma` : ''}`}</title></circle>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 px-2 py-1 text-[11px] text-slate-700">
        {[['FDO or LAD (top)', '#b91c1c'], ['LDO or FAD (base)', '#1d4ed8'], ['acme', '#a16207'], ['common occurrence', '#15803d']].map(([l, c]) => (
          <span key={l} className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c }} />{l}</span>
        ))}
        <span>dashed with an arrow: range open (no event at that end)</span>
      </div>
      <ChartLogo style={{ height: '28px' }} />
    </div>
  );
}

/**
 * @param {Object} p
 * @param {Object} p.well
 * @param {Array} p.tops the well's tops
 * @param {Object} p.backend saveTop, updateTop
 * @param {(msg: string) => void} p.onStatus
 * @param {() => Promise<void>} p.onTopsChanged
 * @param {(ages: Array) => Promise<void>} [p.onAgesEntered] stamps the chart version of written ages
 * @param {Array} [p.dictionary] the project's event dictionary
 * @param {(rows: Array) => Promise<void>} [p.onDictionary] saves the dictionary with the project
 * @param {'m'|'ft'} [p.unit]
 * @param {Object} [p.report]
 * @param {React.ReactNode} [p.children] the age model panel (STRAT-U2-010)
 */
export default function BiostratEvents({ well, tops, backend, onStatus, onTopsChanged, onAgesEntered = null, dictionary = [], onDictionary = null, unit = 'm', report = null, children = null }) {
  const [paste, setPaste] = useState(null);     // text of the events paste
  const [dictText, setDictText] = useState(null);
  const [busy, setBusy] = useState(false);
  const chartRef = useRef(null);
  const canEdit = !!well?.is_own;

  const events = useMemo(() => (tops || []).map((t) => ({ ...t, ev: parseEventName(t.name) })).filter((t) => t.ev), [tops]);
  const chart = useMemo(() => rangeChart(events), [events]);

  const addEvents = async () => {
    setBusy(true);
    let n = 0;
    try {
      const { rows, problems, notes } = parseEventRows(paste, { unit });
      const have = new Set((tops || []).map((t) => t.name.toLowerCase()));
      const skipped = [];
      for (const r of rows) {
        if (have.has(r.name.toLowerCase())) { skipped.push(`${r.name} (already on the well)`); continue; }
        await backend.saveTop(well.id, { name: r.name, mdM: r.md_m, surface_type: 'biozone', confidence: null, notes: `${bioEvent(r.event).name}: ${r.taxon}` });
        n += 1;
      }
      await onTopsChanged?.();
      setPaste(null);
      onStatus(`${n} event${n === 1 ? '' : 's'} added to ${well.name} as biozone datums${notes.length ? ` (${notes.join('; ')})` : ''}${[...problems, ...skipped].length ? `. Not added: ${[...problems, ...skipped].join(' ')}` : '.'}`);
    } catch (e) { onStatus(`${e.message}${n ? ` (${n} added before it)` : ''}`); } finally { setBusy(false); }
  };

  const loadDictionary = async () => {
    try {
      const { rows, problems, notes } = parseEventDictionary(dictText);
      const byKey = new Map((dictionary || []).map((r) => [`${r.taxon.toLowerCase()}|${r.event}`, r]));
      let replaced = 0;
      for (const r of rows) { const k = `${r.taxon.toLowerCase()}|${r.event}`; if (byKey.has(k) && byKey.get(k).age_ma !== r.age_ma) replaced += 1; byKey.set(k, r); }
      await onDictionary?.([...byKey.values()]);
      setDictText(null);
      onStatus(`Event dictionary: ${rows.length} dated event${rows.length === 1 ? '' : 's'} read${replaced ? `, ${replaced} replacing an earlier age` : ''}${notes.length ? ` (${notes.join('; ')})` : ''}${problems.length ? `. Not read: ${problems.join(' ')}` : '.'}`);
    } catch (e) { onStatus(e.message); }
  };

  const dateEvents = async () => {
    setBusy(true);
    try {
      const entered = []; const none = []; let kept = 0;
      for (const t of events) {
        if (Number.isFinite(t.age_ma)) { kept += 1; continue; }
        const hit = dictionaryAge(dictionary, t.ev.event, t.ev.taxon);
        if (!hit) { none.push(t.name); continue; }
        const via = hit.via ? ` (${t.ev.event} read as the ${hit.via})` : '';
        await backend.updateTop(t.id, { age_ma: hit.age_ma, notes: `${bioEvent(t.ev.event).name}: ${t.ev.taxon}; ${hit.age_ma} Ma${via}${hit.row.reference ? `, ${hit.row.reference}` : ''}` });
        entered.push({ kind: 'tops', id: t.id, field: 'age_ma' });
      }
      await onAgesEntered?.(entered);
      await onTopsChanged?.();
      onStatus(`Dated ${entered.length} event${entered.length === 1 ? '' : 's'} from the dictionary${kept ? `; ${kept} already dated kept` : ''}${none.length ? `; not in the dictionary: ${none.join(', ')}` : ''}.`);
    } catch (e) { onStatus(e.message); } finally { setBusy(false); }
  };

  if (!well) return <div className="h-full flex items-center justify-center text-pl-muted text-sm">Pick a well on the left.</div>;

  return (
    <div className="p-3 space-y-3 text-xs" data-testid="strat-events-view">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-pl-text font-medium">{well.name}: biostratigraphic events</span>
        <span className="text-pl-muted" data-testid="strat-events-count">{events.length} event{events.length === 1 ? '' : 's'} on {chart.taxa.length} tax{chart.taxa.length === 1 ? 'on' : 'a'} · dictionary {dictionary.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={btnCls} disabled={!canEdit || busy} onClick={() => setPaste(paste == null ? '' : null)} data-testid="strat-events-paste-toggle" title="Paste depth, event and taxon (StrataBugs or spreadsheet columns in any order)"><ClipboardPaste className="w-3.5 h-3.5" /> Add events</button>
          <button type="button" className={btnCls} disabled={!onDictionary} onClick={() => setDictText(dictText == null ? '' : null)} data-testid="strat-events-dict-toggle" title="Load the calibrated ages of events: taxon, event, age (Ma or ka), reference"><BookOpen className="w-3.5 h-3.5" /> Event dictionary</button>
          <button type="button" className={btnCls} disabled={!canEdit || busy || !dictionary.length || !events.length} onClick={dateEvents} data-testid="strat-events-date" title="Give every undated event its age from the dictionary (FDO reads the LAD, LDO the FAD when the dictionary has no well-site row)">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarCheck className="w-3.5 h-3.5" />} Date from dictionary
          </button>
        </div>
      </div>
      {paste != null && (
        <div className="space-y-1" data-testid="strat-events-paste">
          <textarea className={taCls} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'MD (m),Event,Taxon\n1450,FDO,Discoaster quinqueramus'} data-testid="strat-events-paste-text" />
          <div className="flex items-center gap-2">
            <button type="button" className={btnCls} disabled={!paste.trim() || busy} onClick={addEvents} data-testid="strat-events-paste-apply">Add to {well.name}</button>
            <span className="text-pl-muted">Depths in {unit} MD unless the header says ft or m. Events: {BIO_EVENTS.map((e) => e.code).join(', ')}; T, B, HO and LO are read too.</span>
          </div>
        </div>
      )}
      {dictText != null && (
        <div className="space-y-1" data-testid="strat-events-dict">
          <textarea className={taCls} value={dictText} onChange={(e) => setDictText(e.target.value)} placeholder={'Taxon,Event,Age (Ma),Reference\nDiscoaster quinqueramus,LAD,5.53,your calibration'} data-testid="strat-events-dict-text" />
          <button type="button" className={btnCls} disabled={!dictText.trim()} onClick={loadDictionary} data-testid="strat-events-dict-apply">Load into the project</button>
        </div>
      )}
      {events.length > 0 && (
        <table className="text-xs" data-testid="strat-events-table">
          <thead><tr>{['Event', 'Taxon', `MD (${unit})`, 'Age (Ma)', 'Dictionary'].map((h) => <th key={h} className="text-left font-medium text-pl-muted pr-3 pb-1">{h}</th>)}</tr></thead>
          <tbody>
            {events.map((t) => {
              const hit = dictionaryAge(dictionary, t.ev.event, t.ev.taxon);
              return (
                <tr key={t.id} data-testid={`strat-event-row-${t.name}`}>
                  <td className="pr-3 py-0.5 text-pl-text" title={bioEvent(t.ev.event).description}>{t.ev.event}</td>
                  <td className="pr-3 py-0.5 text-pl-text italic">{t.ev.taxon}</td>
                  <td className="pr-3 py-0.5 font-mono text-pl-text">{fmtDepth(t.md_m, unit)}</td>
                  <td className="pr-3 py-0.5 font-mono text-pl-text">{Number.isFinite(t.age_ma) ? t.age_ma : EMPTY_VALUE}</td>
                  <td className="pr-3 py-0.5 text-pl-muted">{hit ? `${hit.age_ma} Ma${hit.via ? ` as the ${hit.via}` : ''}${hit.row.reference ? `, ${hit.row.reference}` : ''}` : EMPTY_VALUE}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="flex items-center gap-2">
        <span className="text-pl-text font-medium">Range chart</span>
        <span className="text-pl-muted">the observed range of each taxon in the well, from its highest to its lowest event</span>
        <div className="ml-auto">
          <ChartExportButtons targetRef={chartRef} fileBase={`${well.name} range chart`} onStatus={onStatus} testIdPrefix="strat-range" disabled={!chart.taxa.length}
            headerLines={() => chartHeaderLines({ title: `Range chart: ${well.name}`, wells: [well.name], basis: `MD (${unit}), depth down; ranges between observed events`, field: report?.field, analyst: report?.analyst })} />
        </div>
      </div>
      <div ref={chartRef}><RangeChart chart={chart} unit={unit} /></div>
      {children}
      <p className="text-pl-muted">An event is a typed top named with its event and taxon (for example LAD Discoaster quinqueramus), so every app that lists tops lists it. FDO and LDO are what cuttings show (the highest and lowest sample with the taxon); caving moves an LDO down and reworking an FDO up.</p>
    </div>
  );
}
