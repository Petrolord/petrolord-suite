// Biozone scheme import and dating (Stratigraphy T1 ST-T1-001): import the
// company's zone scheme as a CSV with its source, then date every biozone
// interval whose scheme and code match a zone.

import React, { useState } from 'react';
import { FileUp, CalendarClock } from 'lucide-react';
import { parseZoneSchemeCsv, fillBiozoneAges, loadZoneSchemes, saveZoneSchemes } from '../services/zoneSchemes';

const btnCls = 'flex items-center gap-1 px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40';

export default function ZoneSchemePanel({ intervals, canEdit, onReplace, onStatus }) {
  const [zones, setZones] = useState(loadZoneSchemes);
  const biozones = (intervals || []).filter((r) => r.kind === 'biozone_interval');
  const schemes = [...new Set(zones.map((z) => z.scheme))];
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const { zones: z, problems } = parseZoneSchemeCsv(await f.text());
      if (!z.length) throw new Error(problems[0] || 'No zones in the file.');
      setZones(z); saveZoneSchemes(z);
      onStatus(`Loaded ${z.length} zone${z.length === 1 ? '' : 's'} (${[...new Set(z.map((x) => x.scheme))].join(', ')})${problems.length ? `; ${problems.length} row${problems.length === 1 ? '' : 's'} skipped: ${problems[0]}` : ''}.`);
    } catch (err) { onStatus(err.message); }
  };
  const fill = async () => {
    const { rows, filled, unmatched } = fillBiozoneAges(biozones, zones);
    if (!filled) { onStatus(unmatched.length ? `No biozone matched the scheme (${unmatched.slice(0, 3).join(', ')}). Check the scheme and code columns.` : 'Every biozone interval already has ages.'); return; }
    await onReplace('biozone_interval', rows);
    onStatus(`Dated ${filled} biozone interval${filled === 1 ? '' : 's'} from the scheme${unmatched.length ? `; not in the scheme: ${unmatched.slice(0, 3).join(', ')}` : ''}.`);
  };
  return (
    <div className="mb-3 rounded border border-slate-800 p-2 text-xs text-slate-300 space-y-1" data-testid="strat-zone-scheme">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Biozone scheme</span>
        <span className="text-slate-500" data-testid="strat-zone-scheme-summary">{zones.length ? `${zones.length} zones: ${schemes.join(', ')}` : 'none loaded'}</span>
        <label className={`${btnCls} cursor-pointer ml-auto`}>
          <FileUp className="w-3.5 h-3.5" /> Import scheme (CSV)
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} data-testid="strat-zone-scheme-file" />
        </label>
        <button type="button" className={btnCls} disabled={!canEdit || !zones.length || !biozones.length} onClick={fill} data-testid="strat-zone-fill">
          <CalendarClock className="w-3.5 h-3.5" /> Date biozones from the scheme
        </button>
      </div>
      <p className="text-[10px] text-slate-500">Columns: scheme, zone, top_ma, base_ma, source. Use the calibration your company works to; each dated interval records the source.</p>
    </div>
  );
}
