// Voidage Replacement Monitor on the shared Studio shell (VRR upgrade
// program, docs/scope/VoidageReplacementMonitor-STATUS.md). V1: Studio kit
// + saved_vrr_projects. V2: per-well CSV ledger + rolling VRR/target
// bands. V3: pressure surveys + pressure-dependent PVT + the
// VRR-vs-pressure maintenance-proof tab. V4: patterns and allocation.
// VRR-U1 (docs/upgrade/VoidageReplacementMonitor-UPGRADE.md): the report on
// the shared kit, the pvt-1 intake, units, import doors on the shared
// reader, record sharing.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Droplets } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VrrMonitorProvider, useVrrMonitor } from '@/contexts/VrrMonitorContext';
import FvfPanel from '@/components/vrrmonitor/FvfPanel';
import AnalysisSettingsPanel from '@/components/vrrmonitor/AnalysisSettingsPanel';
import ImportPanel from '@/components/vrrmonitor/ImportPanel';
import PeriodGridPanel from '@/components/vrrmonitor/PeriodGridPanel';
import LedgerSummaryPanel from '@/components/vrrmonitor/LedgerSummaryPanel';
import VrrSendPanel from '@/components/vrrmonitor/VrrSendPanel';
import VrrChartsPanel from '@/components/vrrmonitor/VrrChartsPanel';
import VrrKpiPanel from '@/components/vrrmonitor/VrrKpiPanel';
import PressurePanel from '@/components/vrrmonitor/PressurePanel';
import PressureChartPanel from '@/components/vrrmonitor/PressureChartPanel';
import PatternManagerPanel from '@/components/vrrmonitor/PatternManagerPanel';
import AllocationMatrixEditor from '@/components/vrrmonitor/AllocationMatrixEditor';
import PatternResultsPanel from '@/components/vrrmonitor/PatternResultsPanel';
import VrrReportTab from '@/components/vrrmonitor/VrrReportTab';
import VrrHelpContent from '@/components/reservoir/VrrHelpGuide';
import { supabaseSharingStore } from '@/lib/recordSharing';
import { RecordSharingBar } from '@/components/recordSharing';
import { useProfileSystem } from '@/lib/units/useProfileSystem';
import { VRR_PROFILE_FAMILIES } from '@/utils/vrr/units';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const TABS = [
  { value: 'data', label: 'Data & PVT' },
  { value: 'dashboard', label: 'VRR Dashboard' },
  { value: 'pressure', label: 'Pressure' },
  { value: 'patterns', label: 'Patterns' },
  { value: 'report', label: 'Report' },
];

// One store per page; record sharing of saved_vrr_projects (VRR-U1-012, PL5).
const SHARING_STORE = supabaseSharingStore();

// Design system pilot 5 (docs/scope/DesignSystem.md): the page sits in the
// dashboard scope, so every class here is a theme role.
const SectionLabel = ({ children }) => {
  return (
    <h3 className="text-[11px] font-semibold text-pl-accent-text uppercase mb-3 tracking-widest">{children}</h3>
  );
};

const VrrMonitorContent = () => {
  // ?tab= deep link (WDS pattern); invalid values fall back to the default.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'data',
  );
  const {
    projects, sharedProjects, viewingShared, projectRow, sharing, saveCopy, canWrite,
    currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, isImported, inputs, setUnitSystem,
  } = useVrrMonitor();

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
          confirmDeleteMessage="Delete this VRR project? Material Balance Studio reads its pressure surveys by id and will no longer find it."
        />
        {projectRow && (
          <RecordSharingBar
            sharing={sharing}
            label="project"
            className="mt-2"
            onSaveCopy={saveCopy}
            onReload={() => openProject(currentProjectId)}
            fieldLabels={{ project_name: 'name', inputs_data: 'ledger, surveys, FVFs, patterns and report fields' }}
          />
        )}
        {projectRow && sharing.ready && !canWrite && (
          <p className="mt-2 text-xs text-pl-warning-text" data-testid="vrr-read-only">
            {sharing.readOnlyReason || 'This project is open read-only.'} Changes you make here are not saved to it.
          </p>
        )}
      </section>
      {activeTab === 'pressure' ? (
        <section>
          <SectionLabel>Pressure &amp; PVT Mode</SectionLabel>
          <PressurePanel />
        </section>
      ) : activeTab === 'patterns' ? (
        <section>
          <SectionLabel>Patterns</SectionLabel>
          <PatternManagerPanel />
        </section>
      ) : activeTab === 'report' ? (
        <p className="text-xs text-pl-muted leading-relaxed">
          The report prints the identification, every input with its unit and source, the voidage ledger by period and by
          term, the FVFs of every period, the patterns, the limits of the analysis and the figures. Fill the
          identification and the sources in the main area.
        </p>
      ) : (
        <>
          <section>
            <SectionLabel>Fluid Properties (Reservoir)</SectionLabel>
            <FvfPanel />
          </section>
          <section>
            <SectionLabel>Analysis Settings</SectionLabel>
            <AnalysisSettingsPanel />
          </section>
          {/* WF-U2-004: the ledger to Waterflood Design Studio, read by id */}
          <VrrSendPanel />
        </>
      )}
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Voidage Summary</SectionLabel>
        <VrrKpiPanel />
      </section>
    </div>
  );

  const main = (
    <div className="h-full overflow-y-auto space-y-4">
      {activeTab === 'data' && (
        <>
          <ImportPanel />
          {isImported ? <LedgerSummaryPanel /> : <PeriodGridPanel />}
        </>
      )}
      {activeTab === 'dashboard' && (
        <>
          <VrrChartsPanel />
          {isImported && <LedgerSummaryPanel />}
        </>
      )}
      {activeTab === 'pressure' && <PressureChartPanel />}
      {activeTab === 'patterns' && (
        <>
          {isImported && <AllocationMatrixEditor />}
          <PatternResultsPanel />
        </>
      )}
      {activeTab === 'report' && <VrrReportTab />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Voidage Replacement Monitor | Petrolord Suite</title>
        <meta name="description" content="Track voidage replacement ratio (instantaneous and cumulative, in reservoir barrels) to confirm produced voidage is being replaced by injection." />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/reservoir"
            backTitle="Back to Reservoir Management"
            icon={Droplets}
            iconGradientClass="from-sky-600 to-cyan-600"
            title="Voidage Replacement Monitor"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        headerActions={
          <>
            <Select value={inputs.unitSystem} onValueChange={setUnitSystem}>
              <SelectTrigger className="h-8 w-[104px] text-xs" aria-label="Display units" data-testid="vrr-unit-system" title="Display units of this project (the saved values stay in oilfield units)">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oilfield">Oilfield</SelectItem>
                <SelectItem value="si">SI</SelectItem>
              </SelectContent>
            </Select>
            <StudioAutoSave isSaving={isSaving} saveError={saveError} lastSaveTime={lastSaveTime} onSave={manualSave} />
            <div className="h-4 w-[1px] bg-pl-border mx-1"></div>
            <StudioHelp
              title="Voidage Replacement Monitor Guide"
              description="How to track voidage replacement and read the VRR trend."
              triggerTitle="VRR documentation"
            >
              <VrrHelpContent />
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

const useOrganizationName = () => {
  try { return useAuth()?.organization?.name || ''; } catch { return ''; }
};

export default function VoidageReplacementMonitor({ sharingStore = SHARING_STORE }) {
  const profileSystem = useProfileSystem('vrr', VRR_PROFILE_FAMILIES);
  const organizationName = useOrganizationName();
  return (
    <div data-testid="vrr-theme-scope">
      <VrrMonitorProvider sharingStore={sharingStore} profileSystem={profileSystem} organizationName={organizationName}>
        <VrrMonitorContent />
      </VrrMonitorProvider>
    </div>
  );
}
