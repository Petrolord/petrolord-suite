// ML Workbench (Data & AI D2).
//
// The module's second app and the live counterpart of NextGen course D2
// `mlcore`. Machine learning on well data from the wells registry or an
// uploaded table: missing-log prediction by OLS or ridge regression,
// pay / non-pay classification by logistic regression, both validated by
// holding out whole wells (group split, group k-fold); a random row against
// group split leakage comparison; permutation importance and a learning
// curve; and a predicted curve written back to a well as a new curve with
// its provenance. Every number comes from the vendored engine
// (packages/engines/engines/dataai/ml.js), run in a Web Worker; runs are
// saved per organization.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, BrainCircuit, FileDown, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { MlWorkbenchProvider, useMlWorkbench } from '@/contexts/MlWorkbenchContext';
import DataPanel from '@/components/dataai/ml/DataPanel';
import SpecPanel from '@/components/dataai/ml/SpecPanel';
import ResultsPanel from '@/components/dataai/ml/ResultsPanel';
import DiagnosticsPanel from '@/components/dataai/ml/DiagnosticsPanel';
import WriteBackPanel from '@/components/dataai/ml/WriteBackPanel';
import { ML_WORKBENCH_ROUTE } from '@/utils/dataAi/mlStudy';
import { buildMlCsv, generateMlPdf } from '@/utils/dataAi/mlReport';
import { downloadText } from '@/lib/fullPrecision';

const safeName = (s) => (s || 'ml-run').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'ml-run';

const Workspace = () => {
  const {
    persistence, notifications, removeNotification, addNotification, orgId, table, spec, design, parsed, results, isStale,
  } = useMlWorkbench();
  const [tab, setTab] = useState('model');
  const ev = results.evaluate;
  const canExport = !!(ev && table && !isStale('evaluate') && design && !design.error);
  const runName = persistence.projectName || '';
  const reportArgs = () => ({
    runName, table, spec, design, parsed, evaluation: ev.result.evaluation, final: ev.result.final,
  });

  const exportCsv = () => {
    const csv = buildMlCsv(reportArgs());
    if (!downloadText(`${safeName(runName || table.label)}-ml.csv`, csv)) addNotification('The download could not start in this browser.', 'error');
  };
  const exportPdf = async () => {
    try {
      const doc = await generateMlPdf(reportArgs());
      doc.save(`${safeName(runName || table.label)}-ml.pdf`);
    } catch (e) {
      addNotification(`The PDF could not be made: ${e.message}`, 'error');
    }
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
                <BrainCircuit className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">ML Workbench</h1>
                <p className="text-xs text-slate-400">
                  Regression and logistic classification on well data, validated by holding out whole wells.
                  Every fit, split and score is computed by the Petrolord ML engine.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-52">
                <StudioProjectManager
                  label="Saved ML run"
                  projects={persistence.projects}
                  currentProjectId={persistence.currentProjectId}
                  onCreate={persistence.createProject}
                  onOpen={persistence.openProject}
                  onDelete={persistence.deleteProject}
                  confirmDeleteMessage="Delete this ML run for everyone in your organization? This cannot be undone. Curves it wrote to wells stay."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white" disabled={!canExport} onClick={exportCsv} data-testid="export-csv" title={canExport ? 'Report as CSV, every number at full precision' : 'Fit and validate first'}>
                <FileDown className="mr-1 h-4 w-4" /> CSV
              </Button>
              <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white" disabled={!canExport} onClick={exportPdf} data-testid="export-pdf" title={canExport ? 'Report as PDF' : 'Fit and validate first'}>
                <FileText className="mr-1 h-4 w-4" /> PDF
              </Button>
              <Link to={`${ML_WORKBENCH_ROUTE}/help`} title="Documentation">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                  <BookOpen className="mr-1 h-4 w-4" /> Help guide
                </Button>
              </Link>
            </div>
          </div>
          {orgId ? null : (
            <p className="mt-2 text-xs text-amber-200">
              ML runs are saved to your organization. Without one you can work here, and saving is unavailable.
            </p>
          )}
        </header>

        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          <aside className="w-full overflow-y-auto border-b border-slate-800 bg-slate-900/40 p-4 md:w-1/3 md:border-b-0 md:border-r xl:w-1/4">
            <DataPanel />
          </aside>
          <main className="flex-1 space-y-4 overflow-y-auto p-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex-wrap border border-slate-800 bg-slate-900">
                <TabsTrigger value="model">Model</TabsTrigger>
                <TabsTrigger value="results">Validation results</TabsTrigger>
                <TabsTrigger value="diagnostics">Leakage and diagnostics</TabsTrigger>
                <TabsTrigger value="writeback">Write to a well</TabsTrigger>
              </TabsList>
              <TabsContent value="model" className="mt-4"><SpecPanel /></TabsContent>
              <TabsContent value="results" className="mt-4"><ResultsPanel /></TabsContent>
              <TabsContent value="diagnostics" className="mt-4"><DiagnosticsPanel /></TabsContent>
              <TabsContent value="writeback" className="mt-4"><WriteBackPanel /></TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

const MlWorkbench = ({ createWorker }) => (
  <>
    <Helmet>
      <title>ML Workbench - Petrolord Suite</title>
      <meta
        name="description"
        content="Machine learning on well logs: missing-log prediction by ordinary least squares and ridge regression, pay classification by logistic regression, group split and group k-fold validation by whole wells, ROC AUC, log loss, permutation importance, learning curves and a leakage comparison."
      />
    </Helmet>
    <MlWorkbenchProvider {...(createWorker ? { createWorker } : {})}>
      <Workspace />
    </MlWorkbenchProvider>
  </>
);

export default MlWorkbench;
