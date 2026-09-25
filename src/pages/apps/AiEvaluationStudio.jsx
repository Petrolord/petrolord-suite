// AI Evaluation Studio (Data & AI D5).
//
// The module's fifth app and the live counterpart of NextGen course D5
// `appliedai`. Deterministic evaluation of search and question-answering
// systems over a document corpus: BM25 and TF-IDF retrieval with term
// contributions and stated ties; precision, recall, hit, MRR, MAP and nDCG at
// k with a visible relevance threshold; two systems compared by a seeded
// paired bootstrap; answers checked claim by claim against the passages they
// cite; extracted fields scored against labels; Cohen's kappa between
// graders; and calibration with the Brier decomposition. Every number comes
// from the vendored engine (packages/engines/engines/dataai/evaluate.js), run
// in a Web Worker; runs are saved per organization with their settings, seed
// and engine commit. An optional, metered language-model helper can answer
// one query from the retrieved passages; its answer is scored by the same
// deterministic checks and is never graded.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, FileDown, ScanSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { EvaluationProvider, useEvaluation } from '@/contexts/EvaluationContext';
import CorpusPanel from '@/components/dataai/evaluate/CorpusPanel';
import RetrievalPanel from '@/components/dataai/evaluate/RetrievalPanel';
import MetricsPanel from '@/components/dataai/evaluate/MetricsPanel';
import ComparePanel from '@/components/dataai/evaluate/ComparePanel';
import AnswersPanel from '@/components/dataai/evaluate/AnswersPanel';
import ExtractionPanel from '@/components/dataai/evaluate/ExtractionPanel';
import { AgreementPanel, CalibrationPanel } from '@/components/dataai/evaluate/AgreementCalibrationPanels';
import { BusyBar } from '@/components/dataai/evaluate/common';
import { Note } from '@/components/dataai/quality/shared';
import { EVAL_ROUTE } from '@/utils/dataAi/evalStudy';
import { buildEvalCsv } from '@/utils/dataAi/evalReport';
import { ENGINE_COMMIT } from '@/utils/dataAi/evalWorkflows';
import { downloadText } from '@/lib/fullPrecision';

const safeName = (s) => (s || 'evaluation-run').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'evaluation-run';

const SavedNote = () => {
  const {
    savedSummary, savedEngine, dataChanged, reloadError,
  } = useEvaluation();
  return (
    <div className="space-y-1">
      {reloadError ? <Note tone="warn" testId="reload-error">{reloadError}</Note> : null}
      {savedSummary ? (
        <Note testId="saved-summary">
          This run was saved on {savedSummary.dataset} ({savedSummary.passages?.toLocaleString('en-US')} passages, {savedSummary.queries} queries)
          with {savedSummary.engine}. Its results are recomputed by the engine when you run each part again; with the same data,
          settings and seed they are the same numbers.
        </Note>
      ) : null}
      {savedEngine?.commit && savedEngine.commit !== ENGINE_COMMIT ? (
        <Note tone="warn" testId="engine-changed">This run was saved on engine {savedEngine.commit.slice(0, 7)}; this build runs {ENGINE_COMMIT.slice(0, 7)}, so reruns can differ.</Note>
      ) : null}
      {dataChanged ? <Note tone="warn" testId="data-changed">The data loaded now differs from the data this run was saved with (the fingerprints differ), so reruns can give other results.</Note> : null}
    </div>
  );
};

const Workspace = () => {
  const {
    persistence, notifications, removeNotification, addNotification, orgId, dataset, spec, results, isStale,
  } = useEvaluation();
  const [tab, setTab] = useState('corpus');
  const fresh = Object.fromEntries(Object.entries(results).filter(([k]) => !isStale(k)));
  const canExport = !!(dataset && Object.keys(fresh).length);
  const runName = persistence.projectName || '';

  const exportCsv = () => {
    const csv = buildEvalCsv({
      runName, dataset, spec, results: fresh,
    });
    if (!downloadText(`${safeName(runName || dataset.label)}-evaluation.csv`, csv)) addNotification('The download could not start in this browser.', 'error');
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
                <ScanSearch className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">AI Evaluation Studio</h1>
                <p className="text-xs text-slate-400">
                  BM25 and TF-IDF retrieval, ranking metrics, a seeded paired bootstrap between systems, claim-level groundedness,
                  extraction scoring, Cohen&apos;s kappa and calibration. Every number is computed by the Petrolord evaluation engine.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-52">
                <StudioProjectManager
                  label="Saved evaluation run"
                  projects={persistence.projects}
                  currentProjectId={persistence.currentProjectId}
                  onCreate={persistence.createProject}
                  onOpen={persistence.openProject}
                  onDelete={persistence.deleteProject}
                  confirmDeleteMessage="Delete this evaluation run for everyone in your organization? This cannot be undone."
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
              <Link to={`${EVAL_ROUTE}/help`} title="Documentation">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                  <BookOpen className="mr-1 h-4 w-4" /> Help guide
                </Button>
              </Link>
            </div>
          </div>
          {orgId ? null : (
            <p className="mt-2 text-xs text-amber-200">
              Evaluation runs are saved to your organization. Without one you can work here, and saving and the helper are unavailable.
            </p>
          )}
        </header>

        <main className="flex-1 space-y-4 overflow-y-auto p-4">
          <SavedNote />
          <BusyBar />
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto flex-wrap border border-slate-800 bg-slate-900">
              <TabsTrigger value="corpus">Corpus and queries</TabsTrigger>
              <TabsTrigger value="retrieval">Retrieval</TabsTrigger>
              <TabsTrigger value="metrics">Retrieval metrics</TabsTrigger>
              <TabsTrigger value="compare">Compare systems</TabsTrigger>
              <TabsTrigger value="answers">Answers and groundedness</TabsTrigger>
              <TabsTrigger value="extraction">Extraction scoring</TabsTrigger>
              <TabsTrigger value="agreement">Agreement</TabsTrigger>
              <TabsTrigger value="calibration">Calibration</TabsTrigger>
            </TabsList>
            <TabsContent value="corpus" className="mt-4"><CorpusPanel /></TabsContent>
            <TabsContent value="retrieval" className="mt-4"><RetrievalPanel /></TabsContent>
            <TabsContent value="metrics" className="mt-4"><MetricsPanel /></TabsContent>
            <TabsContent value="compare" className="mt-4"><ComparePanel /></TabsContent>
            <TabsContent value="answers" className="mt-4"><AnswersPanel /></TabsContent>
            <TabsContent value="extraction" className="mt-4"><ExtractionPanel /></TabsContent>
            <TabsContent value="agreement" className="mt-4"><AgreementPanel /></TabsContent>
            <TabsContent value="calibration" className="mt-4"><CalibrationPanel /></TabsContent>
          </Tabs>
        </main>
      </div>
    </>
  );
};

const AiEvaluationStudio = ({ createWorker }) => (
  <>
    <Helmet>
      <title>AI Evaluation Studio - Petrolord Suite</title>
      <meta
        name="description"
        content="Deterministic evaluation of search and question-answering systems over oilfield documents: BM25 and TF-IDF retrieval, precision, recall, MRR, MAP and nDCG at k, a seeded paired bootstrap between systems, claim-level groundedness, extraction scoring, Cohen's kappa and calibration with the Brier decomposition."
      />
    </Helmet>
    <EvaluationProvider {...(createWorker ? { createWorker } : {})}>
      <Workspace />
    </EvaluationProvider>
  </>
);

export default AiEvaluationStudio;
