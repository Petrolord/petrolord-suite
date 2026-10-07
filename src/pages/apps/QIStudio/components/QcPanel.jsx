// Seismic QC in QI Studio (QI programme Q4a / A5, 2026-10-06): a QC job per
// chosen volume on the seismic worker (seismic_qc: spectra and bandwidth per
// time window, signal-to-noise per sampled inline, acquisition footprint on
// RMS maps), the result kept with the project, and its issues offered to the
// issue register. White chart and ChartLogo (suite chart standard).
import React, { useEffect, useRef, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Label, Legend } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import * as qiService from '@/lib/qiService';
import { useQIStudio } from '../QIStudioContext';
import { isStripe, snrText } from '../services/qcRun';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text';
const SERIES = ['#2563eb', '#d97706', '#059669', '#db2777', '#7c3aed'];
const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const LABEL_STYLE = { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize };

function spectrumRows(windows) {
  // one row per frequency, a dB column per window, each relative to its own peak
  const rows = [];
  const n = Math.min(...windows.map((w) => w.spectrum.freqHz.length));
  for (let k = 1; k < n; k++) {
    const row = { f: windows[0].spectrum.freqHz[k] };
    windows.forEach((w, i) => {
      const peak = Math.max(...w.spectrum.amp);
      row[`w${i}`] = peak > 0 && w.spectrum.amp[k] > 0 ? Number((20 * Math.log10(w.spectrum.amp[k] / peak)).toFixed(2)) : null;
    });
    rows.push(row);
  }
  return rows;
}

function QcResult({ record }) {
  const { qc } = record.result;
  const rows = spectrumRows(qc.windows);
  return (
    <div className="space-y-2" data-testid="qi-qc-result">
      <table className="text-xs">
        <thead><tr><th className={th}>Window (ms)</th><th className={th}>Peak (Hz)</th><th className={th}>-6 dB band (Hz)</th><th className={th}>Signal-to-noise</th></tr></thead>
        <tbody className="font-mono tabular-nums">
          {qc.windows.map((w) => (
            <tr key={w.t0Ms}>
              <td className={td}>{`${Math.round(w.t0Ms)} to ${Math.round(w.t1Ms)}`}</td>
              <td className={td}>{w.stats.peakHz.toFixed(1)}</td>
              <td className={td}>{`${w.stats.band6[0].toFixed(1)} to ${w.stats.band6[1].toFixed(1)}`}</td>
              <td className={td}>{snrText(w.snr.median)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bg-white rounded-lg p-3 relative" data-canvas="chart" style={{ height: 300, maxWidth: 640 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={CHART_MARGINS.standard}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="f" type="number" domain={[0, 'dataMax']} tick={AXIS_TICK} tickFormatter={(v) => v.toFixed(0)}>
              <Label value="Frequency (Hz)" position="insideBottom" offset={-5} style={LABEL_STYLE} />
            </XAxis>
            <YAxis domain={[-40, 0]} allowDataOverflow tick={AXIS_TICK}>
              <Label value="Amplitude (dB below peak)" angle={-90} position="insideLeft" style={LABEL_STYLE} />
            </YAxis>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend />
            {qc.windows.map((w, i) => <Line key={w.t0Ms} type="monotone" dataKey={`w${i}`} name={`${Math.round(w.t0Ms)} to ${Math.round(w.t1Ms)} ms`} stroke={SERIES[i % SERIES.length]} dot={false} isAnimationActive={false} connectNulls />)}
          </LineChart>
        </ResponsiveContainer>
        <ChartLogo />
      </div>
      <table className="text-xs">
        <thead><tr><th className={th}>Footprint at (ms)</th><th className={th}>Along crosslines</th><th className={th}>Along inlines</th></tr></thead>
        <tbody>
          {qc.footprints.map((f) => (
            <tr key={f.tMs}>
              <td className={td}>{Math.round(f.tMs)}</td>
              {[f.alongCrossline, f.alongInline].map((v, i) => (
                <td key={i} className={td}>{f.error || !v ? (f.error || 'n/a') : `${isStripe(v) ? 'stripe' : 'none'}: period ${v.period.toFixed(1)}, ${Math.round(v.share * 100)} percent of variance, prominence ${Number.isFinite(v.prominence) ? v.prominence.toFixed(0) : 'n/a'}`}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={muted}>{`Sampled ${qc.sampled.inlines} inlines and ${qc.sampled.tracesPerInline} traces per inline for the spectra; the footprint uses RMS maps around each time.`}</p>
    </div>
  );
}

export default function QcPanel() {
  const { chosenVolumes, project, setQcResult, saveIssue, canWrite, jobs, addNotification } = useQIStudio();
  const client = jobs || qiService;
  const [running, setRunning] = useState({}); // volume id -> {job, error}
  const stops = useRef([]);
  useEffect(() => () => { for (const s of stops.current) s(); }, []);

  const run = async (v) => {
    setRunning((r) => ({ ...r, [v.id]: { job: { status: 'queued', progress: 0 } } }));
    try {
      const jobId = await client.enqueueJob('seismic_qc', { volume_id: v.id });
      const stop = client.watchJob(jobId, (job, err) => {
        if (err) { setRunning((r) => ({ ...r, [v.id]: { error: qiService.friendlyError(err) } })); return; }
        setRunning((r) => ({ ...r, [v.id]: { job } }));
        if (job?.status === 'succeeded' && job.result_refs?.qc) {
          setQcResult(v.id, { jobId, at: job.finished_at || new Date().toISOString(), volumeName: v.name, result: job.result_refs });
        }
      });
      stops.current.push(stop);
    } catch (e) {
      setRunning((r) => ({ ...r, [v.id]: { error: qiService.friendlyError(e) } }));
    }
  };
  const addIssues = (record) => {
    for (const i of record.result.issues || []) saveIssue({ ...i, status: 'open', owner: '' });
    addNotification(`${(record.result.issues || []).length} QC issue${(record.result.issues || []).length === 1 ? '' : 's'} added to the register.`, 'success');
  };

  if (!chosenVolumes.length) return <section className={card}><p className={muted}>Choose seismic volumes on Setup to run QC on them.</p></section>;
  return (
    <section className={card} data-testid="qi-qc">
      <h2 className="text-sm font-semibold text-pl-text">Seismic QC</h2>
      <p className={muted}>Runs on the seismic worker on 12 inlines sampled across the survey: amplitude spectra and the -6 dB band per time window, signal-to-noise from neighbouring traces, and acquisition footprint on RMS amplitude maps of every trace. Server QC runs on your own volumes.</p>
      {chosenVolumes.map((v) => {
        const st = running[v.id];
        const rec = project.qc[v.id];
        const busy = st?.job && qiService.isActive(st.job);
        return (
          <div key={v.id} className="rounded border border-pl-border p-3 space-y-2" data-testid={`qi-qc-${v.id}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-pl-text">{v.name}</span>
              <button type="button" className={btn} onClick={() => run(v)} disabled={busy || !canWrite} data-testid={`qi-qc-run-${v.id}`}>{rec ? 'Run QC again' : 'Run QC on the server'}</button>
              {busy && <span className="text-pl-muted">{`${st.job.status}${st.job.progress ? `, ${Math.round(st.job.progress * 100)} percent` : ''}${st.job.progress_message ? `: ${st.job.progress_message}` : ''}`}</span>}
              {st?.job?.status === 'failed' && <span className="text-pl-danger-text">{st.job.error_message || 'The QC job failed.'}</span>}
              {st?.error && <span className="text-pl-danger-text">{st.error}</span>}
              {rec && <span className="text-pl-muted">{`Last run ${String(rec.at).slice(0, 16).replace('T', ' ')}`}</span>}
              {rec && (rec.result.issues || []).length > 0 && canWrite && <button type="button" className={btn} onClick={() => addIssues(rec)} data-testid={`qi-qc-issues-${v.id}`}>{`Add ${rec.result.issues.length} QC issue${rec.result.issues.length === 1 ? '' : 's'} to the register`}</button>}
            </div>
            {rec && <QcResult record={rec} />}
          </div>
        );
      })}
    </section>
  );
}
