// Pump Station Designer (Facilities F10, Facilities-ROADMAP.md §3
// app 10) — a NEW app on a fresh slug, the other half of the
// F0-retired Compressor & Pump Pack, which printed its answers as
// literal strings and stays archived.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Gauge } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { PumpStudioProvider, usePump } from '@/contexts/PumpStudioContext';
import {
  PumpInputs, DutyResults, CurveChart, NpshResults,
} from '@/components/pumpstudio/PumpPanels';
import PumpHelpContent from '@/components/pumpstudio/PumpHelpGuide';
import { fmt, Row } from '@/components/pumpstudio/fields';

const TABS = [
  { value: 'duty', label: 'Duty Point' },
  { value: 'suction', label: 'Suction & Changes' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const Summary = () => {
  const { duty, power, npsh, region } = usePump();
  return (
    <div className="space-y-1">
      {duty.error ? (
        <Row label="Duty point" value="none" hint="the curves do not cross" />
      ) : (
        <>
          <Row label="Duty flow" value={`${fmt(duty.qGpm, 0)} gpm`} />
          <Row label="Duty head" value={`${fmt(duty.headFt, 0)} ft`} />
        </>
      )}
      {!power.error && <Row label="Brake power" value={`${fmt(power.brakeHp, 1)} bhp`} />}
      {!npsh.error && npsh.check && (
        <Row label="NPSH margin" value={`${fmt(npsh.check.marginFt, 1)} ft`} hint={npsh.check.severity} />
      )}
      {!region.error && (
        <Row label="Of BEP flow" value={`${fmt(region.percentOfBep, 0)} %`} hint={region.region} />
      )}
    </div>
  );
};

const StudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'duty',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
  } = usePump();

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Study</SectionLabel>
        <StudioProjectManager
          projects={projects}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
        />
      </section>
      <section>
        <SectionLabel>Pump and system</SectionLabel>
        <PumpInputs />
      </section>
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Summary</SectionLabel>
        <Summary />
      </section>
    </div>
  );

  const main = (
    <div className="h-full overflow-y-auto space-y-4">
      {activeTab === 'duty' && (
        <>
          <DutyResults />
          <CurveChart />
        </>
      )}
      {activeTab === 'suction' && <NpshResults />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Pump Station Designer | Petrolord Suite</title>
        <meta
          name="description"
          content="Centrifugal pump selection against the system it actually works into: the duty point solved as the intersection of the pump and system curves, power and motor sizing, NPSH available from the real suction side checked against the customary margin, the operating region relative to best efficiency, Hydraulic Institute viscosity corrections, and what a trim, a speed change or a second pump in parallel really buys."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/facilities"
            backTitle="Back to Facilities Engineering"
            icon={Gauge}
            iconGradientClass="from-emerald-600 to-teal-700"
            title="Pump Station Designer"
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
              title="Pump Selection Guide"
              description="Why a pump has no duty point on its own, why NPSH margin is not the same as adequacy, and why two pumps are not twice one pump."
              triggerTitle="Pump documentation"
            >
              <PumpHelpContent />
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

const PumpStationDesigner = () => (
  <PumpStudioProvider>
    <StudioContent />
  </PumpStudioProvider>
);

export default PumpStationDesigner;
