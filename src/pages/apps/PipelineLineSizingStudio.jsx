// Pipeline & Line Sizing Studio (Facilities F1,
// Facilities-ROADMAP.md §3 app 2) — the flagship that consolidates
// Facility Network Hydraulics, the retired Pipeline Sizer and the
// retired Pipeline Designer into one app.
//
// The physics is the vendored facilities line-hydraulics engine plus
// the Suite's golden-tested Beggs & Brill; this page only wires them
// to the studio kit. Single-line by design: the gathering-network
// solver is Production's (Production-ROADMAP.md §6.2).
import React, { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Ruler } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { LineSizingProvider, useLineSizing } from '@/contexts/LineSizingContext';
import FluidPanel from '@/components/linesizing/FluidPanel';
import PipePanel from '@/components/linesizing/PipePanel';
import SizingPanel from '@/components/linesizing/SizingPanel';
import ProfilePanel from '@/components/linesizing/ProfilePanel';
import WallPanel, { WallInputs } from '@/components/linesizing/WallPanel';
import PiggingPanel, { PiggingInputs } from '@/components/linesizing/PiggingPanel';
import SummaryPanel from '@/components/linesizing/SummaryPanel';
import LineSizingHelpContent from '@/components/linesizing/LineSizingHelpGuide';

const TABS = [
  { value: 'sizing', label: 'Line Sizing' },
  { value: 'profile', label: 'Profile' },
  { value: 'wall', label: 'Wall Thickness' },
  { value: 'pigging', label: 'Pigging' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const StudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'sizing',
  );
  const location = useLocation();
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, applyFluidBackbone,
  } = useLineSizing();

  // Fluid Studio backbone hand-off (restored at F1; the F0 note in
  // FluidStudioResults.jsx points here).
  const backboneApplied = useRef(false);
  useEffect(() => {
    const backbone = location.state?.fluidStudioData;
    if (backbone && !backboneApplied.current) {
      backboneApplied.current = true;
      applyFluidBackbone(backbone);
    }
  }, [location.state, applyFluidBackbone]);

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
      {activeTab === 'wall' ? (
        <section>
          <SectionLabel>Line pipe</SectionLabel>
          <WallInputs />
        </section>
      ) : activeTab === 'pigging' ? (
        <>
          <section>
            <SectionLabel>Pigging</SectionLabel>
            <PiggingInputs />
          </section>
          <section>
            <SectionLabel>Pipe</SectionLabel>
            <PipePanel />
          </section>
        </>
      ) : (
        <>
          <section>
            <SectionLabel>Fluid and duty</SectionLabel>
            <FluidPanel />
          </section>
          <section>
            <SectionLabel>Pipe</SectionLabel>
            <PipePanel />
          </section>
        </>
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
      {activeTab === 'sizing' && <SizingPanel />}
      {activeTab === 'profile' && <ProfilePanel />}
      {activeTab === 'wall' && <WallPanel />}
      {activeTab === 'pigging' && <PiggingPanel />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Pipeline &amp; Line Sizing Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Single-line sizing on validated engines: liquid lines with Colebrook-White friction, gas lines with the published Weymouth, Panhandle and General Flow equations, multiphase lines with Beggs and Brill, the API RP 14E erosional limit, elevation-profile hydraulic gradients, B31.4 and B31.8 wall thickness with MAOP, and pigging estimates fed by the computed holdup."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/facilities"
            backTitle="Back to Facilities Engineering"
            icon={Ruler}
            iconGradientClass="from-blue-600 to-indigo-700"
            title="Pipeline & Line Sizing Studio"
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
              title="Pipeline & Line Sizing Guide"
              description="Which equation fits which line, what the limits mean, and where a single-line tool honestly stops."
              triggerTitle="Line sizing documentation"
            >
              <LineSizingHelpContent />
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

const PipelineLineSizingStudio = () => (
  <LineSizingProvider>
    <StudioContent />
  </LineSizingProvider>
);

export default PipelineLineSizingStudio;
