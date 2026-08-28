// ESP Design Studio (Production P5, Production-ROADMAP.md §3 app 5) —
// electrical submersible pump sizing over the validated production
// engines (packages/engines/engines/production) and the nodal well
// model. Studio kit shell; all math is pure functions in
// utils/production/esp and the vendored engine; the only persistence is
// saved_esp_projects (the design itself) plus an optional read-only
// link to the po_* spine.
//
// It also absorbs the ESP Performance Monitor tile as the Diagnostics
// tab, so a running installation is read against the same stage curve
// the design was sized on.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Waves } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { EspDesignProvider, useEsp } from '@/contexts/EspDesignContext';
import WellModelPanel from '@/components/esp/WellModelPanel';
import DutyPanel from '@/components/esp/DutyPanel';
import PumpPanel from '@/components/esp/PumpPanel';
import MotorCablePanel from '@/components/esp/MotorCablePanel';
import SpineLinkPanel from '@/components/esp/SpineLinkPanel';
import DesignSummaryPanel from '@/components/esp/DesignSummaryPanel';
import TdhPanel from '@/components/esp/TdhPanel';
import GasHandlingPanel from '@/components/esp/GasHandlingPanel';
import PumpCurveChart from '@/components/esp/PumpCurveChart';
import StageDetailPanel from '@/components/esp/StageDetailPanel';
import SystemCurvePanel from '@/components/esp/SystemCurvePanel';
import ElectricalPanel from '@/components/esp/ElectricalPanel';
import DiagnosticsPanel from '@/components/esp/DiagnosticsPanel';
import EspWarningsPanel from '@/components/esp/WarningsPanel';
import EspHelpContent from '@/components/esp/EspHelpGuide';

const TABS = [
  { value: 'design', label: 'Design' },
  { value: 'pump', label: 'Pump Curve' },
  { value: 'performance', label: 'Performance' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'diagnostics', label: 'Diagnostics' },
  { value: 'model', label: 'Well Model' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const EspContent = () => {
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
  } = useEsp();

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
      {activeTab === 'electrical' && (
        <section>
          <SectionLabel>Motor and Cable</SectionLabel>
          <MotorCablePanel />
        </section>
      )}
      {activeTab !== 'model' && activeTab !== 'electrical' && (
        <>
          <section>
            <SectionLabel>Duty</SectionLabel>
            <DutyPanel />
          </section>
          <section>
            <SectionLabel>Pump</SectionLabel>
            <PumpPanel />
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
          <TdhPanel />
          <GasHandlingPanel />
          <EspWarningsPanel />
        </>
      )}
      {activeTab === 'pump' && (
        <>
          <PumpCurveChart />
          <StageDetailPanel />
          <EspWarningsPanel />
        </>
      )}
      {activeTab === 'performance' && <SystemCurvePanel />}
      {activeTab === 'electrical' && <ElectricalPanel />}
      {activeTab === 'diagnostics' && <DiagnosticsPanel />}
      {activeTab === 'model' && (
        <>
          <TdhPanel />
          <EspWarningsPanel />
        </>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>ESP Design Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Size an electrical submersible pump on validated engines: total dynamic head from the inflow and a real flowing traverse, staging against vendor pump curves, affinity laws for variable speed, gas handling at the intake, motor and cable selection, and diagnostics for a running installation."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/production"
            backTitle="Back to Production Operations"
            icon={Waves}
            iconGradientClass="from-sky-600 to-blue-700"
            title="ESP Design Studio"
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
              title="ESP Design Studio Guide"
              description="How the head, the staging, the gas handling and the electrical side are worked out."
              triggerTitle="ESP documentation"
            >
              <EspHelpContent />
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

export default function EspDesignStudio() {
  return (
    <EspDesignProvider>
      <EspContent />
    </EspDesignProvider>
  );
}
