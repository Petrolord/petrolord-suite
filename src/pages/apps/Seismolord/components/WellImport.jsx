// Well import form: header fields + delimited-text import for the
// deviation survey, tops and checkshots — each with column mapping and
// a live preview (the SEG-Y header-mapping philosophy: never assume a
// layout, always preview). A well without a deviation survey is a
// vertical well and needs TD instead.
//
// Presentation-only: the parent supplies onSave (useWells persists
// through wellsService; the dev harness captures the draft locally),
// so the whole import path is drivable by Playwright without auth.

import React, { useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  parseDelimited, guessMapping, buildDeviation, buildTops, buildCheckshots,
} from '../engine/wellImport';

const TABS = [
  { key: 'deviation', label: 'Deviation', fields: ['md', 'inc', 'azi'], build: buildDeviation },
  { key: 'tops', label: 'Tops', fields: ['name', 'md'], build: buildTops },
  { key: 'checkshots', label: 'Checkshots', fields: ['tvdss', 'twt'], build: buildCheckshots },
];

const FIELD_LABELS = {
  md: 'MD (m)', inc: 'Inclination (°)', azi: 'Azimuth (°)',
  name: 'Top name', tvdss: 'TVDss (m)', twt: 'TWT (ms)',
};

const inputCls = 'rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';

/** One import tab's parse + mapping state, derived from its text. */
function useTabData(text, fields, mapOverride) {
  return useMemo(() => {
    const parsed = parseDelimited(text);
    const guessed = guessMapping(parsed.header, fields);
    const map = { ...guessed, ...mapOverride };
    // headerless files: default any unmapped field to its position
    if (!parsed.header) {
      fields.forEach((f, i) => { if (map[f] < 0 && mapOverride[f] === undefined) map[f] = i; });
    }
    const nCols = parsed.rows.reduce((m, r) => Math.max(m, r.length), parsed.header?.length || 0);
    return { parsed, map, nCols };
  }, [text, fields, mapOverride]);
}

/**
 * @param {{onSave: (draft: Object) => Promise<void>}} p draft carries
 *   {name, uwi, surfaceX, surfaceY, kbM, tdMdM, deviation, tops, checkshots}
 */
export default function WellImport({ onSave }) {
  const [head, setHead] = useState({ name: '', uwi: '', x: '', y: '', kb: '0', td: '' });
  const [tab, setTab] = useState('deviation');
  const [texts, setTexts] = useState({ deviation: '', tops: '', checkshots: '' });
  const [maps, setMaps] = useState({ deviation: {}, tops: {}, checkshots: {} });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const spec = TABS.find((t) => t.key === tab);
  const { parsed, map, nCols } = useTabData(texts[tab], spec.fields, maps[tab]);

  const setHeadField = (k) => (e) => setHead((h) => ({ ...h, [k]: e.target.value }));
  const setText = (value) => { setTexts((t) => ({ ...t, [tab]: value })); setError(null); };
  const setMapField = (f) => (e) => setMaps((m) => (
    { ...m, [tab]: { ...m[tab], [f]: Number(e.target.value) } }));

  const loadFile = async (e) => {
    const f = e.target.files?.[0];
    if (f) setText(await f.text());
    e.target.value = '';
  };

  /** Parse every tab that has text; throws user-facing messages. */
  const buildDraft = () => {
    const name = head.name.trim();
    if (!name) throw new Error('The well needs a name.');
    const surfaceX = Number(head.x);
    const surfaceY = Number(head.y);
    if (!Number.isFinite(surfaceX) || !Number.isFinite(surfaceY)) {
      throw new Error('Surface X and Y must be world coordinates in metres.');
    }
    const kbM = head.kb.trim() === '' ? 0 : Number(head.kb);
    if (!Number.isFinite(kbM)) throw new Error('KB must be a number (metres above datum).');
    const payloads = {};
    for (const t of TABS) {
      if (!texts[t.key].trim()) { payloads[t.key] = []; continue; }
      const p = parseDelimited(texts[t.key]);
      const g = guessMapping(p.header, t.fields);
      const m = { ...g, ...maps[t.key] };
      if (!p.header) t.fields.forEach((f, i) => { if (m[f] < 0 && maps[t.key][f] === undefined) m[f] = i; });
      try {
        payloads[t.key] = t.build(p.rows, m);
      } catch (e) {
        throw new Error(`${t.label}: ${e.message}`);
      }
    }
    let tdMdM = head.td.trim() === '' ? null : Number(head.td);
    if (tdMdM !== null && !(tdMdM > 0)) throw new Error('TD must be a positive number (m MD).');
    if (!payloads.deviation.length) {
      if (tdMdM === null) {
        throw new Error('A well without a deviation survey is vertical — enter its TD.');
      }
    } else if (tdMdM === null) {
      tdMdM = payloads.deviation[payloads.deviation.length - 1].md;
    }
    return {
      name, uwi: head.uwi.trim() || null, surfaceX, surfaceY, kbM, tdMdM,
      deviation: payloads.deviation, tops: payloads.tops, checkshots: payloads.checkshots,
    };
  };

  const save = async () => {
    let draft;
    try {
      draft = buildDraft();
    } catch (e) {
      setError(e.message);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSave(draft);
      setHead({ name: '', uwi: '', x: '', y: '', kb: '0', td: '' });
      setTexts({ deviation: '', tops: '', checkshots: '' });
      setMaps({ deviation: {}, tops: {}, checkshots: {} });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const previewRows = parsed.rows.slice(0, 6);

  return (
    <div className="space-y-2" data-testid="well-import">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <input className={inputCls} placeholder="Well name *" value={head.name}
          onChange={setHeadField('name')} data-testid="well-import-name" />
        <input className={inputCls} placeholder="UWI (optional)" value={head.uwi}
          onChange={setHeadField('uwi')} />
        <input className={inputCls} placeholder="KB m above datum" value={head.kb}
          onChange={setHeadField('kb')} data-testid="well-import-kb" title="Kelly bushing elevation above the (seismic) datum" />
        <input className={inputCls} placeholder="Surface X (m) *" value={head.x}
          onChange={setHeadField('x')} data-testid="well-import-x" />
        <input className={inputCls} placeholder="Surface Y (m) *" value={head.y}
          onChange={setHeadField('y')} data-testid="well-import-y" />
        <input className={inputCls} placeholder="TD m MD (vertical wells)" value={head.td}
          onChange={setHeadField('td')} data-testid="well-import-td"
          title="Required only when no deviation survey is pasted; defaults to the last station otherwise" />
      </div>

      <div className="flex items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            data-testid={`well-tab-${t.key}`}
            className={`px-2 py-1 text-xs rounded border ${tab === t.key
              ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
            onClick={() => { setTab(t.key); setError(null); }}
          >
            {t.label}
            {texts[t.key].trim() ? ' •' : ''}
          </button>
        ))}
        <label className="ml-auto text-xs text-slate-400 cursor-pointer hover:text-slate-200">
          Load file…
          <input type="file" accept=".csv,.txt,.dev,.tsv,text/*" className="hidden" onChange={loadFile} />
        </label>
      </div>

      <textarea
        className={`${inputCls} w-full h-24 font-mono`}
        placeholder={tab === 'deviation'
          ? 'Paste the deviation survey (MD, inclination, azimuth)… leave empty for a vertical well'
          : tab === 'tops'
            ? 'Paste tops (name, MD)…'
            : 'Paste checkshots (TVDss m, TWT ms) — must strictly increase in both'}
        value={texts[tab]}
        onChange={(e) => setText(e.target.value)}
        data-testid="well-import-text"
      />

      {parsed.rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {spec.fields.map((f) => (
              <label key={f} className="text-xs text-slate-400 flex items-center gap-1">
                {FIELD_LABELS[f]}
                <select
                  className={inputCls}
                  value={String(map[f])}
                  onChange={setMapField(f)}
                  data-testid={`well-map-${f}`}
                >
                  <option value="-1">—</option>
                  {Array.from({ length: nCols }, (_, i) => (
                    <option key={i} value={String(i)}>
                      {parsed.header?.[i] ? `${parsed.header[i]}` : `column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <span className="text-xs text-slate-500" data-testid="well-import-rowcount">
              {parsed.rows.length} rows
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs text-slate-300 font-mono" data-testid="well-import-preview">
              <tbody>
                {previewRows.map((r, i) => (
                  // preview only — row order is the file's, index keys fine
                  // eslint-disable-next-line react/no-array-index-key
                  <tr key={i}>
                    {spec.fields.map((f) => (
                      <td key={f} className="pr-4 whitespace-nowrap">
                        {map[f] >= 0 ? r[map[f]] : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {error && <div className="text-xs text-red-400" data-testid="well-import-error">{error}</div>}

      <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white"
        onClick={save} disabled={busy} data-testid="well-import-save"
      >
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Save well
      </Button>
    </div>
  );
}
