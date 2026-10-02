// Well Test Analysis Studio — pressure transient analysis workstation on the
// shared Studio shell. Replaces the retired mock Well Test Analyzer (slug
// well-test-analyzer; the old production route redirects here). Tabs:
// Data | Diagnostics | Match | Specialized | RTA | Report. Engines:
// src/utils/welltest (Stehfest-inverted Laplace models, Bourdet derivative,
// superposition, straight-line analyses, Levenberg-Marquardt auto-fit), all
// oracle- and literature-validated (tools/validation/welltest).
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Activity } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { WellTestStudioProvider, useWellTestStudio } from '@/contexts/WellTestStudioContext';
import DataPanel from '@/components/welltest/DataPanel';
import DataResults from '@/components/welltest/DataResults';
import DiagnosticsPanel from '@/components/welltest/DiagnosticsPanel';
import DiagnosticsResults from '@/components/welltest/DiagnosticsResults';
import MatchPanel from '@/components/welltest/MatchPanel';
import MatchResults from '@/components/welltest/MatchResults';
import SpecializedPanel from '@/components/welltest/SpecializedPanel';
import SpecializedResults from '@/components/welltest/SpecializedResults';
import RtaPanel from '@/components/welltest/RtaPanel';
import RtaResults from '@/components/welltest/RtaResults';
import ReportPanel from '@/components/welltest/ReportPanel';
import ReportResults from '@/components/welltest/ReportResults';
import DiagnosticsRail from '@/components/welltest/DiagnosticsRail';
import WTSHelpContent from '@/components/welltest/WTSHelpContent';
import { pvtIntakeFromBackbone } from '@/utils/welltest/reportModel';

const TABS = [
  { value: 'data', label: 'Data' },
  { value: 'diagnostics', label: 'Diagnostics' },
  { value: 'match', label: 'Match' },
  { value: 'specialized', label: 'Specialized' },
  { value: 'rta', label: 'RTA' },
  { value: 'report', label: 'Report' },
];

const WellTestStudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'data',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, addNotification,
    setReservoirField, isFitting, setPvtIntake,
  } = useWellTestStudio();

  // PVT intake from Fluid Systems Studio (navigate-state handoff, the
  // Pipeline Sizer contract): backbone carries bo_at_pb and mu_o_at_pb.
  const location = useLocation();
  const intakeDone = useRef(false);
  useEffect(() => {
    const fluid = location.state?.fluidStudioData;
    if (!fluid || intakeDone.current) return;
    intakeDone.current = true;
    // the handoff also says how the values were computed; the report's
    // Source column prints that (reviewer round 2026-10-02)
    const intake = pvtIntakeFromBackbone(fluid);
    if (!intake) return;
    for (const [key, value] of Object.entries(intake.patch)) setReservoirField(key, value);
    setPvtIntake(intake.intake);
    addNotification(`Fluid properties received from Fluid Systems Studio: ${intake.applied.join(', ')} applied. Review total compressibility manually.`, 'success');
  }, [location.state, setReservoirField, setPvtIntake, addNotification]);

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <StudioProjectManager
          projects={projects}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
          confirmDeleteMessage="Delete this well test project? The gauge data and interpretation stored with it are removed."
        />
      </section>
      {activeTab === 'data' && <DataPanel />}
      {activeTab === 'diagnostics' && <DiagnosticsPanel />}
      {activeTab === 'match' && <MatchPanel />}
      {activeTab === 'specialized' && <SpecializedPanel />}
      {activeTab === 'rta' && <RtaPanel />}
      {activeTab === 'report' && <ReportPanel />}
    </div>
  );

  const main = (
    <>
      {activeTab === 'data' && <DataResults />}
      {activeTab === 'diagnostics' && <DiagnosticsResults />}
      {activeTab === 'match' && <MatchResults />}
      {activeTab === 'specialized' && <SpecializedResults />}
      {activeTab === 'rta' && <RtaResults />}
      {activeTab === 'report' && <ReportResults />}
    </>
  );

  return (
    <>
      <Helmet>
        <title>Well Test Analysis Studio | Petrolord Suite</title>
        <meta name="description" content="Pressure transient analysis: Bourdet derivative diagnostics, analytical model matching with regression, Horner and MDH analyses." />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/reservoir"
            backTitle="Back to Reservoir Management"
            icon={Activity}
            title="Well Test Analysis Studio"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        headerActions={
          <>
            <StudioAutoSave isSaving={isSaving} saveError={saveError} lastSaveTime={lastSaveTime} onSave={manualSave} />
            <div className="h-4 w-[1px] bg-pl-border mx-1"></div>
            <StudioHelp
              title="Well Test Analysis Studio Guide"
              description="From gauge data to a matched model: diagnostics, regression and straight-line analyses."
              triggerTitle="Well Test Analysis documentation"
            >
              <WTSHelpContent />
            </StudioHelp>
          </>
        }
        sidebarLeft={leftPanel}
        sidebarRight={<DiagnosticsRail activeTab={activeTab} />}
        main={main}
        busyMessage={isFitting ? 'Fitting model to pressure and derivative…' : null}
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </>
  );
};

// Design system rollout batch 1A (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so it opens light and the header toggle
// switches it to dark per user. Charts keep the white chart standard.
export default function WellTestAnalysisStudio() {
  return (
    <div data-testid="wts-theme-scope">
      <WellTestStudioProvider>
        <WellTestStudioContent />
      </WellTestStudioProvider>
    </div>
  );
}
