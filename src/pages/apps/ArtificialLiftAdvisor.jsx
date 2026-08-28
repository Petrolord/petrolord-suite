// Artificial Lift Advisor (Production P9, Production-ROADMAP.md §3 app
// 9) — screening across six methods, and the real design chain run for
// the four this Suite can design, all against one shared well record.
//
// Replaces the Artificial Lift Designer page. P0 made that app
// screening-only after finding its three design tabs silently wrong;
// P4, P5 and P6 rebuilt those designs properly as their own studios,
// and this phase is what puts them back together: not by re-deriving
// anything, but by running all four against one well and reporting
// which ones work.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Scale } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { LiftAdvisorProvider, useLiftAdvisor } from '@/contexts/LiftAdvisorContext';
import DutyPanel from '@/components/liftadvisor/DutyPanel';
import WellModelPanel from '@/components/liftadvisor/WellModelPanel';
import SpineLinkPanel from '@/components/liftadvisor/SpineLinkPanel';
import SummaryPanel from '@/components/liftadvisor/SummaryPanel';
import ComparisonPanel from '@/components/liftadvisor/ComparisonPanel';
import LiftAdvisorHelpContent from '@/components/liftadvisor/LiftAdvisorHelpGuide';

const TABS = [
  { value: 'compare', label: 'Compare' },
  { value: 'model', label: 'Well Model' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const AdvisorContent = () => {
  // ?tab= deep link (studio-kit pattern); invalid values fall back.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'compare',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, busyMessage,
  } = useLiftAdvisor();

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
        <section>
          <SectionLabel>Duty and Facility</SectionLabel>
          <DutyPanel />
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
      <ComparisonPanel />
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Artificial Lift Advisor | Petrolord Suite</title>
        <meta
          name="description"
          content="Which lift method suits a well, answered twice: a screening matrix across gas lift, ESP, rod pump, plunger, progressing cavity and jet pumps, and the real validated design chain run for the four this Suite can design, all against one shared well record."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/production"
            backTitle="Back to Production Operations"
            icon={Scale}
            iconGradientClass="from-violet-600 to-purple-700"
            title="Artificial Lift Advisor"
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
              title="Artificial Lift Advisor Guide"
              description="How the screening and the design pass differ, and which one to believe."
              triggerTitle="Advisor documentation"
            >
              <LiftAdvisorHelpContent />
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

export default function ArtificialLiftAdvisor() {
  return (
    <LiftAdvisorProvider>
      <AdvisorContent />
    </LiftAdvisorProvider>
  );
}
