// Well ties across the study (QI programme Q6a / A6, 2026-10-06): each
// chosen well's committed Seismolord tie, the tie wavelets overlaid after
// alignment with their average (the field wavelet), how alike they are, and
// the tie issues offered to the register. White chart and ChartLogo.
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Label, Legend } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { useQIStudio } from '../QIStudioContext';
import { tieRows, waveletComparison, tieIssues } from '../services/ties';
import { waveletText, downloadText } from '../services/handover';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text';
const SERIES = ['#2563eb', '#d97706', '#059669', '#db2777', '#7c3aed', '#0891b2'];
const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const LABEL_STYLE = { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize };
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : EMPTY_VALUE);

export default function TiesPanel() {
  const { ready, saveIssue, canWrite, addNotification } = useQIStudio();
  const rows = useMemo(() => tieRows(ready), [ready]);
  const cmp = useMemo(() => { try { return waveletComparison(rows); } catch { return null; } }, [rows]);
  const issues = useMemo(() => tieIssues(rows, cmp), [rows, cmp]);
  const chart = useMemo(() => {
    if (!cmp) return null;
    const n = cmp.average.length;
    const c = (n - 1) / 2;
    return Array.from({ length: n }, (_, i) => {
      const row = { t: Number(((i - c) * cmp.dtMs).toFixed(2)), average: cmp.average[i] };
      cmp.aligned.forEach((a, k) => { row[`w${k}`] = a.samples[i]; });
      return row;
    });
  }, [cmp]);
  const addIssues = () => {
    for (const i of issues) saveIssue({ ...i, status: 'open', owner: '' });
    addNotification(`${issues.length} tie issue${issues.length === 1 ? '' : 's'} added to the register.`, 'success');
  };
  if (!ready.length) return <section className={card}><p className={muted}>Choose wells on Setup to review their ties.</p></section>;
  return (
    <section className={card} data-testid="qi-ties">
      <h2 className="text-sm font-semibold text-pl-text">Well ties</h2>
      <p className={muted}>
        The tie each well has in Seismolord, as committed with its QC record. Tie wells in Seismolord (Synthetics), using the sonic drift-corrected to the checkshots in Well Data Manager where there is one.{' '}
        <Link className="underline" to="/dashboard/apps/geoscience/seismolord">Open Seismolord</Link>
      </p>
      <table className="text-xs" data-testid="qi-ties-table">
        <thead><tr><th className={th}>Well</th><th className={th}>Mean correlation</th><th className={th}>Minimum</th><th className={th}>Bulk shift (ms)</th><th className={th}>Wavelet</th><th className={th}>Tied on</th><th className={th} /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.wellId}>
              <td className={td}>{r.wellName}</td>
              {r.tie ? (
                <>
                  <td className={`${td} font-mono`}>{f(r.tie.meanCorr)}</td>
                  <td className={`${td} font-mono`}>{f(r.tie.minCorr)}</td>
                  <td className={`${td} font-mono`}>{f(r.tie.shiftMs, 1)}</td>
                  <td className={td}>{r.tie.wavelet ? `${r.tie.wavelet.kind || 'tie'}, ${f(r.tie.wavelet.peakHz, 1)} Hz, ${f(r.tie.wavelet.phaseDeg, 0)} deg${r.tie.wavelet.samples ? '' : ' (wavelet not stored)'}` : EMPTY_VALUE}</td>
                  <td className={td}>{String(r.tie.measuredAt || '').slice(0, 10) || EMPTY_VALUE}</td>
                  <td className={td}>{r.tie.wavelet?.samples && <button type="button" className={btn} onClick={() => downloadText(`${r.wellName.replace(/[^A-Za-z0-9._-]+/g, '_')}_wavelet.txt`, waveletText({ name: `${r.wellName} tie wavelet`, dtMs: r.tie.wavelet.dtMs, samples: r.tie.wavelet.samples, source: 'the wavelet stored with the Seismolord tie' }))}>Wavelet (text)</button>}</td>
                </>
              ) : <td className={`${td} text-pl-muted`} colSpan={6}>No tie committed in Seismolord</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {cmp ? (
        <div className="space-y-2" data-testid="qi-ties-wavelets">
          <div className="bg-white rounded-lg p-3 relative" data-canvas="chart" style={{ height: 300, maxWidth: 640 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={CHART_MARGINS.standard}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tick={AXIS_TICK}>
                  <Label value="Time (ms)" position="insideBottom" offset={-5} style={LABEL_STYLE} />
                </XAxis>
                <YAxis tick={AXIS_TICK} tickFormatter={(v) => v.toFixed(2)}>
                  <Label value="Amplitude (unit energy)" angle={-90} position="insideLeft" style={LABEL_STYLE} />
                </YAxis>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => Number(v).toFixed(3)} />
                <Legend />
                {cmp.aligned.map((a, k) => <Line key={a.name} dataKey={`w${k}`} name={a.name} stroke={SERIES[k % SERIES.length]} dot={false} isAnimationActive={false} strokeWidth={1} />)}
                <Line dataKey="average" name="Average (field wavelet)" stroke="#0f172a" dot={false} isAnimationActive={false} strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
            <ChartLogo />
          </div>
          <table className="text-xs" data-testid="qi-ties-similarity">
            <thead><tr><th className={th}>Well</th><th className={th}>Fit to the average</th><th className={th}>Shift applied (ms)</th></tr></thead>
            <tbody className="font-mono tabular-nums">
              {cmp.misfit.map((m, k) => <tr key={m.name}><td className={`${td} font-sans`}>{m.name}</td><td className={td}>{f(m.corrToAverage)}</td><td className={td}>{f(cmp.aligned[k].lag * cmp.dtMs, 1)}</td></tr>)}
            </tbody>
          </table>
          <p className={muted}>{`Wavelets resampled to ${cmp.dtMs} ms, aligned to ${cmp.names[0]} by cross-correlation and normalised to unit energy before averaging.`}</p>
          <button type="button" className={btn} onClick={() => downloadText('field_wavelet.txt', waveletText({ name: 'Field wavelet', dtMs: cmp.dtMs, samples: cmp.average, source: `average of the tie wavelets of ${cmp.names.join(', ')}` }))} data-testid="qi-ties-download-field">Download the field wavelet (text)</button>
        </div>
      ) : <p className={muted}>The wavelet comparison needs at least two wells whose ties stored their wavelet.</p>}
      {issues.length > 0 && canWrite && <button type="button" className={btn} onClick={addIssues} data-testid="qi-ties-issues">{`Add ${issues.length} tie issue${issues.length === 1 ? '' : 's'} to the register`}</button>}
    </section>
  );
}
