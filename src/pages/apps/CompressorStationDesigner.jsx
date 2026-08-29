// Compressor Station Designer (Facilities F9,
// Facilities-ROADMAP.md §3 app 9) — a NEW app on a fresh slug. The
// F0-retired Compressor & Pump Pack printed its answers as literal
// strings and stays archived; this is the GPSA Ch.13 method it
// pretended to be, on the vendored compression engine.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Wind } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { CompressorStudioProvider, useCompressor } from '@/contexts/CompressorStudioContext';
import {
  DutyInputs, TrainResults, ScreenResults, SweepChart,
} from '@/components/compressorstudio/CompressorPanels';
import CompressorHelpContent from '@/components/compressorstudio/CompressorHelpGuide';
import { fmt, Row } from '@/components/compressorstudio/fields';

const TABS = [
  { value: 'train', label: 'Staging & Power' },
  { value: 'machine', label: 'Machine & Fuel' },
  { value: 'sweep', label: 'Pressure Sweep' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const Summary = () => {
  const { train, screen, fuel, acfm } = useCompressor();
  if (train.error) return null;
  return (
    <div className="space-y-1">
      <Row label="Stages" value={String(train.stages.length)} hint={`set by ${train.governedBy}`} />
      <Row label="Ratio per stage" value={fmt(train.ratioPerStage, 2)} />
      <Row label="Brake power" value={`${fmt(train.totalBrakeHp, 0)} bhp`} />
      <Row label="Final discharge" value={`${fmt(train.finalDischargeF, 0)} F`} />
      <Row label="Interstage cooling" value={`${fmt(train.totalCoolingMMBtuHr, 2)} MMBtu/hr`} />
      <Row label="Inlet volume" value={`${fmt(acfm, 0)} acfm`} />
      {!screen.error && <Row label="Machine" value={screen.recommendation} />}
      {!fuel.error && <Row label="Driver fuel" value={`${fmt(fuel.fuelMMscfd, 3)} MMscfd`} />}
    </div>
  );
};

const StudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'train',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
  } = useCompressor();

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
        <SectionLabel>Duty and machine</SectionLabel>
        <DutyInputs />
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
      {activeTab === 'train' && <TrainResults />}
      {activeTab === 'machine' && <ScreenResults />}
      {activeTab === 'sweep' && <SweepChart />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Compressor Station Designer | Petrolord Suite</title>
        <meta
          name="description"
          content="Gas compression sizing to the GPSA method: stage count from both the ratio rule and the discharge-temperature limit with the governing one named, polytropic head and power with the exponent derived from the polytropic efficiency, compressibility averaged across each stage, interstage cooling duty, reciprocating against centrifugal screening on the published criteria, and driver fuel taken out of the stream being compressed."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/facilities"
            backTitle="Back to Facilities Engineering"
            icon={Wind}
            iconGradientClass="from-violet-600 to-purple-700"
            title="Compressor Station Designer"
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
              title="Compressor Sizing Guide"
              description="What really sets the stage count, why polytropic is not isentropic, and what the machine screen can and cannot settle."
              triggerTitle="Compressor documentation"
            >
              <CompressorHelpContent />
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

const CompressorStationDesigner = () => (
  <CompressorStudioProvider>
    <StudioContent />
  </CompressorStudioProvider>
);

export default CompressorStationDesigner;
