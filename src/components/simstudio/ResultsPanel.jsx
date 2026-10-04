// Results tab: pick a complete run, chart its field vectors (small
// multiples) and per-well vectors (multi-line) on the white chart
// standard, download the CSV. Everything comes from the worker's
// summary.json — nothing is recomputed client-side.
import React, { useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Download, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useSimStudio } from '@/contexts/SimStudioContext';
import {
  availableFieldVectors, availableWellVectors,
  wellSeriesKeys, hasObservedField, VECTOR_META, summaryStepText,
} from '@/components/simstudio/resultAdapters';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { fieldRows, wellRows, summaryUnitSystem } from '@/utils/simstudio/series';
import { vectorView } from '@/utils/simstudio/simUnits';
import { summarizeDeck } from '@/utils/simstudio/deckSummary';
import { buildResultsCsv } from '@/utils/simstudio/resultsCsv';
import { runStatusLine } from '@/utils/simstudio/runStatus';
import SimSendPanel from '@/components/simstudio/SimSendPanel';

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

// RSIM-T1-002: a vector that stays at noise level (water cut 1.7e-5 on a
// dry model) must read as zero, not as a rising trend on an auto axis, so
// non-negative vectors get a floor under their axis maximum
const AXIS_FLOOR = { fraction: 0.1, frac: 0.1, 'STB/d': 10, 'Mscf/d': 100, STB: 1000, Mscf: 1000, 'sm3/d': 1, '10^3 sm3/d': 1, sm3: 100, '10^3 sm3': 10 };
const niceCeil = (v) => {
  if (!(v > 0)) return v;
  const step = 10 ** Math.floor(Math.log10(v)) / 2;
  return Math.ceil(v / step) * step;
};
const yMaxFor = (unit) => (dataMax) => {
  const floor = AXIS_FLOOR[unit];
  return floor && dataMax < floor ? floor : niceCeil(dataMax);
};
const fmtTick = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  if (a > 0 && a < 1) return `${Number(v.toFixed(a < 0.01 ? 4 : 3))}`;
  return `${Number(v.toFixed(2))}`;
};
// SIM-U1-014 (RL7): the X axis is the calendar (run start plus simulator days)
const isoDay = (t) => (Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '');
const monthTick = (t) => (Number.isFinite(t) ? new Date(t).toISOString().slice(0, 7) : '');

const VectorChart = ({ title, unit, rows, seriesKeys }) => (
  <Card>
    <CardHeader className="pb-1"><CardTitle className="text-sm">{title} <span className="text-pl-muted font-normal">({unit})</span></CardTitle></CardHeader>
    <CardContent className="p-0">
      <ChartFrame height={220}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="t" type="number" scale="time" {...axisProps} domain={['dataMin', 'dataMax']} tickCount={5}
            tickFormatter={monthTick}
            label={{ value: 'date', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis {...axisProps} domain={AXIS_FLOOR[unit] ? [(dataMin) => Math.min(0, dataMin), yMaxFor(unit)] : ['auto', 'auto']} tickFormatter={fmtTick} width={56} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v, p) => `${isoDay(v)} (day ${Number(p?.[0]?.payload?.day ?? 0).toFixed(0)})`} />
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
  const { activeCase, runs, summary, summaryRunId, loadResults, addNotification, system, deckText } = useSimStudio();
  const deckSystem = useMemo(() => (deckText ? summarizeDeck(deckText).unitSystem : null), [deckText]);
  const us = summary ? summaryUnitSystem(summary, deckSystem) : null;
  const opts = { deckSystem: us?.system || 'FIELD', system };
  const completeRuns = useMemo(() => runs.filter((r) => r.status === 'complete' && r.result_path), [runs]);
  const selectedRun = completeRuns.find((r) => r.id === summaryRunId) || null;

  // RSIM-T1-001: open the newest completed run instead of an empty picker
  // (runs are listed newest first); a pick the user made stays put
  const newestComplete = completeRuns[0];
  useEffect(() => {
    if (!summaryRunId && newestComplete) loadResults(newestComplete);
  }, [summaryRunId, newestComplete, loadResults]);

  // SIM-U1-009: the CSV is built here from the run's summary in the display
  // units, with a units row and provenance lines (the worker's CSV had neither)
  const downloadCsv = async () => {
    if (!selectedRun || !summary) return;
    try {
      const blob = new Blob([buildResultsCsv({ summary, run: selectedRun, caseRow: activeCase, system, deckSystem })], { type: 'text/csv' });
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
      <Card>
        <CardContent className="py-10 text-center text-sm text-pl-muted">
          Open a case to see its results.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Results</CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={summaryRunId || ''}
              onChange={(e) => {
                const run = completeRuns.find((r) => r.id === e.target.value);
                if (run) loadResults(run);
              }}
              className="h-7 rounded-md border border-pl-border-strong bg-pl-surface px-2 text-xs text-pl-text"
              data-testid="results-run-select">
              <option value="" disabled>{completeRuns.length ? 'Pick a completed run…' : 'No completed runs yet'}</option>
              {completeRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.queued_at).toLocaleString()}, {r.report_steps ?? EMPTY_VALUE} steps
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!selectedRun} onClick={downloadCsv}>
              <Download className="w-3 h-3 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        {summary && (
          <CardContent className="pt-0 text-[11px] text-pl-muted space-y-1">
            <div>
              OPM Flow {summary.opm_version}, start {summary.start_date?.slice(0, 10)},{' '}
              {/* H13: the run's own counts, never the length of the plotted series */}
              <span data-testid="sim-step-count">{summaryStepText(summary)}</span>
              , deck SHA-256 {String(summary.deck_sha256 || '').slice(0, 12)}
            </div>
            <div data-testid="sim-units-basis">Deck units {us.system} ({us.basis}); shown in {system === 'si' ? 'SI' : 'oilfield'} units.</div>
            <div data-testid="sim-run-status">{runStatusLine(summary)}</div>
          </CardContent>
        )}
      </Card>

      {summary && selectedRun && <SimSendPanel run={selectedRun} />}

      {!summary ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-pl-muted">
            <BarChart3 className="w-6 h-6 mx-auto mb-2 opacity-60" />
            {completeRuns.length
              ? 'Pick a completed run above to chart its summary vectors.'
              : 'Run a simulation first. Completed runs appear here with field and well charts.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {availableFieldVectors(summary).map((key) => (
            <VectorChart key={key}
              title={`${key}: ${VECTOR_META[key]?.label || key}`}
              unit={vectorView(key, opts.deckSystem, system).label}
              rows={fieldRows(summary, key, opts)}
              seriesKeys={hasObservedField(summary, key) ? ['value', 'observed'] : ['value']} />
          ))}
          {availableWellVectors(summary).map((base) => (
            <VectorChart key={base}
              title={`${base}: ${VECTOR_META[base]?.label || base} by well`}
              unit={vectorView(base, opts.deckSystem, system).label}
              rows={wellRows(summary, base, opts)}
              seriesKeys={wellSeriesKeys(summary, base)} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ResultsPanel;
