// Production Forecasting ML Workbench (Data & AI D4).
//
// The module's fourth app and the live counterpart of NextGen course D4
// `forecastml`. Production series per well from an uploaded table or the
// Production data spine; simple exponential smoothing, Holt's linear trend
// and the damped trend fitted or with parameters held; the Arps decline
// baseline; residual bootstrap P90, P50 and P10; a rolling-origin backtest
// ranked by MASE; and the same backtest across every well of a field. Every
// number comes from the vendored engine
// (packages/engines/engines/dataai/forecast.js), run in a Web Worker; runs
// are saved per organization with their spec, seed and engine commit.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, FileDown, TrendingDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { ForecastingProvider, useForecasting } from '@/contexts/ForecastingContext';
import DataPanel from '@/components/dataai/forecast/DataPanel';
import FitPanel from '@/components/dataai/forecast/FitPanel';
import BacktestPanel from '@/components/dataai/forecast/BacktestPanel';
import FieldPanel from '@/components/dataai/forecast/FieldPanel';
import { BusyBar, WellPicker } from '@/components/dataai/forecast/common';
import { Note } from '@/components/dataai/quality/shared';
import { FORECASTING_ROUTE } from '@/utils/dataAi/forecastStudy';
import { buildForecastCsv } from '@/utils/dataAi/forecastReport';
import { ENGINE_COMMIT } from '@/utils/dataAi/forecastWorkflows';
import { downloadText } from '@/lib/fullPrecision';

const safeName = (s) => (s || 'forecast-run').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'forecast-run';

const SavedNote = () => {
  const { savedSummary, savedEngine, dataChanged } = useForecasting();
  if (!savedSummary) return null;
  return (
    <div className="space-y-1">
      <Note testId="saved-summary">
        This run was saved with {savedSummary.wells} well{savedSummary.wells === 1 ? '' : 's'} and {savedSummary.steps?.toLocaleString('en-US')} steps
        on {savedSummary.engine}. Its results are recomputed by the engine when you run each part again; with the same
        series, settings and seed they are the same numbers.
      </Note>
      {savedEngine?.commit && savedEngine.commit !== ENGINE_COMMIT ? (
        <Note tone="warn" testId="engine-changed">This run was saved on engine {savedEngine.commit.slice(0, 7)}; this build runs {ENGINE_COMMIT.slice(0, 7)}, so reruns can differ.</Note>
      ) : null}
      {dataChanged ? <Note tone="warn" testId="data-changed">The series read now differs from the series this run was saved with (the fingerprints differ), so reruns can give other results.</Note> : null}
    </div>
  );
};

const Workspace = () => {
  const {
    persistence, notifications, removeNotification, addNotification, orgId, table, spec, results, isStale,
  } = useForecasting();
  const [tab, setTab] = useState('fit');
  const fresh = Object.fromEntries(Object.entries(results).filter(([k]) => !isStale(k)));
  const canExport = !!(table && Object.keys(fresh).length);
  const runName = persistence.projectName || '';

  const exportCsv = () => {
    const csv = buildForecastCsv({
      runName, table, spec, results: fresh,
    });
    if (!downloadText(`${safeName(runName || table.label)}-forecast.csv`, csv)) addNotification('The download could not start in this browser.', 'error');
  };

  return (
    <>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="flex h-full flex-col bg-slate-950 text-white">
        <header className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
          <Link to="/dashboard/data-ai">
            <Button variant="ghost" size="sm" className="mb-2 pl-0 text-slate-400 hover:text-white">
              <ArrowLeft className="mr-2 h-4 w-4" /> Data &amp; AI
            </Button>
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 p-2 shadow-lg">
                <TrendingDown className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Production Forecasting ML Workbench</h1>
                <p className="text-xs text-slate-400">
                  Exponential smoothing (simple, Holt&apos;s linear trend, damped trend) against the Arps decline, with bootstrap
                  intervals and rolling-origin backtests. Every number is computed by the Petrolord forecasting engine.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-52">
                <StudioProjectManager
                  label="Saved forecast run"
                  projects={persistence.projects}
                  currentProjectId={persistence.currentProjectId}
                  onCreate={persistence.createProject}
                  onOpen={persistence.openProject}
                  onDelete={persistence.deleteProject}
                  confirmDeleteMessage="Delete this forecast run for everyone in your organization? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white" disabled={!canExport} onClick={exportCsv} data-testid="export-csv" title={canExport ? 'Report as CSV, every number at full precision' : 'Run a part first'}>
                <FileDown className="mr-1 h-4 w-4" /> CSV
              </Button>
              <Link to={`${FORECASTING_ROUTE}/help`} title="Documentation">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                  <BookOpen className="mr-1 h-4 w-4" /> Help guide
                </Button>
              </Link>
            </div>
          </div>
          {orgId ? null : (
            <p className="mt-2 text-xs text-amber-200">
              Forecast runs are saved to your organization. Without one you can work here, and saving is unavailable.
            </p>
          )}
        </header>

        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          <aside className="w-full overflow-y-auto border-b border-slate-800 bg-slate-900/40 p-4 md:w-1/3 md:border-b-0 md:border-r xl:w-1/4">
            <DataPanel />
          </aside>
          <main className="flex-1 space-y-4 overflow-y-auto p-4">
            <SavedNote />
            <BusyBar />
            <WellPicker />
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex-wrap border border-slate-800 bg-slate-900">
                <TabsTrigger value="fit">Fit and forecast</TabsTrigger>
                <TabsTrigger value="backtest">Backtest</TabsTrigger>
                <TabsTrigger value="field">Field comparison</TabsTrigger>
              </TabsList>
              <TabsContent value="fit" className="mt-4"><FitPanel /></TabsContent>
              <TabsContent value="backtest" className="mt-4"><BacktestPanel /></TabsContent>
              <TabsContent value="field" className="mt-4"><FieldPanel /></TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

const ForecastingMlWorkbench = ({ createWorker }) => (
  <>
    <Helmet>
      <title>Production Forecasting ML Workbench - Petrolord Suite</title>
      <meta
        name="description"
        content="Production forecasting per well: simple exponential smoothing, Holt's linear trend and the damped trend, fitted or with parameters held, against the Arps decline; residual bootstrap P90, P50 and P10; rolling-origin backtests ranked by MASE; and the same backtest across every well of a field."
      />
    </Helmet>
    <ForecastingProvider {...(createWorker ? { createWorker } : {})}>
      <Workspace />
    </ForecastingProvider>
  </>
);

export default ForecastingMlWorkbench;
