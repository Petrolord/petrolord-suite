// Hydrocarbon shows (spec section 20): every characteristic is a
// controlled value picked from the engine tables; the quality summary
// is derived and read-only. A show belongs to a sample when one is
// chosen, else to the depth entered.

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import DepthEntry from './DepthEntry';
import { emptyShow, showSummary, showAbbrev, SHOW_TABLES, DISTRIBUTION_PERCENT, showParams, SHOW_SUBTYPE } from '../services/shows';
import { fmtDepth, depthToDisplay } from '../services/units';
import { toRigLocal } from '@/lib/wellsite/time';

const FIELDS = [
  ['fluorescence', 'colour', 'Fluorescence colour', 'fluorescenceColour'],
  ['fluorescence', 'intensity', 'Fluorescence intensity', 'fluorescenceIntensity'],
  ['cut', 'speed', 'Cut speed', 'cutSpeed'],
  ['cut', 'type', 'Cut type', 'cutType'],
  ['cut', 'colour', 'Cut colour', 'cutColour'],
  [null, 'stain', 'Stain', 'stain'],
  [null, 'odour', 'Odour', 'odour'],
  [null, 'residue', 'Residue', 'residue'],
];

export default function ShowsView({ backend, well, ctx, shows, samples, defaults, unit, offsetMin, onChanged, onStatus }) {
  const [show, setShow] = useState(emptyShow);
  const [sampleId, setSampleId] = useState('');
  const [depth, setDepth] = useState({ value: NaN, unit: defaults.unit, reference: 'MD', datum: 'KB' });
  const summary = useMemo(() => showSummary(show), [show]);
  const sample = samples.find((s) => s.id === sampleId) || null;
  const sel = 'bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-100';
  const set = (group, key, value) => setShow((s) => (group ? { ...s, [group]: { ...s[group], [key]: value } } : { ...s, [key]: value }));
  const local = (iso) => toRigLocal(Date.parse(iso), offsetMin).hhmm;

  const save = async () => {
    try {
      const depthEntry = sample ? { value: depthToDisplay(sample.md_calc_m, 'm'), unit: 'm', reference: 'MD', datum: 'KB' } : depth;
      const { row } = await backend.addRecord(well.id, showParams({ show, sampleId: sample ? sample.id : null, depthEntry }));
      onStatus?.(`Show recorded${sample ? ` on sample ${sample.sample_no}` : ''}: ${summary.qualityName}.`);
      setShow(emptyShow()); setSampleId('');
      onChanged?.(row);
    } catch (e) { onStatus?.(e.message); }
  };

  return (
    <div className="p-4 space-y-4" data-testid="ws-shows">
      <h2 className="text-sm font-semibold text-slate-100">Shows</h2>
      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-[10px] text-slate-400">Sample<br />
          <select value={sampleId} onChange={(e) => setSampleId(e.target.value)} data-testid="ws-show-sample" className={sel}>
            <option value="">by depth</option>
            {[...samples].sort((a, b) => b.md_calc_m - a.md_calc_m).slice(0, 40).map((s) => <option key={s.id} value={s.id}>No {s.sample_no}, {fmtDepth(s.md_calc_m, unit)}</option>)}
          </select>
        </label>
        {!sample && <div><div className="text-[10px] text-slate-400">Depth</div><DepthEntry value={depth} onChange={setDepth} kind="lagged_sample" ctx={ctx} compact testIdPrefix="ws-show-depth" /></div>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {FIELDS.map(([group, key, label, table]) => (
          <label key={`${group}-${key}`} className="text-[10px] text-slate-400">{label}<br />
            <select value={group ? show[group][key] : show[key]} onChange={(e) => set(group, key, e.target.value)} data-testid={`ws-show-${group ? `${group}-${key}` : key}`} className={`${sel} w-full`}>
              {SHOW_TABLES[table].map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </label>
        ))}
        <label className="text-[10px] text-slate-400">Fluorescence distribution<br />
          <select value={show.fluorescence.distributionPct} onChange={(e) => set('fluorescence', 'distributionPct', Number(e.target.value))} data-testid="ws-show-fluorescence-distribution" className={`${sel} w-full`}>
            {DISTRIBUTION_PERCENT.map((p) => <option key={p} value={p}>{p} percent</option>)}
          </select>
        </label>
        <label className="text-[10px] text-slate-400 col-span-2">Comment<br />
          <input value={show.comment || ''} onChange={(e) => setShow({ ...show, comment: e.target.value })} data-testid="ws-show-comment" className={`${sel} w-full`} />
        </label>
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Derived quality (not typed)</div>
        <div className="text-xs text-cyan-200" data-testid="ws-show-summary" data-quality={summary.quality}>{summary.text}</div>
        <div className="text-[10px] text-slate-500">score {summary.score} of 12</div>
      </div>
      <Button size="sm" onClick={save} data-testid="ws-show-save">Record show</Button>
      <section>
        <h3 className="text-xs font-semibold text-slate-200 mb-1">Recent shows</h3>
        <table className="text-xs text-slate-300 w-full"><tbody>
          {[...shows].reverse().slice(0, 12).map((r) => {
            const s = showSummary(r.payload);
            const smp = samples.find((x) => x.id === r.sample_id);
            return (
              <tr key={r.id} data-testid={`ws-show-row-${r.id}`} data-quality={s.quality} className="align-top">
                <td className="pr-3 whitespace-nowrap text-slate-500">{local(r.occurred_at)}</td>
                <td className="pr-3 whitespace-nowrap">{smp ? `No ${smp.sample_no}, ` : ''}{Number.isFinite(r.md_calc_m) ? fmtDepth(r.md_calc_m, unit) : ''}</td>
                <td className="pr-3">{showAbbrev(r.payload)}</td>
                <td className="whitespace-nowrap text-cyan-300">{s.qualityName}</td>
              </tr>
            );
          })}
        </tbody></table>
        {shows.length === 0 && <div className="text-xs text-slate-500">No shows recorded yet.</div>}
      </section>
    </div>
  );
}
export { SHOW_SUBTYPE };
