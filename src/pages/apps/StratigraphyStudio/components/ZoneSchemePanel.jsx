// Biozone scheme import and dating (Stratigraphy T1 ST-T1-001): import the
// company's zone scheme as a CSV with its source, then date every biozone
// interval whose scheme and code match a zone.

import React, { useState } from 'react';
import { FileUp, CalendarClock } from 'lucide-react';
import { parseZoneSchemeCsv, fillBiozoneAges, loadZoneSchemes, saveZoneSchemes, mergeZoneSchemes } from '../services/zoneSchemes';

const btnCls = 'flex items-center gap-1 px-2 py-1 rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';

export default function ZoneSchemePanel({ intervals, canEdit, onReplace, onStatus }) {
  const [zones, setZones] = useState(loadZoneSchemes);
  const biozones = (intervals || []).filter((r) => r.kind === 'biozone_interval');
  // STRAT-U1-007: what was read, per scheme (zones, age range, source), so a
  // file in the wrong unit shows at once; a scheme can be removed on its own
  const schemes = [...new Set(zones.map((z) => z.scheme))];
  const summary = schemes.map((name) => {
    const list = zones.filter((z) => z.scheme === name);
    return { name, n: list.length, top: Math.min(...list.map((z) => z.top_ma)), base: Math.max(...list.map((z) => z.base_ma)), sources: [...new Set(list.map((z) => z.source))] };
  });
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const { zones: z, problems, notes } = parseZoneSchemeCsv(await f.text());
      if (!z.length) throw new Error(problems[0] || 'No zones in the file.');
      const { zones: merged, replaced } = mergeZoneSchemes(zones, z);
      setZones(merged); saveZoneSchemes(merged);
      const names = [...new Set(z.map((x) => x.scheme))];
      const rep = replaced.length ? `; replaced ${replaced.map((r) => `${r.scheme} (${r.before} zone${r.before === 1 ? '' : 's'} before)`).join(', ')}` : '';
      onStatus(`Loaded ${z.length} zone${z.length === 1 ? '' : 's'} (${names.join(', ')})${rep}${notes.length ? `; ${notes.join('; ')}` : ''}${problems.length ? `; ${problems.length} row${problems.length === 1 ? '' : 's'} not imported: ${problems[0]}` : ''}.`);
    } catch (err) { onStatus(err.message); }
  };
  const removeScheme = (name) => {
    const next = zones.filter((z) => z.scheme !== name);
    setZones(next); saveZoneSchemes(next);
    onStatus(`Removed the ${name} scheme from this browser.`);
  };
  const fill = async () => {
    const { rows, filled, unmatched } = fillBiozoneAges(biozones, zones);
    if (!filled) { onStatus(unmatched.length ? `No biozone matched the scheme (${unmatched.slice(0, 3).join(', ')}). Check the scheme and code columns.` : 'Every biozone interval already has ages.'); return; }
    await onReplace('biozone_interval', rows);
    onStatus(`Dated ${filled} biozone interval${filled === 1 ? '' : 's'} from the scheme${unmatched.length ? `; not in the scheme: ${unmatched.slice(0, 3).join(', ')}` : ''}.`);
  };
  return (
    <div className="mb-3 rounded border border-pl-border p-2 text-xs text-pl-text space-y-1" data-testid="strat-zone-scheme">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Biozone scheme</span>
        <span className="text-pl-muted" data-testid="strat-zone-scheme-summary">{zones.length ? `${zones.length} zones: ${schemes.join(', ')}` : 'none loaded'}</span>
        <label className={`${btnCls} cursor-pointer ml-auto`}>
          <FileUp className="w-3.5 h-3.5" /> Import scheme (CSV)
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} data-testid="strat-zone-scheme-file" />
        </label>
        <button type="button" className={btnCls} disabled={!canEdit || !zones.length || !biozones.length} onClick={fill} data-testid="strat-zone-fill">
          <CalendarClock className="w-3.5 h-3.5" /> Date biozones from the scheme
        </button>
      </div>
      {summary.length > 0 && (
        <table className="text-[11px]" data-testid="strat-zone-scheme-table">
          <tbody>
            {summary.map((r) => (
              <tr key={r.name} data-testid={`strat-zone-scheme-row-${r.name}`}>
                <td className="pr-3 font-medium">{r.name}</td>
                <td className="pr-3 text-pl-muted">{r.n} zone{r.n === 1 ? '' : 's'}</td>
                <td className="pr-3 font-mono">{r.top} to {r.base} Ma</td>
                <td className="pr-3 text-pl-muted truncate max-w-[18rem]" title={r.sources.join('; ')}>{r.sources.join('; ')}</td>
                <td><button type="button" className="text-pl-muted hover:text-pl-danger-text" onClick={() => removeScheme(r.name)} data-testid={`strat-zone-scheme-remove-${r.name}`}>remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[10px] text-pl-muted">Columns: scheme, zone, top_ma, base_ma, source (Zonation, Top Age, Base Age and Reference are read too; ages in ka when the header says ka). A second file adds its schemes and replaces a scheme of the same name. Remembered in this browser. Use the calibration your company works to; each dated interval records the source.</p>
    </div>
  );
}
