// Well Spacing Optimizer (Reservoir module; WS-U1 of the Reservoir upgrade
// round, docs/upgrade/WellSpacingOptimizer-UPGRADE.md). Spacing economics at
// a stated recovery factor through the canonical screening NPV
// (calculateEconomics), with drainage geometry, timing and deliverability
// beside each case.
//
// WS-U1: saved projects with record sharing (saved_well_spacing_projects,
// migration file not applied yet), the Suite unit profile (oilfield / SI,
// the engine in oilfield), a source beside every input, intakes by id from
// Fluid Systems Studio (pvt-1), Well Test Analysis Studio (wta-1), Material
// Balance Studio (mbal-1), Decline Curve Analysis (dca-forecast-1) and the
// wells registry, the cases recomputed on every edit, and a report on the
// shared kit.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Target, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AppHeader } from '@/components/ui/app-shell';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { RecordSharingBar } from '@/components/recordSharing';
import { supabaseSharingStore } from '@/lib/recordSharing';
import { useProfileSystem } from '@/lib/units/useProfileSystem';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { WellSpacingProvider, useWellSpacing } from '@/contexts/WellSpacingContext';
import { WS_PROFILE_FAMILIES } from '@/utils/wellspacing/units';
import { generateCSV, generateJSON } from '@/utils/wellSpacingCalculations';
import InputPanel from '@/components/wellspacing/InputPanel';
import IntakesPanel from '@/components/wellspacing/IntakesPanel';
import ResultsPanel from '@/components/wellspacing/ResultsPanel';
import ReportTab from '@/components/wellspacing/ReportTab';

const TABS = [
  { value: 'study', label: 'Study' },
  { value: 'report', label: 'Report' },
];

// One store per page; record sharing of saved_well_spacing_projects (PL5).
const SHARING_STORE = supabaseSharingStore();

const Notifications = () => {
  const { notifications, removeNotification } = useWellSpacing();
  if (!notifications?.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm" data-testid="ws-notifications">
      {notifications.map((n) => (
        <button
          key={n.id} type="button" onClick={() => removeNotification(n.id)}
          className={`block w-full text-left rounded-md border px-3 py-2 text-xs shadow ${n.type === 'error' ? 'border-pl-danger/40 bg-pl-danger-bg text-pl-danger-text' : 'border-pl-border bg-pl-surface text-pl-text'}`}
        >
          {n.message}
        </button>
      ))}
    </div>
  );
};

const ProjectCard = () => {
  const {
    projects, sharedProjects, viewingShared, projectRow, sharing, saveCopy, canWrite,
    currentProjectId, createProject, openProject, deleteProject, savingAvailable, savingReason,
  } = useWellSpacing();
  return (
    <Card className="h-fit">
      <CardContent className="pt-4 space-y-2">
        <StudioProjectManager
          projects={projects}
          sharedProjects={sharedProjects}
          canDelete={!viewingShared}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
          confirmDeleteMessage="Delete this Well Spacing project?"
        />
        {!savingAvailable && <p className="text-xs text-pl-warning-text" data-testid="ws-saving-off">{savingReason}</p>}
        {projectRow && (
          <RecordSharingBar
            sharing={sharing}
            label="project"
            onSaveCopy={saveCopy}
            onReload={() => openProject(currentProjectId)}
            fieldLabels={{ project_name: 'name', inputs_data: 'inputs, sources, intakes and report fields' }}
          />
        )}
        {projectRow && sharing.ready && !canWrite && (
          <p className="text-xs text-pl-warning-text" data-testid="ws-read-only">
            {sharing.readOnlyReason || 'This project is open read-only.'} Changes you make here are not saved to it.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const download = (content, type, name) => {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.URL.revokeObjectURL(url);
};

function WellSpacingContent() {
  const { inputs, results, u, setUnitSystem, isSaving, saveError, lastSaveTime, manualSave } = useWellSpacing();
  const [tab, setTab] = useState('study');
  const downloadCSV = () => results && download(generateCSV(results, u), 'text/csv', 'well_spacing_results.csv');
  const downloadJSON = () => results && download(JSON.stringify(generateJSON(inputs.form, results), null, 2), 'application/json', 'well_spacing_summary.json');
  return (
    <>
      <Helmet>
        <title>Well Spacing Optimizer - Petrolord Suite</title>
        <meta name="description" content="Compare well spacing cases on capex, volume, cost per barrel and NPV at a stated recovery factor, with drainage timing and deliverability." />
      </Helmet>
      <AppHeader
        backTo="/dashboard/reservoir"
        backLabel="Back to Reservoir"
        icon={Target}
        title="Well Spacing Optimizer"
        subtitle="Spacing economics at a stated recovery factor, with drainage timing and deliverability"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Select value={inputs.unitSystem} onValueChange={setUnitSystem}>
              <SelectTrigger className="h-8 w-[104px] text-xs" aria-label="Display units" data-testid="ws-unit-system" title="Display units of this project (the saved values and the engine stay in oilfield units)">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oilfield">Oilfield</SelectItem>
                <SelectItem value="si">SI</SelectItem>
              </SelectContent>
            </Select>
            <StudioAutoSave isSaving={isSaving} saveError={saveError} lastSaveTime={lastSaveTime} onSave={manualSave} />
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/apps/reservoir/well-spacing-optimizer/help">
                <HelpCircle className="w-4 h-4 mr-2" /> Help guide
              </Link>
            </Button>
          </div>
        )}
      />
      <div className="p-4 md:p-8">
        <div className="mb-4 flex gap-1 border-b border-pl-border" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.value} type="button" role="tab" aria-selected={tab === t.value} data-testid={`ws-tab-${t.value}`}
              onClick={() => setTab(t.value)}
              className={`px-3 py-1.5 text-sm -mb-px border-b-2 ${tab === t.value ? 'border-pl-primary text-pl-text font-medium' : 'border-transparent text-pl-muted'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'study' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4 min-w-0">
              <ProjectCard />
              <InputPanel />
              <IntakesPanel />
            </div>
            <div className="lg:col-span-2 min-w-0">
              <ResultsPanel downloadCSV={downloadCSV} downloadJSON={downloadJSON} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 min-w-0"><ProjectCard /></div>
            <div className="lg:col-span-2 min-w-0"><ReportTab /></div>
          </div>
        )}
      </div>
      <Notifications />
    </>
  );
}

const useOrganizationName = () => {
  try { return useAuth()?.organization?.name || ''; } catch { return ''; }
};

// Design system rollout batch 2A (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so it opens light and the header toggle
// switches it to dark per user. The spacing charts keep the white chart
// standard.
export default function WellSpacingOptimizer({ sharingStore = SHARING_STORE }) {
  const profileSystem = useProfileSystem('wellspacing', WS_PROFILE_FAMILIES);
  const organizationName = useOrganizationName();
  return (
    <div className="min-h-screen" data-testid="wso-theme-scope">
      <WellSpacingProvider sharingStore={sharingStore} profileSystem={profileSystem} organizationName={organizationName}>
        <WellSpacingContent />
      </WellSpacingProvider>
    </div>
  );
}
