// Surveys on the rig (upgrade U2-005): the survey in use with its minimum
// curvature listing, one MWD station typed as it is taken, or a table of
// stations pasted or loaded from a file. The unit of the measured depths
// and the north the azimuths are measured from are declared every time.
// A run replaces the survey from its first station down and keeps what is
// above; depths stored with an earlier survey are counted and, where they
// were entered as TVD, listed with where they would now fall.

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toRigLocal } from '@/lib/wellsite/time';
import { fmtDepth, parseFieldNumber, depthToDisplay } from '../services/units';
import { parseStationTable, buildRun, surveyListing, AZIMUTH_REFS } from '../services/surveys';

export default function SurveysView({ inUse, ctx, unit, offsetMin, stale, runs = [], onRecord, onStatus, nameOf, extraSlot = null }) {
  const [md, setMd] = useState('');
  const [inc, setInc] = useState('');
  const [azi, setAzi] = useState('');
  const [mdUnit, setMdUnit] = useState('');
  const [aziRef, setAziRef] = useState('');
  const [corr, setCorr] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const sel = 'bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-xs text-pl-text';
  const stations = (inUse && inUse.survey && inUse.survey.stations) || [];
  const listing = useMemo(() => surveyListing(stations, ctx ? ctx.kbElevM : 0), [stations, ctx]);
  const parsed = useMemo(() => { if (!text.trim()) return null; try { return parseStationTable(text); } catch (e) { return { error: e.message }; } }, [text]);
  const d = (m, dp) => (Number.isFinite(m) ? depthToDisplay(m, unit).toFixed(dp ?? (unit === 'ft' ? 1 : 2)) : 'n/a');
  const dls = (r) => (unit === 'ft' ? r.dls100ft : r.dls30m);

  const record = async (list, source) => {
    setError('');
    try {
      const p = buildRun({ stations: list, mdUnit, azimuthRef: aziRef, gridCorrectionDeg: corr.trim() === '' ? 0 : parseFieldNumber(corr), current: stations, source });
      await onRecord(p);
      setMd(''); setInc(''); setAzi(''); setText('');
    } catch (e) { setError(e.message); onStatus?.(e.message); }
  };
  const addOne = () => record([{ md: parseFieldNumber(md), inc: parseFieldNumber(inc), azi: parseFieldNumber(azi) }], 'manual');
  const onFile = async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; setText(await f.text()); e.target.value = ''; };

  return (
    <div className="p-4 space-y-4" data-testid="ws-surveys">
      <h2 className="text-sm font-semibold text-pl-text">Surveys</h2>
      <div className="text-[11px] text-pl-text" data-testid="ws-survey-inuse">
        Survey in use: {inUse.label}{inUse.survey ? `, version ${inUse.survey.version}, to ${fmtDepth(stations[stations.length - 1].md, unit)} MD` : ''}.
        {inUse.lastRun ? ` Last run recorded ${toRigLocal(Date.parse(inUse.lastRun.occurred_at), offsetMin).iso.replace('T', ' ')} rig time${nameOf ? ` by ${nameOf(inUse.lastRun.created_by)}` : ''}.` : ''}
        {' '}TVD and subsea depths are minimum curvature; below the last station they are extrapolated along its attitude and the app says so.
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-pl-text">Record a survey</h3>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="text-[10px] text-pl-muted">Measured depths are in<br />
            <select className={sel} value={mdUnit} onChange={(e) => setMdUnit(e.target.value)} data-testid="ws-survey-mdunit"><option value="">declare the unit</option><option value="ft">ft</option><option value="m">m</option></select>
          </label>
          <label className="text-[10px] text-pl-muted">Azimuths are from<br />
            <select className={sel} value={aziRef} onChange={(e) => setAziRef(e.target.value)} data-testid="ws-survey-aziref"><option value="">declare the north</option>{AZIMUTH_REFS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select>
          </label>
          {(aziRef === 'true' || aziRef === 'magnetic') && (
            <label className="text-[10px] text-pl-muted" title="Added to every azimuth to bring it to grid north">Correction to grid (deg)<br /><input className={`${sel} w-20`} inputMode="decimal" value={corr} onChange={(e) => setCorr(e.target.value)} data-testid="ws-survey-corr" /></label>
          )}
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="text-[10px] text-pl-muted">MD{mdUnit ? ` (${mdUnit})` : ''}<br /><input className={`${sel} w-24`} inputMode="decimal" value={md} onChange={(e) => setMd(e.target.value)} data-testid="ws-survey-md" /></label>
          <label className="text-[10px] text-pl-muted">Inclination (deg)<br /><input className={`${sel} w-20`} inputMode="decimal" value={inc} onChange={(e) => setInc(e.target.value)} data-testid="ws-survey-inc" /></label>
          <label className="text-[10px] text-pl-muted">Azimuth (deg)<br /><input className={`${sel} w-20`} inputMode="decimal" value={azi} onChange={(e) => setAzi(e.target.value)} data-testid="ws-survey-azi" /></label>
          <Button size="sm" onClick={addOne} disabled={md.trim() === ''} data-testid="ws-survey-add">Record station</Button>
        </div>
        <div className="flex items-start gap-2 flex-wrap">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} spellCheck={false} data-testid="ws-survey-paste" placeholder="MD  Inc  Azi, one station per line" className="w-full max-w-xl bg-pl-surface border border-pl-border-strong rounded px-2 py-1 text-[11px] font-mono text-pl-text" />
          <div className="space-y-1">
            <input type="file" accept=".csv,.txt,.tsv,text/plain,text/csv" onChange={onFile} data-testid="ws-survey-file" className="block text-xs text-pl-text" />
            <Button size="sm" variant="outline" disabled={!parsed || !!parsed.error || !parsed.stations.length} onClick={() => record(parsed.stations, 'external')} data-testid="ws-survey-paste-record">Record {parsed && !parsed.error ? parsed.stations.length : 0} station(s)</Button>
          </div>
        </div>
        {parsed && parsed.error && <div className="text-[11px] text-pl-warning-text" data-testid="ws-survey-parse-error">{parsed.error}</div>}
        {parsed && !parsed.error && (
          <div className="text-[11px] text-pl-muted" data-testid="ws-survey-parse-summary">
            Read {parsed.stations.length} station(s){parsed.unitGuess ? `; the header says ${parsed.unitGuess}, declare it above` : ''}{parsed.skipped.length ? `; ${parsed.skipped.length} line(s) not read: ${parsed.skipped.slice(0, 5).map((s) => `line ${s.line} (${s.reason})`).join(', ')}` : ''}. A run replaces the survey from its first station down and keeps what is above it.
          </div>
        )}
        {error && <div className="text-[11px] text-pl-warning-text" data-testid="ws-survey-error">{error}</div>}
      </section>

      {stale && stale.count > 0 && (
        <section className="space-y-1" data-testid="ws-survey-stale">
          <h3 className="text-xs font-semibold text-pl-text">Depths recorded with an earlier survey</h3>
          <div className="text-[11px] text-pl-text" data-testid="ws-survey-stale-summary">
            {stale.count} stored depth(s) were calculated before survey {stale.currentVersion || 'none'}. Their measured depths stand; TVD and subsea depth are recalculated on screen with the survey in use (the largest change is {fmtDepth(stale.maxTvdDiffM, unit, unit === 'ft' ? 1 : 2)}).
            {stale.moved.length ? ` ${stale.moved.length} were entered as TVD or TVDSS, so their measured depth depends on the survey:` : ''}
          </div>
          {stale.moved.slice(0, 20).map((m) => (
            <div key={m.id} className="text-[11px] text-pl-warning-text" data-testid={`ws-survey-moved-${m.id}`}>
              {m.name || String(m.subtype).replace(/_/g, ' ')}: stored at {fmtDepth(m.mdM, unit, unit === 'ft' ? 1 : 2)} MD with survey {m.storedVersion || 'none'}; the survey in use puts the same {m.enteredAs} at {fmtDepth(m.mdNowM, unit, unit === 'ft' ? 1 : 2)} MD ({m.mdDiffM > 0 ? '+' : ''}{fmtDepth(m.mdDiffM, unit, unit === 'ft' ? 1 : 2)}). Record it again if the entered TVD is what was meant.
            </div>
          ))}
        </section>
      )}

      {extraSlot}

      <section className="space-y-1">
        <h3 className="text-xs font-semibold text-pl-text">Stations in use ({listing.length})</h3>
        <div className="overflow-x-auto">
          <table className="text-xs text-pl-text" data-testid="ws-survey-table">
            <thead><tr className="text-[10px] uppercase text-pl-muted text-left">
              <th className="pr-3">MD ({unit})</th><th className="pr-3">Inc (deg)</th><th className="pr-3">Azi grid (deg)</th><th className="pr-3">TVD ({unit})</th><th className="pr-3">TVDSS ({unit})</th><th className="pr-3">North ({unit})</th><th className="pr-3">East ({unit})</th><th className="pr-3">DLS (deg/{unit === 'ft' ? '100 ft' : '30 m'})</th>
            </tr></thead>
            <tbody>
              {listing.map((r, i) => (
                <tr key={`${r.md}-${i}`} data-testid={`ws-survey-row-${i}`} className="whitespace-nowrap">
                  <td className="pr-3">{d(r.md)}</td><td className="pr-3">{r.inc.toFixed(2)}</td><td className="pr-3">{r.azi.toFixed(2)}</td>
                  <td className="pr-3" data-testid={`ws-survey-tvd-${i}`}>{d(r.tvd)}</td><td className="pr-3">{d(r.tvdss)}</td><td className="pr-3">{d(r.n)}</td><td className="pr-3">{d(r.e)}</td><td className="pr-3">{dls(r).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {listing.length === 0 && <div className="text-[11px] text-pl-muted" data-testid="ws-survey-none">No survey yet. Record a surface station at MD 0 and the first station below it.</div>}
        {runs.length > 0 && <div className="text-[10px] text-pl-muted" data-testid="ws-survey-runs">{runs.length} run(s) on record. {runs.slice(-3).map((r) => `${toRigLocal(Date.parse(r.occurred_at), offsetMin).hhmm}: ${r.payload.text}`).join(' ')}</div>}
      </section>
    </div>
  );
}
