// Well import form: header fields + delimited-text import for the
// deviation survey, tops and checkshots — each with column mapping and
// a live preview (the SEG-Y header-mapping philosophy: never assume a
// layout, always preview). A well without a deviation survey is a
// vertical well and needs TD instead.
//
// SHARED wells primitive (Geoscience-ROADMAP.md §3: extract at the
// second consumer — moved out of Seismolord when Well Data Manager
// reused it for manual well entry, G1.3).
// Presentation-only: the parent supplies onSave (Seismolord's useWells
// persists through its wellsService; Well Data Manager persists to the
// geo_wells registry; dev harnesses capture the draft locally), so the
// whole import path is drivable by Playwright without auth.
//
// PT1 (2026-09-03, Petrel users): checkshots are entered in the user's
// own convention (MD | TVD | TVDSS, OWT | TWT, m | ft; defaults MD + OWT
// like a Petrel export) and converted to the stored TVDSS / TWT table
// through the pasted survey and KB (welldata checkshots engine); the
// preview shows the stored values beside the entered ones. Deviation and
// tops MD, KB and TD accept feet too. Internal storage stays SI.

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  parseDelimited, guessMapping, guessCheckshotConvention,
  buildDeviation, buildTops, buildCheckshotInputs,
} from '@/lib/wellImport';
import {
  makeDepthFrame, toStoredCheckshots, makeCheckshotProvenance, PETREL_CHECKSHOT_CONVENTION, M_PER_FT,
} from '@/pages/apps/WellDataManager/engine/checkshots';
import CrsPicker from '@/components/crs/CrsPicker';
import { placeWellLocation, placeDeviation } from '@/lib/crs/wellPlacement';
import { normalizeTag, isTransformableTag, UNKNOWN } from '@/lib/crs/tags';
import ColumnMapper from './ColumnMapper';
import { CheckshotConventionRow, MdUnitSelect, CHECKSHOT_FIELD_LABELS } from './PasteReplacePanel';

const TABS = [
  { key: 'deviation', label: 'Deviation', fields: ['md', 'inc', 'azi'] },
  { key: 'tops', label: 'Tops', fields: ['name', 'md'] },
  { key: 'checkshots', label: 'Checkshots', fields: ['depth', 'time'] },
];

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

const unitLabel = (u) => (u === 'ft' ? 'ft' : 'm');

/**
 * @param {Object} p
 * @param {(draft: Object) => Promise<void>} p.onSave draft carries
 *   {name, uwi, surfaceX, surfaceY, kbM, tdMdM, deviation, tops,
 *   checkshots, checkshotsProvenance, unitsNote} plus, from the CRS step,
 *   {crs, xyUnit, crsProvenance, autoSetProject} — surfaceX/surfaceY are
 *   already converted into the Project CRS, deviation azimuths rotated to
 *   grid north, every depth in metres and checkshots in the stored
 *   TVDSS / TWT core (with md_m per row when entered as MD)
 * @param {?{projectTag: ?string, projectName: ?string, customDefs: Object}}
 *   [p.crsContext] Project CRS context (from getProjectCrs()); when
 *   absent (dev harnesses) the form still works and the well stores an
 *   UNKNOWN placement
 */
export default function WellImport({ onSave, crsContext }) {
  const [head, setHead] = useState({ name: '', uwi: '', x: '', y: '', kb: '0', td: '' });
  const [headUnit, setHeadUnit] = useState('m');           // KB and TD as typed
  const [tab, setTab] = useState('deviation');
  const [texts, setTexts] = useState({ deviation: '', tops: '', checkshots: '' });
  const [maps, setMaps] = useState({ deviation: {}, tops: {}, checkshots: {} });
  // per-tab conventions (PT1); Petrel defaults for checkshots
  const [conv, setConv] = useState({
    deviation: { mdUnit: 'm' }, tops: { mdUnit: 'm' }, checkshots: { ...PETREL_CHECKSHOT_CONVENTION },
  });
  const [csTouched, setCsTouched] = useState(false);       // a user choice beats header guesses
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // CRS step (Phase 4): entry mode, declared CRS, unit of the entered
  // numbers, and the deviation azimuth reference.
  const [locMode, setLocMode] = useState('xy');
  const [crsTag, setCrsTag] = useState(null);
  const [xyUnit, setXyUnit] = useState('m');
  const [latlon, setLatlon] = useState({ lat: '', lon: '' });
  const [azimuthRef, setAzimuthRef] = useState('grid');
  const [declination, setDeclination] = useState('0');

  // Default the declaration to the Project CRS once context arrives;
  // never overwrite a user choice.
  useEffect(() => {
    if (crsTag === null && crsContext?.projectTag
      && isTransformableTag(crsContext.projectTag)) {
      setCrsTag(normalizeTag(crsContext.projectTag));
    }
  }, [crsContext, crsTag]);

  const spec = TABS.find((t) => t.key === tab);
  const { parsed, map, nCols } = useTabData(texts[tab], spec.fields, maps[tab]);

  const labels = useMemo(() => ({
    md: `MD (${unitLabel(conv.deviation.mdUnit)})`,
    inc: 'Inclination (°)',
    azi: 'Azimuth (°)',
    name: 'Top name',
    ...(tab === 'tops' ? { md: `MD (${unitLabel(conv.tops.mdUnit)})` } : {}),
    ...CHECKSHOT_FIELD_LABELS(conv.checkshots),
  }), [conv, tab]);

  const setHeadField = (k) => (e) => setHead((h) => ({ ...h, [k]: e.target.value }));
  const setText = (value) => {
    setTexts((t) => ({ ...t, [tab]: value }));
    setError(null);
    if (tab === 'checkshots' && !csTouched) {
      const hint = guessCheckshotConvention(parseDelimited(value).header);
      if (Object.keys(hint).length) setConv((c) => ({ ...c, checkshots: { ...c.checkshots, ...hint } }));
    }
  };
  const setMapField = (f, idx) => setMaps((m) => ({ ...m, [tab]: { ...m[tab], [f]: idx } }));
  const setTabConv = (key, next) => setConv((c) => ({ ...c, [key]: next }));

  const loadFile = async (e) => {
    const f = e.target.files?.[0];
    if (f) setText(await f.text());
    e.target.value = '';
  };

  /** Parse one tab from its text with its mapping; throws user-facing messages. */
  const parseTab = (t) => {
    if (!texts[t.key].trim()) return [];
    const p = parseDelimited(texts[t.key]);
    const g = guessMapping(p.header, t.fields);
    const m = { ...g, ...maps[t.key] };
    if (!p.header) t.fields.forEach((f, i) => { if (m[f] < 0 && maps[t.key][f] === undefined) m[f] = i; });
    try {
      if (t.key === 'deviation') return buildDeviation(p.rows, m, { mdUnit: conv.deviation.mdUnit });
      if (t.key === 'tops') return buildTops(p.rows, m, { mdUnit: conv.tops.mdUnit });
      return buildCheckshotInputs(p.rows, m);
    } catch (e) {
      throw new Error(`${t.label}: ${e.message}`);
    }
  };

  const kbMetres = () => {
    const raw = head.kb.trim() === '' ? 0 : Number(head.kb);
    if (!Number.isFinite(raw)) throw new Error(`KB must be a number (${unitLabel(headUnit)} above datum).`);
    return headUnit === 'ft' ? raw * M_PER_FT : raw;
  };

  // Live preview of the stored TVDSS / TWT for the checkshot tab, through
  // whatever survey and KB are on the form right now (best effort: a
  // problem shows in the cell, never as a thrown error).
  const csPreview = useMemo(() => {
    if (tab !== 'checkshots' || !parsed.rows.length) return null;
    let frame;
    let note;
    try {
      const dev = texts.deviation.trim() ? parseTab(TABS[0]) : [];
      const kbM = kbMetres();
      frame = makeDepthFrame({ deviation: dev, kbM });
      if (conv.checkshots.depthRef === 'tvdss') note = 'Depth entered as TVDSS: no survey needed.';
      else if (frame.isVertical) note = 'No deviation survey pasted: treated as vertical, MD = TVD.';
      else note = `Using the pasted deviation survey (${frame.stations.length} stations${frame.assumedVerticalToFirstStation ? ', vertical above the first station' : ''}).`;
    } catch (e) {
      return { cell: () => '—', note: e.message };
    }
    const cell = (r) => {
      const depth = Number(r[map.depth]);
      const time = Number(r[map.time]);
      if (!Number.isFinite(depth) || !Number.isFinite(time)) return '—';
      try {
        const { rows } = toStoredCheckshots([{ depth, time }, { depth: depth + 1, time: time + 1 }], conv.checkshots, frame);
        return `${rows[0].tvdss_m.toFixed(2)} / ${rows[0].twt_ms.toFixed(1)}`;
      } catch (e) {
        return 'n/a';
      }
    };
    return { cell, note };
  }, [tab, parsed, map, texts.deviation, head.kb, headUnit, conv]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Parse every tab that has text; throws user-facing messages. */
  const buildDraft = () => {
    const name = head.name.trim();
    if (!name) throw new Error('The well needs a name.');
    // Placement: declared coordinates -> Project CRS (or stored as
    // declared for LOCAL/UNKNOWN). Throws user-facing messages.
    const placed = placeWellLocation(
      locMode === 'latlon'
        ? { mode: 'latlon', lat: latlon.lat, lon: latlon.lon }
        : { mode: 'xy', crsTag: crsTag || UNKNOWN, x: head.x, y: head.y, xyUnit },
      crsContext || {},
    );
    const surfaceX = placed.surfaceX;
    const surfaceY = placed.surfaceY;
    const kbM = kbMetres();
    const payloads = {};
    for (const t of TABS) payloads[t.key] = parseTab(t);
    let tdMdM = head.td.trim() === '' ? null : Number(head.td);
    if (tdMdM !== null && !(tdMdM > 0)) throw new Error(`TD must be a positive number (${unitLabel(headUnit)} MD).`);
    if (tdMdM !== null && headUnit === 'ft') tdMdM *= M_PER_FT;
    if (!payloads.deviation.length) {
      if (tdMdM === null) {
        throw new Error('A well without a deviation survey is vertical — enter its TD.');
      }
    } else if (tdMdM === null) {
      tdMdM = payloads.deviation[payloads.deviation.length - 1].md;
    }
    // Azimuth reference -> grid north of the stored CRS.
    const dev = placeDeviation(
      payloads.deviation,
      { azimuthRef, declinationDeg: declination },
      placed,
      crsContext?.customDefs || {},
    );
    // Checkshots: entered convention -> stored TVDSS / TWT core (PT1).
    let checkshots = [];
    let checkshotsProvenance = null;
    const warnings = [];
    if (payloads.checkshots.length) {
      const frame = makeDepthFrame({ deviation: dev.deviation, kbM, tdMdM });
      try {
        const res = toStoredCheckshots(payloads.checkshots, conv.checkshots, frame);
        checkshots = res.rows;
        warnings.push(...res.warnings);
      } catch (e) {
        throw new Error(`Checkshots: ${e.message}`);
      }
      checkshotsProvenance = makeCheckshotProvenance(conv.checkshots, {
        source: 'well-import', kbM, stations: frame.stations ? frame.stations.length : 0,
      });
    }
    const nonSi = [];
    if (headUnit === 'ft') nonSi.push('KB/TD ft');
    if (payloads.deviation.length && conv.deviation.mdUnit === 'ft') nonSi.push('deviation MD ft');
    if (payloads.tops.length && conv.tops.mdUnit === 'ft') nonSi.push('tops MD ft');
    if (payloads.checkshots.length) {
      const c = conv.checkshots;
      nonSi.push(`checkshots ${c.depthRef.toUpperCase()} ${c.depthUnit} ${c.time.toUpperCase()}`);
    }
    return {
      name, uwi: head.uwi.trim() || null, surfaceX, surfaceY, kbM, tdMdM,
      deviation: dev.deviation, tops: payloads.tops, checkshots, checkshotsProvenance,
      unitsNote: nonSi.length ? `entered: ${nonSi.join(', ')}; stored SI` : null,
      warnings,
      crs: placed.crs,
      xyUnit: placed.xyUnit,
      crsProvenance: { ...placed.crsProvenance, ...dev.azimuthProvenance },
      autoSetProject: placed.autoSetProject,
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
      setCsTouched(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="well-import">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <input className={inputCls} placeholder="Well name *" value={head.name}
          onChange={setHeadField('name')} data-testid="well-import-name" />
        <input className={inputCls} placeholder="UWI (optional)" value={head.uwi}
          onChange={setHeadField('uwi')} />
        <label className="text-xs text-slate-400 flex items-center gap-1">
          KB, TD in
          <select className={inputCls} value={headUnit} onChange={(e) => setHeadUnit(e.target.value)}
            data-testid="well-import-depthunit" title="Unit of the KB and TD you type. Stored in metres.">
            <option value="m">metres</option>
            <option value="ft">feet</option>
          </select>
        </label>
        <input className={inputCls} placeholder={`KB ${unitLabel(headUnit)} above datum`} value={head.kb}
          onChange={setHeadField('kb')} data-testid="well-import-kb" title="Kelly bushing elevation above the (seismic) datum" />
        <input className={inputCls} placeholder={`TD ${unitLabel(headUnit)} MD (vertical wells)`} value={head.td}
          onChange={setHeadField('td')} data-testid="well-import-td"
          title="Required only when no deviation survey is pasted; defaults to the last station otherwise" />
      </div>

      {/* Surface location with an explicit CRS declaration (Phase 4):
          coordinates convert into the Project CRS at save. */}
      <div className="rounded border border-slate-800 bg-slate-950/40 p-2 space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          Surface location
          <button
            type="button"
            className={`px-1.5 py-0.5 rounded border text-xs ${locMode === 'xy'
              ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
            onClick={() => setLocMode('xy')}
            data-testid="well-loc-xy"
          >
            Projected XY
          </button>
          <button
            type="button"
            className={`px-1.5 py-0.5 rounded border text-xs ${locMode === 'latlon'
              ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
            onClick={() => setLocMode('latlon')}
            data-testid="well-loc-latlon"
          >
            Lat / Lon (WGS 84)
          </button>
          {crsContext?.projectTag && isTransformableTag(crsContext.projectTag) && (
            <span className="ml-auto text-slate-500">
              Stored in {crsContext.projectName || crsContext.projectTag}
            </span>
          )}
        </div>
        {locMode === 'xy' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-start">
            <div className="col-span-2">
              <CrsPicker
                value={crsTag}
                onChange={(tag) => setCrsTag(tag)}
                customDefs={crsContext?.customDefs || {}}
                allowSentinels
              />
            </div>
            <input className={inputCls} placeholder="Surface X *" value={head.x}
              onChange={setHeadField('x')} data-testid="well-import-x" />
            <input className={inputCls} placeholder="Surface Y *" value={head.y}
              onChange={setHeadField('y')} data-testid="well-import-y" />
            <label className="text-xs text-slate-400 flex items-center gap-1 col-span-2">
              Values are in
              <select
                className={inputCls}
                value={xyUnit}
                onChange={(e) => setXyUnit(e.target.value)}
                data-testid="well-import-xyunit"
              >
                <option value="m">metres</option>
                <option value="ft">feet</option>
                <option value="ftUS">US survey feet</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Latitude (deg, N positive) *" value={latlon.lat}
              onChange={(e) => setLatlon((v) => ({ ...v, lat: e.target.value }))}
              data-testid="well-import-lat" />
            <input className={inputCls} placeholder="Longitude (deg, E positive) *" value={latlon.lon}
              onChange={(e) => setLatlon((v) => ({ ...v, lon: e.target.value }))}
              data-testid="well-import-lon" />
          </div>
        )}
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

      {tab === 'deviation' && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <MdUnitSelect value={conv.deviation.mdUnit} onChange={(u) => setTabConv('deviation', { mdUnit: u })} testId="well-import-devunit" label="Survey MD in" />
          {texts.deviation.trim() && (
            <>
              Azimuths referenced to
              <select
                className={inputCls}
                value={azimuthRef}
                onChange={(e) => setAzimuthRef(e.target.value)}
                data-testid="well-import-aziref"
                title="Deviation surveys record azimuths against grid, true or magnetic north. True and magnetic rotate to grid north using the wellhead grid convergence."
              >
                <option value="grid">Grid north (no correction)</option>
                <option value="true">True north</option>
                <option value="magnetic">Magnetic north</option>
              </select>
              {azimuthRef === 'magnetic' && (
                <label className="flex items-center gap-1">
                  Declination (deg, E positive)
                  <input className={`${inputCls} w-16`} value={declination}
                    onChange={(e) => setDeclination(e.target.value)}
                    data-testid="well-import-declination" />
                </label>
              )}
            </>
          )}
        </div>
      )}
      {tab === 'tops' && (
        <MdUnitSelect value={conv.tops.mdUnit} onChange={(u) => setTabConv('tops', { mdUnit: u })} testId="well-import-topsunit" label="Tops MD in" />
      )}
      {tab === 'checkshots' && (
        <CheckshotConventionRow conv={conv.checkshots} onChange={(c) => { setCsTouched(true); setTabConv('checkshots', c); }} />
      )}

      <textarea
        className={`${inputCls} w-full h-24 font-mono`}
        placeholder={tab === 'deviation'
          ? 'Paste the deviation survey (MD, inclination, azimuth)… leave empty for a vertical well'
          : tab === 'tops'
            ? 'Paste tops (name, MD)…'
            : 'Paste checkshots as exported (depth, time); the selectors above say how to read them. Petrel: MD and one-way time.'}
        value={texts[tab]}
        onChange={(e) => setText(e.target.value)}
        data-testid="well-import-text"
      />

      {parsed.rows.length > 0 && (
        <>
          <ColumnMapper
            parsed={parsed}
            fields={spec.fields}
            labels={labels}
            map={map}
            nCols={nCols}
            onMap={setMapField}
            extraColumns={csPreview ? [{ label: 'stored TVDSS m / TWT ms', cell: csPreview.cell }] : []}
          />
          {csPreview?.note && (
            <div className="text-[11px] text-slate-500" data-testid="well-import-cs-note">{csPreview.note}</div>
          )}
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
