// Recovery Factor Estimator on the shared Studio shell
// (docs/scope/RecoveryFactorEstimator-STATUS.md): StudioLayout +
// saved_rf_projects persistence with debounced autosave. RF-U1 (Reservoir
// round, app 10): two tabs (Estimate, Report), record sharing, display
// units from the Suite unit profile, the report on the shared kit.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Percent, Beaker } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { RfEstimatorProvider, useRfEstimator } from '@/contexts/RfEstimatorContext';
import InPlacePanel from '@/components/rfestimator/InPlacePanel';
import MethodPanel from '@/components/rfestimator/MethodPanel';
import RfKpiPanel from '@/components/rfestimator/RfKpiPanel';
import ReservesChartPanel from '@/components/rfestimator/ReservesChartPanel';
import DriveReferencePanel from '@/components/rfestimator/DriveReferencePanel';
import ReportTab from '@/components/rfestimator/ReportTab';
import SendToRcpPanel from '@/components/rfestimator/SendToRcpPanel';
import UncertaintyPanel from '@/components/rfestimator/UncertaintyPanel';
import DcaCheckPanel from '@/components/rfestimator/DcaCheckPanel';
import RecoveryFactorHelpContent from '@/components/reservoir/RecoveryFactorHelpGuide';
import { supabaseSharingStore } from '@/lib/recordSharing';
import { RecordSharingBar } from '@/components/recordSharing';
import { useProfileSystem } from '@/lib/units/useProfileSystem';
import { buildLabel } from '@/lib/platformBuild';
import { RF_PROFILE_FAMILIES } from '@/utils/rfestimator/units';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// one sharing store per page load (the signed-in user's session)
const SHARING_STORE = supabaseSharingStore();

const TABS = [
  { value: 'estimate', label: 'Estimate' },
  { value: 'report', label: 'Report' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-pl-muted uppercase mb-3 tracking-widest">{children}</h3>
);

const RfEstimatorContent = () => {
  const {
    projects, sharedProjects, currentProjectId, createProject, openProject, deleteProject,
    projectRow, sharing, viewingShared, canWrite, saveCopy,
    unitSystem, setUnitSystem, followsProfile,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, loadSample,
  } = useRfEstimator();
  const [activeTab, setActiveTab] = useState('estimate');

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <StudioProjectManager
          projects={projects}
          sharedProjects={sharedProjects}
          canDelete={!viewingShared}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
        />
        {projectRow && (
          <RecordSharingBar
            sharing={sharing}
            label="project"
            className="mt-2"
            onSaveCopy={saveCopy}
            onReload={() => openProject(currentProjectId)}
            fieldLabels={{ project_name: 'name', inputs_data: 'inputs, sources, identification and intakes' }}
          />
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-pl-muted">Display units{followsProfile ? ' (your Suite unit profile)' : ''}</span>
          <Select value={unitSystem} onValueChange={setUnitSystem}>
            <SelectTrigger className="h-8 w-[112px] text-xs" aria-label="Display units" data-testid="rf-unit-system">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oilfield">Oilfield</SelectItem>
              <SelectItem value="si">SI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {projectRow && sharing.ready && !canWrite && (
          <p className="mt-2 text-xs text-pl-warning-text" data-testid="rf-read-only">
            {sharing.readOnlyReason || 'This project is open read-only.'} Changes you make here are not saved to it.
          </p>
        )}
      </section>
      <section>
        <SectionLabel>In-place Volume</SectionLabel>
        <InPlacePanel />
      </section>
      <section>
        <SectionLabel>Method</SectionLabel>
        <MethodPanel />
      </section>
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Recovery Summary</SectionLabel>
        <RfKpiPanel />
      </section>
      <section>
        <SectionLabel>Cross-check</SectionLabel>
        <DcaCheckPanel />
      </section>
      <section>
        <SectionLabel>Send</SectionLabel>
        <SendToRcpPanel />
      </section>
    </div>
  );

  const main = activeTab === 'report' ? <ReportTab /> : (
    <div className="h-full overflow-y-auto space-y-4">
      <ReservesChartPanel />
      <UncertaintyPanel />
      <DriveReferencePanel />
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Recovery Factor Estimator | Petrolord Suite</title>
        <meta name="description" content="Estimate recovery factor from drive-mechanism analogs or correlations and convert OOIP / OGIP into recoverable reserves." />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/reservoir"
            backTitle="Back to Reservoir Management"
            icon={Percent}
            title="Recovery Factor Estimator"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        headerActions={
          <>
            <Button variant="ghost" size="sm" onClick={loadSample} className="h-8 text-xs text-pl-muted hover:text-pl-text">
              <Beaker className="w-3.5 h-3.5 mr-1" /> Sample
            </Button>
            <StudioAutoSave isSaving={isSaving} saveError={saveError} lastSaveTime={lastSaveTime} onSave={manualSave} />
            <div className="h-4 w-[1px] bg-pl-border mx-1"></div>
            <StudioHelp
              title="Recovery Factor Estimator Guide"
              description="How to estimate recovery factor and convert in-place volumes to reserves."
              triggerTitle="Recovery Factor documentation"
            >
              <RecoveryFactorHelpContent />
            </StudioHelp>
          </>
        }
        sidebarLeft={leftPanel}
        sidebarRight={rightPanel}
        main={main}
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </>
  );
};

// Design system rollout batch 2A (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so it opens light and the header toggle
// switches it to dark per user. Charts keep the white chart standard.
export default function RecoveryFactorEstimator({ sharingStore = SHARING_STORE }) {
  const profileSystem = useProfileSystem('rf', RF_PROFILE_FAMILIES);
  return (
    <div data-testid="rf-theme-scope">
      <RfEstimatorProvider sharingStore={sharingStore} profileSystem={profileSystem} build={buildLabel()}>
        <RfEstimatorContent />
      </RfEstimatorProvider>
    </div>
  );
}
