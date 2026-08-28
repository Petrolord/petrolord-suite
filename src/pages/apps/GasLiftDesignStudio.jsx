// Gas Lift Design Studio (Production P4, Production-ROADMAP.md §3 app
// 4) — continuous gas-lift installation design over the validated
// production engines (packages/engines/engines/production) and the
// nodal well model. Studio kit shell; all math is pure functions in
// utils/production/gasLift and the vendored engine; the only
// persistence is saved_gaslift_projects (the design itself) plus an
// optional read-only link to the po_* spine.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Wind } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { GasLiftDesignProvider, useGasLift } from '@/contexts/GasLiftDesignContext';
import WellModelPanel from '@/components/gaslift/WellModelPanel';
import InjectionPanel from '@/components/gaslift/InjectionPanel';
import DesignSettingsPanel from '@/components/gaslift/DesignSettingsPanel';
import SpineLinkPanel from '@/components/gaslift/SpineLinkPanel';
import DesignSummaryPanel from '@/components/gaslift/DesignSummaryPanel';
import PressureDepthChart from '@/components/gaslift/PressureDepthChart';
import ValveSheetPanel from '@/components/gaslift/ValveSheetPanel';
import WarningsPanel from '@/components/gaslift/WarningsPanel';
import UnloadingPanel from '@/components/gaslift/UnloadingPanel';
import InjectionPointPanel from '@/components/gaslift/InjectionPointPanel';
import PerformancePanel from '@/components/gaslift/PerformancePanel';
import GasLiftHelpContent from '@/components/gaslift/GasLiftHelpGuide';

const TABS = [
  { value: 'design', label: 'Valve Design' },
  { value: 'unloading', label: 'Unloading' },
  { value: 'injection', label: 'Injection Point' },
  { value: 'performance', label: 'Performance' },
  { value: 'model', label: 'Well Model' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const GasLiftContent = () => {
  // ?tab= deep link (studio-kit pattern); invalid values fall back.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'design',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, busyMessage,
  } = useGasLift();

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Design</SectionLabel>
        <StudioProjectManager
          projects={projects}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
        />
      </section>
      {activeTab === 'model' ? (
        <>
          <section>
            <SectionLabel>Well Model</SectionLabel>
            <WellModelPanel />
          </section>
          <section>
            <SectionLabel>Production Spine</SectionLabel>
            <SpineLinkPanel />
          </section>
        </>
      ) : (
        <>
          <section>
            <SectionLabel>Injection</SectionLabel>
            <InjectionPanel />
          </section>
          <section>
            <SectionLabel>Spacing and Valves</SectionLabel>
            <DesignSettingsPanel />
          </section>
        </>
      )}
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Design Summary</SectionLabel>
        <DesignSummaryPanel />
      </section>
    </div>
  );

  const main = (
    <div className="h-full overflow-y-auto space-y-4">
      {activeTab === 'design' && (
        <>
          <PressureDepthChart />
          <ValveSheetPanel />
          <WarningsPanel />
        </>
      )}
      {activeTab === 'unloading' && <UnloadingPanel />}
      {activeTab === 'injection' && <InjectionPointPanel />}
      {activeTab === 'performance' && <PerformancePanel />}
      {activeTab === 'model' && (
        <>
          <InjectionPointPanel />
          <WarningsPanel />
        </>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Gas Lift Design Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Design a continuous gas-lift installation: deepest point of injection, top-down valve spacing, dome charges and test-rack settings, the unloading sequence with multipointing checks, and the gas-lift performance curve."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/production"
            backTitle="Back to Production Operations"
            icon={Wind}
            iconGradientClass="from-amber-600 to-orange-600"
            title="Gas Lift Design Studio"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        headerActions={
          <>
            <StudioAutoSave
              isSaving={isSaving} saveError={saveError}
              lastSaveTime={lastSaveTime} onSave={manualSave}
            />
            <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>
            <StudioHelp
              title="Gas Lift Design Studio Guide"
              description="How the injection point, the valve spacing and the unloading sequence are worked out."
              triggerTitle="Gas lift documentation"
            >
              <GasLiftHelpContent />
            </StudioHelp>
          </>
        }
        sidebarLeft={leftPanel}
        sidebarRight={rightPanel}
        main={main}
        busyMessage={busyMessage}
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </>
  );
};

export default function GasLiftDesignStudio() {
  return (
    <GasLiftDesignProvider>
      <GasLiftContent />
    </GasLiftDesignProvider>
  );
}
