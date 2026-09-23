// Data Quality Studio (Data & AI D1).
//
// The module's first app and the live counterpart of NextGen course D1
// `dataqc`. Quality checks on well logs from the wells registry, production
// rows from the Production data spine, or an uploaded table: completeness,
// validity, consistency, uniqueness, univariate and multivariate outliers and
// control charts, with a scorecard and a flag table in which every flag names
// its rule and reason. Every number comes from the vendored engine
// (packages/engines/engines/dataai/quality.js); runs are saved per
// organization.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, FileDown, FileText, Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { DataQualityStudioProvider, useDataQualityStudio } from '@/contexts/DataQualityStudioContext';
import DatasetPanel from '@/components/dataai/quality/DatasetPanel';
import ProfilePanel from '@/components/dataai/quality/ProfilePanel';
import ResultsPanel from '@/components/dataai/quality/ResultsPanel';
import ChartsPanel from '@/components/dataai/quality/ChartsPanel';
import { QC_STUDIO_ROUTE } from '@/utils/dataAi/qcRun';
import { buildReportCsv, generateQcPdf } from '@/utils/dataAi/qcReport';
import { downloadText } from '@/lib/fullPrecision';

const safeName = (s) => (s || 'qc-run').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'qc-run';

const Workspace = () => {
  const {
    persistence, notifications, removeNotification, addNotification, orgId, dataset, profile, run, stale,
  } = useDataQualityStudio();
  const [tab, setTab] = useState('profile');
  const canExport = !!(run && dataset && !stale);
  const runName = persistence.projectName || '';

  const exportCsv = () => {
    const csv = buildReportCsv({ runName, dataset, profile, run });
    if (!downloadText(`${safeName(runName || dataset.label)}-qc.csv`, csv)) addNotification('The download could not start in this browser.', 'error');
  };
  const exportPdf = async () => {
    try {
      const doc = await generateQcPdf({ runName, dataset, profile, run });
      doc.save(`${safeName(runName || dataset.label)}-qc.pdf`);
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
                <Filter className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Data Quality Studio</h1>
                <p className="text-xs text-slate-400">
                  Completeness, validity, consistency, uniqueness, outliers and control charts on logs and production data.
                  Every flag states the rule that raised it.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-52">
                <StudioProjectManager
                  label="Saved QC run"
                  projects={persistence.projects}
                  currentProjectId={persistence.currentProjectId}
                  onCreate={persistence.createProject}
                  onOpen={persistence.openProject}
                  onDelete={persistence.deleteProject}
                  confirmDeleteMessage="Delete this QC run for everyone in your organization? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white" disabled={!canExport} onClick={exportCsv} data-testid="export-csv" title={canExport ? 'QC report as CSV' : 'Run the profile first'}>
                <FileDown className="mr-1 h-4 w-4" /> CSV
              </Button>
              <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white" disabled={!canExport} onClick={exportPdf} data-testid="export-pdf" title={canExport ? 'QC report as PDF' : 'Run the profile first'}>
                <FileText className="mr-1 h-4 w-4" /> PDF
              </Button>
              <Link to={`${QC_STUDIO_ROUTE}/help`} title="Documentation">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                  <BookOpen className="mr-1 h-4 w-4" /> Help guide
                </Button>
              </Link>
            </div>
          </div>
          {orgId ? null : (
            <p className="mt-2 text-xs text-amber-200">
              QC runs are saved to your organization. Without one you can work here, and saving is unavailable.
            </p>
          )}
        </header>

        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          <aside className="w-full overflow-y-auto border-b border-slate-800 bg-slate-900/40 p-4 md:w-1/3 md:border-b-0 md:border-r xl:w-1/4">
            <DatasetPanel />
          </aside>
          <main className="flex-1 space-y-4 overflow-y-auto p-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="border border-slate-800 bg-slate-900">
                <TabsTrigger value="profile">QC profile</TabsTrigger>
                <TabsTrigger value="results">Scorecard and flags</TabsTrigger>
                <TabsTrigger value="charts">Charts</TabsTrigger>
              </TabsList>
              <TabsContent value="profile" className="mt-4"><ProfilePanel /></TabsContent>
              <TabsContent value="results" className="mt-4"><ResultsPanel /></TabsContent>
              <TabsContent value="charts" className="mt-4"><ChartsPanel /></TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

const DataQualityStudio = () => (
  <>
    <Helmet>
      <title>Data Quality Studio - Petrolord Suite</title>
      <meta
        name="description"
        content="Data quality checks on well logs and production data: completeness, range, index and consistency rules, duplicate identifiers, z-score, modified z-score, Tukey, Hampel, Grubbs and Mahalanobis outliers, and individuals, EWMA and CUSUM charts."
      />
    </Helmet>
    <DataQualityStudioProvider>
      <Workspace />
    </DataQualityStudioProvider>
  </>
);

export default DataQualityStudio;
