// Rod Pump Design Studio (Production P6, Production-ROADMAP.md §3 app
// 6) — sucker-rod installation design over the validated production
// engines (packages/engines/engines/production) and the nodal well
// model. Studio kit shell; all math is pure functions in
// utils/production/rodPump and the vendored engine; the only
// persistence is saved_rodpump_projects (the design itself) plus an
// optional read-only link to the po_* spine.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpDown } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { RodPumpDesignProvider, useRodPump } from '@/contexts/RodPumpDesignContext';
import WellModelPanel from '@/components/rodpump/WellModelPanel';
import DutyPanel from '@/components/rodpump/DutyPanel';
import UnitPanel from '@/components/rodpump/UnitPanel';
import RodStringPanel from '@/components/rodpump/RodStringPanel';
import SpineLinkPanel from '@/components/rodpump/SpineLinkPanel';
import DesignSummaryPanel from '@/components/rodpump/DesignSummaryPanel';
import LoadsPanel from '@/components/rodpump/LoadsPanel';
import DynoCardChart from '@/components/rodpump/DynoCardChart';
import TorqueChart from '@/components/rodpump/TorqueChart';
import RodStressPanel from '@/components/rodpump/RodStressPanel';
import SpeedSweepPanel from '@/components/rodpump/SpeedSweepPanel';
import DiagnosticsPanel from '@/components/rodpump/DiagnosticsPanel';
import RodWarningsPanel from '@/components/rodpump/WarningsPanel';
import RodPumpHelpContent from '@/components/rodpump/RodPumpHelpGuide';

const TABS = [
  { value: 'design', label: 'Design' },
  { value: 'cards', label: 'Dyno Cards' },
  { value: 'rods', label: 'Rod String' },
  { value: 'performance', label: 'Performance' },
  { value: 'diagnostics', label: 'Diagnostics' },
  { value: 'model', label: 'Well Model' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const RodPumpContent = () => {
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
  } = useRodPump();

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
      {activeTab === 'model' && (
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
      )}
      {activeTab === 'rods' && (
        <section>
          <SectionLabel>Rod String</SectionLabel>
          <RodStringPanel />
        </section>
      )}
      {activeTab !== 'model' && activeTab !== 'rods' && (
        <>
          <section>
            <SectionLabel>Duty</SectionLabel>
            <DutyPanel />
          </section>
          <section>
            <SectionLabel>Unit and Pump</SectionLabel>
            <UnitPanel />
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
          <LoadsPanel />
          <RodWarningsPanel />
        </>
      )}
      {activeTab === 'cards' && (
        <>
          <DynoCardChart />
          <TorqueChart />
          <RodWarningsPanel />
        </>
      )}
      {activeTab === 'rods' && (
        <>
          <RodStressPanel />
          <RodWarningsPanel />
        </>
      )}
      {activeTab === 'performance' && <SpeedSweepPanel />}
      {activeTab === 'diagnostics' && <DiagnosticsPanel />}
      {activeTab === 'model' && (
        <>
          <LoadsPanel />
          <RodWarningsPanel />
        </>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Rod Pump Design Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Design a sucker-rod installation on validated engines: the damped wave equation for plunger stroke and polished rod loads, exact four-bar unit kinematics and torque, counterbalancing, rod taper against modified Goodman, barrel fillage from the gas that is really there, and dynamometer card diagnosis."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/production"
            backTitle="Back to Production Operations"
            icon={ArrowUpDown}
            iconGradientClass="from-emerald-600 to-teal-700"
            title="Rod Pump Design Studio"
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
              title="Rod Pump Design Studio Guide"
              description="How the plunger stroke, the loads, the torque and the rod stresses are worked out."
              triggerTitle="Rod pump documentation"
            >
              <RodPumpHelpContent />
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

export default function RodPumpDesignStudio() {
  return (
    <RodPumpDesignProvider>
      <RodPumpContent />
    </RodPumpDesignProvider>
  );
}
