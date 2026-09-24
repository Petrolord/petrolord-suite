// Electrofacies Studio (Data & AI D3).
//
// The module's third app and the live counterpart of NextGen course D3
// `facies`. Electrofacies from well logs in the wells registry or an
// uploaded table: principal components (scree, loadings, score crossplot),
// k-means with the elbow and the silhouette, agglomerative clustering (Ward,
// complete, average), and kNN and a CART tree trained on core facies and
// scored on wells held out whole; clusters matched to the core with the
// matching mode stated and the adjusted Rand index; facies against depth per
// well; and a facies log written back to a well with its provenance. Every
// number comes from the vendored engine
// (packages/engines/engines/dataai/cluster.js), run in a Web Worker; runs
// are saved per organization.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, FileDown, Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { ElectrofaciesProvider, useElectrofacies } from '@/contexts/ElectrofaciesContext';
import DataPanel from '@/components/dataai/facies/DataPanel';
import SpecPanel from '@/components/dataai/facies/SpecPanel';
import PcaPanel from '@/components/dataai/facies/PcaPanel';
import ClusterPanel from '@/components/dataai/facies/ClusterPanel';
import SupervisedPanel from '@/components/dataai/facies/SupervisedPanel';
import TracksPanel from '@/components/dataai/facies/TracksPanel';
import WriteBackPanel from '@/components/dataai/facies/WriteBackPanel';
import { BusyBar } from '@/components/dataai/facies/common';
import { Note } from '@/components/dataai/quality/shared';
import { ELECTROFACIES_ROUTE } from '@/utils/dataAi/faciesStudy';
import { buildFaciesCsv } from '@/utils/dataAi/faciesReport';
import { downloadText } from '@/lib/fullPrecision';

const safeName = (s) => (s || 'facies-run').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'facies-run';

const SavedNote = () => {
  const { savedSummary, dataChanged } = useElectrofacies();
  if (!savedSummary) return null;
  return (
    <div className="space-y-1">
      <Note testId="saved-summary">
        This run was saved with {savedSummary.rows?.toLocaleString('en-US')} rows on {(savedSummary.features || []).join(', ')}.
        Its results are recomputed by the engine when you run each method again.
      </Note>
      {dataChanged ? <Note tone="warn" testId="data-changed">The data read now differs from the data this run was saved with (the fingerprints differ), so reruns can give other results.</Note> : null}
    </div>
  );
};

const Workspace = () => {
  const {
    persistence, notifications, removeNotification, addNotification, orgId, table, design, parsed, results, isStale,
  } = useElectrofacies();
  const [tab, setTab] = useState('logs');
  const fresh = Object.fromEntries(Object.entries(results).filter(([k]) => !isStale(k)));
  const canExport = !!(table && design && !design.error && Object.keys(fresh).length);
  const runName = persistence.projectName || '';

  const exportCsv = () => {
    const csv = buildFaciesCsv({
      runName, table, design, parsed, results: fresh,
    });
    if (!downloadText(`${safeName(runName || table.label)}-facies.csv`, csv)) addNotification('The download could not start in this browser.', 'error');
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
                <Layers className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Electrofacies Studio</h1>
                <p className="text-xs text-slate-400">
                  Principal components, k-means, agglomerative clustering, kNN and CART on well logs, compared with core facies.
                  Every number is computed by the Petrolord clustering engine.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-52">
                <StudioProjectManager
                  label="Saved facies run"
                  projects={persistence.projects}
                  currentProjectId={persistence.currentProjectId}
                  onCreate={persistence.createProject}
                  onOpen={persistence.openProject}
                  onDelete={persistence.deleteProject}
                  confirmDeleteMessage="Delete this facies run for everyone in your organization? This cannot be undone. Facies logs it wrote to wells stay."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white" disabled={!canExport} onClick={exportCsv} data-testid="export-csv" title={canExport ? 'Report as CSV, every number at full precision' : 'Run a method first'}>
                <FileDown className="mr-1 h-4 w-4" /> CSV
              </Button>
              <Link to={`${ELECTROFACIES_ROUTE}/help`} title="Documentation">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                  <BookOpen className="mr-1 h-4 w-4" /> Help guide
                </Button>
              </Link>
            </div>
          </div>
          {orgId ? null : (
            <p className="mt-2 text-xs text-amber-200">
              Facies runs are saved to your organization. Without one you can work here, and saving is unavailable.
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
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex-wrap border border-slate-800 bg-slate-900">
                <TabsTrigger value="logs">Logs and core</TabsTrigger>
                <TabsTrigger value="pca">PCA</TabsTrigger>
                <TabsTrigger value="clusters">Clustering</TabsTrigger>
                <TabsTrigger value="supervised">kNN and CART</TabsTrigger>
                <TabsTrigger value="tracks">Depth tracks</TabsTrigger>
                <TabsTrigger value="writeback">Write to a well</TabsTrigger>
              </TabsList>
              <TabsContent value="logs" className="mt-4"><SpecPanel /></TabsContent>
              <TabsContent value="pca" className="mt-4"><PcaPanel /></TabsContent>
              <TabsContent value="clusters" className="mt-4"><ClusterPanel /></TabsContent>
              <TabsContent value="supervised" className="mt-4"><SupervisedPanel /></TabsContent>
              <TabsContent value="tracks" className="mt-4"><TracksPanel /></TabsContent>
              <TabsContent value="writeback" className="mt-4"><WriteBackPanel /></TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

const ElectrofaciesStudio = ({ createWorker }) => (
  <>
    <Helmet>
      <title>Electrofacies Studio - Petrolord Suite</title>
      <meta
        name="description"
        content="Electrofacies from well logs: principal component analysis, k-means with the elbow and silhouette, agglomerative clustering with Ward, complete or average linkage, kNN and CART classification trained on core facies and scored on held-out wells, matching to core facies with the adjusted Rand index, depth tracks and a facies log written back to the well."
      />
    </Helmet>
    <ElectrofaciesProvider {...(createWorker ? { createWorker } : {})}>
      <Workspace />
    </ElectrofaciesProvider>
  </>
);

export default ElectrofaciesStudio;
