// Relief & Flare Studio (Facilities F2, Facilities-ROADMAP.md §3
// app 5) — the upgraded Relief & Blowdown Sizer on the studio kit,
// keeping its slug (relief-blowdown-sizer) and its table. The physics
// is the vendored API 520/521 engine; this page only wires it.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { ReliefStudioProvider, useRelief } from '@/contexts/ReliefStudioContext';
import PsvInputsPanel from '@/components/reliefstudio/PsvInputsPanel';
import PsvResultsPanel from '@/components/reliefstudio/PsvResultsPanel';
import {
  DrumInputs, DrumResults, RadiationInputs, RadiationResults,
} from '@/components/reliefstudio/DrumRadiationPanels';
import BlowdownPanel, { BlowdownInputs } from '@/components/reliefstudio/BlowdownPanel';
import SummaryPanel from '@/components/reliefstudio/SummaryPanel';
import ReliefHelpContent from '@/components/reliefstudio/ReliefHelpGuide';

const TABS = [
  { value: 'psv', label: 'PSV Sizing' },
  { value: 'drum', label: 'KO Drum' },
  { value: 'radiation', label: 'Radiation' },
  { value: 'blowdown', label: 'Blowdown' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const StudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'psv',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
  } = useRelief();

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
      {activeTab === 'psv' && (
        <section>
          <SectionLabel>Relief scenario</SectionLabel>
          <PsvInputsPanel />
        </section>
      )}
      {activeTab === 'drum' && (
        <section>
          <SectionLabel>Drum service</SectionLabel>
          <DrumInputs />
        </section>
      )}
      {activeTab === 'radiation' && (
        <section>
          <SectionLabel>Flare duty</SectionLabel>
          <RadiationInputs />
        </section>
      )}
      {activeTab === 'blowdown' && (
        <section>
          <SectionLabel>Vessel and orifice</SectionLabel>
          <BlowdownInputs />
        </section>
      )}
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Summary</SectionLabel>
        <SummaryPanel />
      </section>
    </div>
  );

  const main = (
    <div className="h-full overflow-y-auto space-y-4">
      {activeTab === 'psv' && <PsvResultsPanel />}
      {activeTab === 'drum' && <DrumResults />}
      {activeTab === 'radiation' && <RadiationResults />}
      {activeTab === 'blowdown' && <BlowdownPanel />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Relief &amp; Flare Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="API 520 relief valve sizing for gas, liquid, steam and the API 521 fire case chained from vessel geometry to orifice, with knockout drum settling, flare radiation solved both ways, and an adiabatic blowdown march."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/facilities"
            backTitle="Back to Facilities Engineering"
            icon={ShieldAlert}
            iconGradientClass="from-red-600 to-orange-700"
            title="Relief & Flare Studio"
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
              title="Relief & Flare Guide"
              description="Which branch of API 520 you are on, what the fire case actually chains, and what is typed rather than computed."
              triggerTitle="Relief documentation"
            >
              <ReliefHelpContent />
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

const ReliefBlowdownSizer = () => (
  <ReliefStudioProvider>
    <StudioContent />
  </ReliefStudioProvider>
);

export default ReliefBlowdownSizer;
