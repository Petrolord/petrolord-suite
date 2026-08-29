// Storage Tank & Venting Designer (Facilities F12,
// Facilities-ROADMAP.md §3 app 8) — a NEW app on the vendored API 650
// shell, API 2000 venting and evaporative-loss engine.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Container } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { TankStudioProvider, useTank } from '@/contexts/TankStudioContext';
import { TankInputs, ShellResults, VentingResults, LossResults } from '@/components/tankstudio/TankPanels';
import TankHelpContent from '@/components/tankstudio/TankHelpGuide';
import { fmt, Row } from '@/components/tankstudio/fields';

const TABS = [
  { value: 'shell', label: 'Shell' },
  { value: 'venting', label: 'Venting' },
  { value: 'losses', label: 'Losses' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const Summary = () => {
  const { capacity, shell, venting, fire, losses } = useTank();
  return (
    <div className="space-y-1">
      {!capacity.error && (
        <>
          <Row label="Nominal capacity" value={`${fmt(capacity.nominalBbl, 0)} bbl`} />
          <Row label="Working capacity" value={`${fmt(capacity.workingBbl, 0)} bbl`} />
        </>
      )}
      {!shell.error && (
        <Row label="Bottom course" value={`${fmt(shell.courses[0].requiredIn, 3)} in`}
          hint={shell.courses[0].governing} />
      )}
      {!venting.error && (
        <Row label="Governing vent case" value={venting.governing} />
      )}
      {!fire.error && (
        <Row label="Fire vent" value={`${fmt(fire.ventScfhAir, 0)} scfh air`} />
      )}
      {!losses.error && (
        <Row label="Losses" value={`${fmt(losses.totalLossTonsYr, 1)} tons/yr`} />
      )}
    </div>
  );
};

const StudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'shell',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
  } = useTank();

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
        <SectionLabel>Tank, venting and losses</SectionLabel>
        <TankInputs />
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
      {activeTab === 'shell' && <ShellResults />}
      {activeTab === 'venting' && <VentingResults />}
      {activeTab === 'losses' && <LossResults />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Storage Tank &amp; Venting Designer | Petrolord Suite</title>
        <meta
          name="description"
          content="API 650 shell course thickness by the one-foot method with the hydrostatic test case computed beside the product case, API 2000 normal venting in both directions with the governing case named, emergency fire venting from the wetted area, and evaporative standing and working losses priced as both product and emissions."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/facilities"
            backTitle="Back to Facilities Engineering"
            icon={Container}
            iconGradientClass="from-sky-600 to-cyan-700"
            title="Storage Tank & Venting Designer"
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
              title="Storage Tank Guide"
              description="Why the water test can govern the shell, why the vacuum case is the one that destroys tanks, and what the loss numbers are actually worth."
              triggerTitle="Storage tank documentation"
            >
              <TankHelpContent />
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

const StorageTankDesigner = () => (
  <TankStudioProvider>
    <StudioContent />
  </TankStudioProvider>
);

export default StorageTankDesigner;
