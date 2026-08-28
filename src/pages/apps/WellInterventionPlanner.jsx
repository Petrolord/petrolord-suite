// Well Intervention Planner (Production P12,
// Production-ROADMAP.md app 12) — the last app in the module.
//
// Three questions in the order they come in: what is wrong with this
// well, which treatments could address THAT, and what is the one you
// pick actually worth. The order is the point, because the second
// question is decided by the first.
//
// The diagnostic and the skin relations are the vendored production
// engine; the derivative is the well test module's validated Bourdet;
// the uplift is the validated nodal chain; the money is the Suite's
// canonical screening economics. Nothing here is a second
// implementation of anything.
//
// It absorbs the archived Stimulation Candidate, Water/Gas Shutoff,
// Workover Planner and Rigless Intervention shells.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { InterventionPlannerProvider, useIntervention } from '@/contexts/InterventionPlannerContext';
import WellPanel from '@/components/intervention/WellPanel';
import SpineLinkPanel from '@/components/intervention/SpineLinkPanel';
import DiagnosticPanel from '@/components/intervention/DiagnosticPanel';
import ScreeningPanel from '@/components/intervention/ScreeningPanel';
import UpliftPanel from '@/components/intervention/UpliftPanel';
import SummaryPanel from '@/components/intervention/SummaryPanel';
import InterventionHelpContent from '@/components/intervention/InterventionHelpGuide';

const TABS = [
  { value: 'diagnosis', label: 'Diagnosis' },
  { value: 'screening', label: 'Screening' },
  { value: 'value', label: 'Value' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const InterventionContent = () => {
  // ?tab= deep link (studio-kit pattern); invalid values fall back.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'diagnosis',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, busyMessage,
  } = useIntervention();

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Plan</SectionLabel>
        <StudioProjectManager
          projects={projects}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
        />
      </section>
      <section>
        <SectionLabel>Production Spine</SectionLabel>
        <SpineLinkPanel />
      </section>
      <section>
        <SectionLabel>Well and Treatment</SectionLabel>
        <WellPanel />
      </section>
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
      {activeTab === 'diagnosis' && <DiagnosticPanel />}
      {activeTab === 'screening' && (
        <>
          <ScreeningPanel />
          <DiagnosticPanel />
        </>
      )}
      {activeTab === 'value' && (
        <>
          <UpliftPanel />
          <ScreeningPanel />
        </>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Well Intervention Planner | Petrolord Suite</title>
        <meta
          name="description"
          content="Diagnose what is wrong with a well from its own production history, screen the treatments against that diagnosis rather than against a checklist, and size the survivors by solving the well before and after. A water shutoff is ruled out on a coning well with the reason, because the cone re-forms above whatever is plugged. Uplift is a nodal re-solve, so the tubing takes back part of what the inflow gained, and the economics are the Suite's canonical screening engine with a decline that has to be stated."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/production"
            backTitle="Back to Production Operations"
            icon={Wrench}
            iconGradientClass="from-amber-600 to-orange-700"
            title="Well Intervention Planner"
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
              title="Well Intervention Guide"
              description="Why the diagnosis has to come first, and what it rules out."
              triggerTitle="Intervention documentation"
            >
              <InterventionHelpContent />
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

export default function WellInterventionPlanner() {
  return (
    <InterventionPlannerProvider>
      <InterventionContent />
    </InterventionPlannerProvider>
  );
}
