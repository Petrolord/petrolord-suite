// Control Valve & Choke Sizing (Facilities F11,
// Facilities-ROADMAP.md §3 app 11) — a NEW app on a fresh slug, on the
// vendored ISA 75.01 engine plus the validated RP 14E limit.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Sliders } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { ValveStudioProvider, useValve } from '@/contexts/ValveStudioContext';
import { ServiceInputs, SizingResults, ControlResults } from '@/components/valvestudio/ValvePanels';
import ValveHelpContent from '@/components/valvestudio/ValveHelpGuide';
import { fmt, Row } from '@/components/valvestudio/fields';

const TABS = [
  { value: 'sizing', label: 'Sizing' },
  { value: 'control', label: 'Control & Noise' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const Summary = () => {
  const { cases, authority, travel, isLiquid } = useValve();
  const normal = cases.find((c) => c.label === 'Normal');
  const maxCase = cases.find((c) => c.label === 'Maximum');
  return (
    <div className="space-y-1">
      {normal && !normal.error && (
        <Row label="Cv at normal" value={fmt(normal.cv, 2)} />
      )}
      {maxCase && !maxCase.error && (
        <>
          <Row label="Cv at maximum" value={fmt(maxCase.cv, 2)} />
          <Row label="Choked at maximum" value={maxCase.choked ? 'yes' : 'no'} />
          {isLiquid && <Row label="Regime" value={maxCase.regime} />}
        </>
      )}
      {!authority.error && (
        <Row label="Authority" value={fmt(authority.authority, 2)} hint={authority.verdict} />
      )}
      {!travel.error && (
        <Row label="Travel at normal"
          value={travel.normalTravelPct === null ? 'beyond' : `${fmt(travel.normalTravelPct, 0)} %`} />
      )}
    </div>
  );
};

const StudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'sizing',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
  } = useValve();

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
        <SectionLabel>Service and valve</SectionLabel>
        <ServiceInputs />
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
      {activeTab === 'sizing' && <SizingResults />}
      {activeTab === 'control' && <ControlResults />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Control Valve &amp; Choke Sizing | Petrolord Suite</title>
        <meta
          name="description"
          content="ISA 75.01 control valve sizing with the choking boundary put first: liquid Cv with the allowable pressure drop, cavitation distinguished from flashing, gas sizing with the expansion factor and terminal ratio, valve authority and the characteristic it implies, travel at minimum, normal and maximum flow, an honest aerodynamic noise indication, and the API RP 14E outlet velocity limit."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/facilities"
            backTitle="Back to Facilities Engineering"
            icon={Sliders}
            iconGradientClass="from-rose-600 to-pink-700"
            title="Control Valve & Choke Sizing"
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
              title="Control Valve Guide"
              description="Why the choking boundary comes first, why cavitation is not flashing, and the failure a single Cv number never shows."
              triggerTitle="Control valve documentation"
            >
              <ValveHelpContent />
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

const ControlValveSizing = () => (
  <ValveStudioProvider>
    <StudioContent />
  </ValveStudioProvider>
);

export default ControlValveSizing;
