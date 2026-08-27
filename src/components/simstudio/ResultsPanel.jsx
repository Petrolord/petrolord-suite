// Results tab: pick a complete run, chart its field vectors (small
// multiples) and per-well vectors (multi-line) on the white chart
// standard, download the CSV. Everything comes from the worker's
// summary.json — nothing is recomputed client-side.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Download, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useSimStudio } from '@/contexts/SimStudioContext';
import { downloadBlob } from '@/lib/simService';
import {
  availableFieldVectors, availableWellVectors, fieldSeries, wellSeries,
  wellSeriesKeys, hasObservedField, VECTOR_META,
} from '@/components/simstudio/resultAdapters';

const LINE_COLORS = ['#166534', '#1d4ed8', '#b45309', '#b91c1c', '#7c3aed', '#0e7490', '#be185d', '#4d7c0f'];

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize },
};

// Observed-history overlays ("observed" / "<well> obs") draw dashed in
// the same hue family as their simulated twin — the history-match view.
const isObserved = (key) => key === 'observed' || key.endsWith(' obs');
const twinIndex = (key, keys) => {
  const twin = key === 'observed' ? 'value' : key.slice(0, -4);
  const idx = keys.filter((k) => !isObserved(k)).indexOf(twin);
  return idx >= 0 ? idx : 0;
};

const VectorChart = ({ title, unit, rows, seriesKeys }) => (
  <Card className="bg-slate-900 border-slate-800">
    <CardHeader className="pb-1"><CardTitle className="text-sm">{title} <span className="text-slate-500 font-normal">({unit})</span></CardTitle></CardHeader>
    <CardContent className="p-0">
      <ChartFrame height={220}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="day" type="number" {...axisProps}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: 'days', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis {...axisProps} tickFormatter={(v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : `${v}`)} width={56} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => `day ${Number(v).toFixed(0)}`} />
          {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
          {seriesKeys.map((key, i) => {
            const observed = isObserved(key);
            const colorIdx = observed ? twinIndex(key, seriesKeys) : seriesKeys.filter((k) => !isObserved(k)).indexOf(key);
            return (
              <Line key={key} dataKey={key} dot={false} isAnimationActive={false}
                name={key === 'value' ? title.split(' ')[0] : key === 'observed' ? 'observed' : key}
                stroke={LINE_COLORS[colorIdx % LINE_COLORS.length]}
                strokeWidth={observed ? 1.5 : 2}
                strokeDasharray={observed ? '5 4' : undefined}
                strokeOpacity={observed ? 0.75 : 1}
                connectNulls />
            );
          })}
        </LineChart>
      </ChartFrame>
    </CardContent>
  </Card>
);

const ResultsPanel = () => {
  const { activeCase, runs, summary, summaryRunId, loadResults, addNotification } = useSimStudio();
  const completeRuns = useMemo(() => runs.filter((r) => r.status === 'complete' && r.result_path), [runs]);
  const selectedRun = completeRuns.find((r) => r.id === summaryRunId) || null;

  const downloadCsv = async () => {
    if (!selectedRun) return;
    try {
      const blob = await downloadBlob(selectedRun.result_path.replace(/summary\.json$/, 'summary.csv'));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeCase?.name || 'simulation'}-summary.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      addNotification('CSV download failed', 'error');
    }
  };

  if (!activeCase) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-sm text-slate-500">
          Open a case to see its results.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Results</CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={summaryRunId || ''}
              onChange={(e) => {
                const run = completeRuns.find((r) => r.id === e.target.value);
                if (run) loadResults(run);
              }}
              className="h-7 rounded-md bg-slate-800 border border-slate-700 px-2 text-xs"
              data-testid="results-run-select">
              <option value="" disabled>{completeRuns.length ? 'Pick a completed run…' : 'No completed runs yet'}</option>
              {completeRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.queued_at).toLocaleString()} — {r.report_steps ?? '?'} steps
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!selectedRun} onClick={downloadCsv}>
              <Download className="w-3 h-3 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        {summary && (
          <CardContent className="pt-0 text-[11px] text-slate-500">
            {summary.opm_version} · start {summary.start_date?.slice(0, 10)} · {summary.days?.length} report steps
            · deck sha {String(summary.deck_sha256 || '').slice(0, 12)}
          </CardContent>
        )}
      </Card>

      {!summary ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="py-12 text-center text-sm text-slate-500">
            <BarChart3 className="w-6 h-6 mx-auto mb-2 opacity-60" />
            {completeRuns.length
              ? 'Pick a completed run above to chart its summary vectors.'
              : 'Run a simulation first — completed runs appear here with field and well charts.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {availableFieldVectors(summary).map((key) => (
            <VectorChart key={key}
              title={`${key} — ${VECTOR_META[key]?.label || key}`}
              unit={VECTOR_META[key]?.unit || ''}
              rows={fieldSeries(summary, key)}
              seriesKeys={hasObservedField(summary, key) ? ['value', 'observed'] : ['value']} />
          ))}
          {availableWellVectors(summary).map((base) => (
            <VectorChart key={base}
              title={`${base} — ${VECTOR_META[base]?.label || base} by well`}
              unit={VECTOR_META[base]?.unit || ''}
              rows={wellSeries(summary, base)}
              seriesKeys={wellSeriesKeys(summary, base)} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ResultsPanel;
