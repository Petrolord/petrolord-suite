// QI Studio (QI programme Q1 / A4, 2026-10-06): the Package 1 deliverable of a
// quantitative interpretation study (the SOW's data audit and feasibility),
// on the Suite's shared records: the wells registry, Seismolord's volumes and
// Rock Physics Studio's work. Setup, data inventory, usability matrix, issue
// register, feasibility per target, and the report on the shared Report Kit.
// It opens on a Seismolord or Rock Physics Studio licence (App.jsx); saved
// projects need saved_qi_studio_projects (migration 20261006140000).
import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ClipboardCheck, HelpCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AppHeader } from '@/components/ui/app-shell';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { RecordSharingBar } from '@/components/recordSharing';
import { supabaseSharingStore } from '@/lib/recordSharing';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { QIStudioProvider, useQIStudio } from './QIStudioContext';
import { makeRegistryBackend } from './services/registryBackend';
import { exportQIStudioPdf, reportModel } from './services/report';
import { SetupPanel, InventoryPanel, UsabilityPanel, IssuesPanel, FeasibilityPanel } from './components/Panels';
import QcPanel from './components/QcPanel';
import TiesPanel from './components/TiesPanel';
import InversionPanel from './components/InversionPanel';
import PropertiesPanel from './components/PropertiesPanel';

const TABS = [
  { value: 'setup', label: 'Setup' },
  { value: 'inventory', label: 'Data inventory' },
  { value: 'usability', label: 'Usability' },
  { value: 'qc', label: 'Seismic QC' },
  { value: 'ties', label: 'Well ties' },
  { value: 'inversion', label: 'Inversion' },
  { value: 'properties', label: 'Properties' },
  { value: 'issues', label: 'Issues' },
  { value: 'feasibility', label: 'Feasibility' },
  { value: 'report', label: 'Report' },
];
const SHARING_STORE = supabaseSharingStore();
const REGISTRY = makeRegistryBackend();

function ProjectCard() {
  const {
    projects, sharedProjects, viewingShared, projectRow, sharing, saveCopy, canWrite,
    currentProjectId, createProject, openProject, deleteProject, savingAvailable, savingReason,
  } = useQIStudio();
  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <StudioProjectManager
          projects={projects}
          sharedProjects={sharedProjects}
          canDelete={!viewingShared}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
          confirmDeleteMessage="Delete this QI Studio project?"
        />
        {!savingAvailable && <p className="text-xs text-pl-warning-text" data-testid="qi-saving-off">{savingReason}</p>}
        {projectRow && (
          <RecordSharingBar
            sharing={sharing}
            label="project"
            onSaveCopy={saveCopy}
            onReload={() => openProject(currentProjectId)}
            fieldLabels={{ project_name: 'name', inputs_data: 'wells, targets, inventory, issues and feasibility' }}
          />
        )}
        {projectRow && sharing.ready && !canWrite && (
          <p className="text-xs text-pl-warning-text">{sharing.readOnlyReason || 'This project is open read-only.'} Changes you make here are not saved to it.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ReportTab({ organizationName }) {
  const ctx = useQIStudio();
  const [busy, setBusy] = useState(false);
  const model = useMemo(() => reportModel({ ...ctx, organizationName }), [ctx, organizationName]);
  const download = async () => {
    setBusy(true);
    const ok = await exportQIStudioPdf({ ...ctx, organizationName });
    setBusy(false);
    if (!ok) ctx.addNotification('The report could not be built.', 'error');
  };
  return (
    <section className="rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3" data-testid="qi-report">
      <h2 className="text-sm font-semibold text-pl-text">QI data audit and feasibility report</h2>
      <p className="text-xs text-pl-muted">The Package 1 deliverable: the data inventory, the usability matrix and its reasons, the issue register and the feasibility verdict for each target, with the assumptions behind them.</p>
      <p className="text-xs text-pl-text" data-testid="qi-report-summary">{model.summary}</p>
      <Button size="sm" onClick={download} disabled={busy} data-testid="qi-report-download"><Download className="w-4 h-4 mr-2" />{busy ? 'Building' : 'Download the report (PDF)'}</Button>
    </section>
  );
}

function Notifications() {
  const { notifications, removeNotification } = useQIStudio();
  if (!notifications?.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((n) => (
        <button key={n.id} type="button" onClick={() => removeNotification(n.id)}
          className={`block w-full text-left rounded-md border px-3 py-2 text-xs shadow ${n.type === 'error' ? 'border-pl-danger/40 bg-pl-danger-bg text-pl-danger-text' : 'border-pl-border bg-pl-surface text-pl-text'}`}>
          {n.message}
        </button>
      ))}
    </div>
  );
}

function QIStudioContent({ organizationName }) {
  const { isSaving, saveError, lastSaveTime, manualSave } = useQIStudio();
  const [tab, setTab] = useState('setup');
  return (
    <>
      <Helmet>
        <title>QI Studio - Petrolord Suite</title>
        <meta name="description" content="The data audit and feasibility of a quantitative interpretation study: inventory, usability matrix, issue register and feasibility per target." />
      </Helmet>
      <AppHeader
        backTo="/dashboard/geoscience"
        backLabel="Back to Geoscience"
        icon={ClipboardCheck}
        title="QI Studio"
        subtitle="Data audit and feasibility for a quantitative interpretation study"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <StudioAutoSave isSaving={isSaving} saveError={saveError} lastSaveTime={lastSaveTime} onSave={manualSave} />
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/apps/geoscience/qi-studio/help"><HelpCircle className="w-4 h-4 mr-2" /> Help guide</Link>
            </Button>
          </div>
        )}
      />
      <div className="p-4 md:p-6 space-y-4">
        <ProjectCard />
        <div className="flex gap-1 border-b border-pl-border" role="tablist">
          {TABS.map((t) => (
            <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} data-testid={`qi-tab-${t.value}`}
              onClick={() => setTab(t.value)}
              className={`px-3 py-1.5 text-sm -mb-px border-b-2 ${tab === t.value ? 'border-pl-primary text-pl-text font-medium' : 'border-transparent text-pl-muted'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'setup' && <SetupPanel />}
        {tab === 'inventory' && <InventoryPanel />}
        {tab === 'usability' && <UsabilityPanel />}
        {tab === 'qc' && <QcPanel />}
        {tab === 'ties' && <TiesPanel />}
        {tab === 'inversion' && <InversionPanel />}
        {tab === 'properties' && <PropertiesPanel />}
        {tab === 'issues' && <IssuesPanel />}
        {tab === 'feasibility' && <FeasibilityPanel />}
        {tab === 'report' && <ReportTab organizationName={organizationName} />}
      </div>
      <Notifications />
    </>
  );
}

const useOrganizationName = () => {
  try { return useAuth()?.organization?.name || ''; } catch { return ''; }
};

export default function QIStudio({ backend = REGISTRY, sharingStore = SHARING_STORE }) {
  const organizationName = useOrganizationName();
  return (
    <div className="min-h-screen" data-testid="qi-theme-scope">
      <QIStudioProvider backend={backend} sharingStore={sharingStore}>
        <QIStudioContent organizationName={organizationName} />
      </QIStudioProvider>
    </div>
  );
}
