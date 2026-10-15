// Depth alignment between wells (QI upgrade P2.11, 2026-10-15), under the
// Well ties tab: for a horizon picked on the study's first volume and the
// zone top it follows, each well's mistie (the horizon's time at the well's
// trace minus the top's time through the well's own tie) and the wells whose
// mistie departs from the others' median by more than a tolerance (engines
// qi/qcAdditions.js depthAlignment). A shared shift is a datum or tie
// question for the whole study; one well off the others is that well's tie,
// its datum, or the pick.
import React, { useEffect, useState } from 'react';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { useQIStudio } from '../QIStudioContext';
import { prepareWell } from '../services/inversionWells';
import { depthAlignment } from '../engine/qcAdditions';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text';
const input = 'rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-xs text-pl-text';
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : EMPTY_VALUE);

export default function DepthAlignmentSection() {
  const { chosenVolumes, ready, project, backend, targetChoices, saveIssue, canWrite, addNotification } = useQIStudio();
  const volume = chosenVolumes[0] || null;
  const [horizons, setHorizons] = useState([]);
  const [hId, setHId] = useState('');
  const [zone, setZone] = useState('');
  const [tol, setTol] = useState('8');
  const [st, setSt] = useState(null);
  useEffect(() => {
    setHorizons([]);
    if (!volume || !backend?.listHorizons) return undefined;
    let live = true;
    backend.listHorizons(volume.id).then((h) => { if (live) setHorizons(h || []); }).catch(() => {});
    return () => { live = false; };
  }, [volume?.id, backend]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!volume || !ready.length || !backend?.loadHorizonGrid) return null;
  const h = horizons.find((x) => x.id === hId) || horizons[0] || null;
  const z = zone || project.targets[0] || targetChoices[0] || '';
  const tolOk = String(tol).trim() !== '' && Number(tol) > 0;
  const run = async () => {
    setSt({ busy: true });
    try {
      const frame = await backend.loadVolumeFrame(volume);
      const grid = await backend.loadHorizonGrid(h);
      const wells = [];
      for (const r of ready) {
        const top = (r.zones || []).find((x) => x.name === z)?.top_md_m;
        if (!Number.isFinite(top)) { wells.push({ name: r.well.name, reason: `No ${z} zone.` }); continue; }
        const w = await prepareWell(r, frame, backend.downloadCurve, { topsMd: [top] });
        if (!w.ok) { wells.push({ name: r.well.name, reason: w.reason }); continue; }
        const pick = grid[w.il * frame.nXl + w.xl];
        const horizonMs = Math.abs(pick) <= 1e29 && Number.isFinite(pick) ? pick * frame.dtMs : NaN;
        wells.push({ name: r.well.name, horizonMs, wellMs: w.topsTwt?.[0] ?? NaN, reason: Number.isFinite(horizonMs) ? null : 'The horizon has no pick at the well.' });
      }
      const res = depthAlignment(wells.filter((w) => !w.reason), { toleranceMs: Number(tol) });
      setSt({ result: { ...res, horizon: h.name, zone: z, toleranceMs: Number(tol), inputs: Object.fromEntries(wells.map((w) => [w.name, w])), skipped: wells.filter((w) => w.reason) } });
    } catch (e) { setSt({ error: e.message }); }
  };
  const res = st?.result;
  const issues = res ? res.rows.filter((r) => r.flagged).map((r) => ({ key: `depth-align:${res.horizon}:${r.name}`, area: 'Well tie', severity: 'medium', title: `${r.name}: the ${res.horizon} mistie differs from the other wells`, detail: `Mistie ${r.mistieMs.toFixed(1)} ms against a median of ${res.medianMs.toFixed(1)} ms (${r.offMs > 0 ? '+' : ''}${r.offMs.toFixed(1)} ms; tolerance ${res.toleranceMs} ms).`, remedy: 'Check this well\'s tie (bulk shift, checkshots), its depth reference elevation, and the horizon pick near the well.' })) : [];
  return (
    <section className={card} data-testid="qi-depth-align">
      <h2 className="text-sm font-semibold text-pl-text">Depth alignment between wells</h2>
      <p className={muted}>Each well&apos;s mistie between a horizon and the zone top it follows: the horizon time at the well&apos;s trace minus the top&apos;s time through the well&apos;s own tie. A shift shared by every well is a datum or tie matter for the study; a well that departs from the others by more than the tolerance is flagged.</p>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1">Horizon
          <select className={input} value={h?.id || ''} onChange={(e) => setHId(e.target.value)} data-testid="qi-depth-align-horizon">
            {horizons.length ? horizons.map((x) => <option key={x.id} value={x.id}>{x.name}</option>) : <option value="">No horizons on {volume.name}</option>}
          </select>
        </label>
        <label className="flex items-center gap-1">follows the top of
          <select className={input} value={z} onChange={(e) => setZone(e.target.value)} data-testid="qi-depth-align-zone">
            {targetChoices.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">tolerance (ms)<input className={`${input} w-16`} type="number" min="1" value={tol} onChange={(e) => setTol(e.target.value)} data-testid="qi-depth-align-tol" /></label>
        <button type="button" className={btn} onClick={run} disabled={!h || !z || !tolOk || st?.busy} data-testid="qi-depth-align-run">{st?.busy ? 'Checking' : 'Check the alignment'}</button>
      </div>
      {st?.error && <p className="text-xs text-pl-danger-text">{st.error}</p>}
      {res && (
        <div className="space-y-2">
          <table className="text-xs" data-testid="qi-depth-align-table">
            <thead><tr><th className={th}>Well</th><th className={th}>Horizon (ms)</th><th className={th}>Top through the tie (ms)</th><th className={th}>Mistie (ms)</th><th className={th}>From the median (ms)</th><th className={th}>Flag</th></tr></thead>
            <tbody className="font-mono tabular-nums">
              {res.rows.map((w) => (
                <tr key={w.name}><td className={`${td} font-sans`}>{w.name}</td><td className={td}>{f1(res.inputs[w.name]?.horizonMs)}</td><td className={td}>{f1(res.inputs[w.name]?.wellMs)}</td><td className={td}>{f1(w.mistieMs)}</td><td className={td}>{f1(w.offMs)}</td><td className={`${td} font-sans`}>{w.flagged ? 'off the others' : 'aligned'}</td></tr>
              ))}
              {res.skipped.map((w) => <tr key={w.name}><td className={`${td} font-sans`}>{w.name}</td><td className={`${td} font-sans text-pl-warning-text`} colSpan={5}>{w.reason}</td></tr>)}
            </tbody>
          </table>
          <p className={muted}>{`Median mistie ${f1(res.medianMs)} ms.`}</p>
          {issues.length > 0 && canWrite && <button type="button" className={btn} onClick={() => { for (const i of issues) saveIssue({ ...i, status: 'open', owner: '' }); addNotification(`${issues.length} alignment issue${issues.length === 1 ? '' : 's'} added to the register.`, 'success'); }} data-testid="qi-depth-align-issues">{`Add ${issues.length} alignment issue${issues.length === 1 ? '' : 's'} to the register`}</button>}
        </div>
      )}
    </section>
  );
}
