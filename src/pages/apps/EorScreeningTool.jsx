// EOR Screening (R4, Reservoir-ROADMAP.md; EOR-U1 of the Reservoir upgrade
// round, docs/upgrade/EorScreening-UPGRADE.md). Technical screening on the
// published criteria of Taber, Martin and Seright (1997), Parts 1 and 2:
// shortlisting, not design.
//
// EOR-U1: saved projects with record sharing (saved_eor_screening_projects),
// the Suite unit profile (oilfield / SI, criteria compared in oilfield), a
// source beside every input, intakes by id from Fluid Systems Studio
// (pvt-1), Well Test Analysis Studio (wta-1) and Material Balance Studio
// (mbal-1), and a report on the shared kit.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { FlaskConical, ArrowLeft, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { Card, CardContent } from '@/components/ui/card';
import { RecordSharingBar } from '@/components/recordSharing';
import { supabaseSharingStore } from '@/lib/recordSharing';
import { useProfileSystem } from '@/lib/units/useProfileSystem';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { EorScreeningProvider, useEorScreening } from '@/contexts/EorScreeningContext';
import { EOR_PROFILE_FAMILIES } from '@/utils/eor/units';
import EorInputsPanel from '@/components/eor/EorInputsPanel';
import EorIntakesPanel from '@/components/eor/EorIntakesPanel';
import EorResults from '@/components/eor/EorResults';
import EorReportTab from '@/components/eor/EorReportTab';
import { EOR_SCREEN_CONTRACT } from '@/lib/eorScreenSource';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const TABS = [
  { value: 'screening', label: 'Screening' },
  { value: 'report', label: 'Report' },
];

// One store per page; record sharing of saved_eor_screening_projects (PL5).
const SHARING_STORE = supabaseSharingStore();

const Notifications = () => {
  const { notifications, removeNotification } = useEorScreening();
  if (!notifications?.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm" data-testid="eor-notifications">
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
    currentProjectId, createProject, openProject, deleteProject, savingAvailable, savingReason, screenRecord,
  } = useEorScreening();
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
          confirmDeleteMessage="Delete this EOR Screening project?"
        />
        {!savingAvailable && <p className="text-xs text-pl-warning-text" data-testid="eor-saving-off">{savingReason}</p>}
        {projectRow && (
          <RecordSharingBar
            sharing={sharing}
            label="project"
            onSaveCopy={saveCopy}
            onReload={() => openProject(currentProjectId)}
            fieldLabels={{ project_name: 'name', inputs_data: 'inputs, sources, intakes and report fields' }}
          />
        )}
        {/* EOR-U2-003: what a reader gets from this project by id */}
        <p className="text-[10px] text-pl-muted" data-testid="eor-contract-note">
          {currentProjectId
            ? `Other apps read this saved project by id (contract ${EOR_SCREEN_CONTRACT}, content ${screenRecord?.fingerprint || EMPTY_VALUE}): every input with its source, each method's verdict per criterion and the CO2 MMP check.`
            : `Save the screening as a project so other apps can read it by id (contract ${EOR_SCREEN_CONTRACT}).`}
        </p>
        {projectRow && sharing.ready && !canWrite && (
          <p className="text-xs text-pl-warning-text" data-testid="eor-read-only">
            {sharing.readOnlyReason || 'This project is open read-only.'} Changes you make here are not saved to it.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

function EorScreeningContent() {
  const { inputs, setUnitSystem, isSaving, saveError, lastSaveTime, manualSave } = useEorScreening();
  const [tab, setTab] = useState('screening');
  return (
    <>
      <Helmet>
        <title>EOR Screening - Petrolord Suite</title>
        <meta name="description" content="Screen a reservoir against the published Taber, Martin and Seright (1997) EOR criteria." />
      </Helmet>
      <div className="p-4 md:p-8 h-full flex flex-col">
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
            <Link to="/dashboard/reservoir">
              <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Reservoir Management</Button>
            </Link>
            <Link to="/dashboard/apps/reservoir/eor-screening/help">
              <Button variant="outline" size="sm"><HelpCircle className="w-4 h-4 mr-2" /> Help guide</Button>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <Select value={inputs.unitSystem} onValueChange={setUnitSystem}>
                <SelectTrigger className="h-8 w-[104px] text-xs" aria-label="Display units" data-testid="eor-unit-system" title="Display units of this project (the saved values and the criteria stay in oilfield units)">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oilfield">Oilfield</SelectItem>
                  <SelectItem value="si">SI</SelectItem>
                </SelectContent>
              </Select>
              <StudioAutoSave isSaving={isSaving} saveError={saveError} lastSaveTime={lastSaveTime} onSave={manualSave} />
              <ThemeToggle />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-pl-primary p-3 rounded-xl shrink-0">
              <FlaskConical className="w-8 h-8 text-pl-primary-fg" />
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-bold text-pl-text">EOR Screening</h1>
              <p className="text-pl-muted text-md md:text-lg">
                Technical screening on the published Taber, Martin &amp; Seright (1997) criteria
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-1 border-b border-pl-border" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.value} type="button" role="tab" aria-selected={tab === t.value} data-testid={`eor-tab-${t.value}`}
                onClick={() => setTab(t.value)}
                className={`px-3 py-1.5 text-sm -mb-px border-b-2 ${tab === t.value ? 'border-pl-primary text-pl-text font-medium' : 'border-transparent text-pl-muted'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'screening' ? (
          <div className="flex flex-col xl:flex-row gap-6 flex-grow min-h-0">
            <div className="xl:w-80 shrink-0 space-y-4">
              <ProjectCard />
              <EorInputsPanel />
              <EorIntakesPanel />
            </div>
            <EorResults />
          </div>
        ) : (
          <div className="flex flex-col xl:flex-row gap-6">
            <div className="xl:w-80 shrink-0"><ProjectCard /></div>
            <div className="flex-1 min-w-0"><EorReportTab /></div>
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

// Design system rollout batch 3E: the page opens light and follows the
// user's theme choice from the header toggle.
export default function EorScreeningTool({ sharingStore = SHARING_STORE }) {
  const profileSystem = useProfileSystem('eor', EOR_PROFILE_FAMILIES);
  const organizationName = useOrganizationName();
  return (
    <div className="min-h-full" data-testid="eor-theme-scope">
      <EorScreeningProvider sharingStore={sharingStore} profileSystem={profileSystem} organizationName={organizationName}>
        <EorScreeningContent />
      </EorScreeningProvider>
    </div>
  );
}
