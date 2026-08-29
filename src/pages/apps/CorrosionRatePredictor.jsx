// Corrosion & Integrity Studio (Facilities F6,
// Facilities-ROADMAP.md §3 app 6) — the upgraded Corrosion Rate
// Predictor on the studio kit, keeping its slug. The physics is the
// vendored de Waard-Milliams 1995 engine.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { CorrosionStudioProvider, useCorrosion } from '@/contexts/CorrosionStudioContext';
import {
  ConditionInputs, IntegrityInputs, RateResults, SweepChart, SourResults, IntegrityResults,
} from '@/components/corrosionstudio/CorrosionPanels';
import CorrosionHelpContent from '@/components/corrosionstudio/CorrosionHelpGuide';
import { fmt, Row } from '@/components/corrosionstudio/fields';

const TABS = [
  { value: 'rate', label: 'Corrosion Rate' },
  { value: 'sour', label: 'Sour Service' },
  { value: 'integrity', label: 'Integrity' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const Summary = () => {
  const { result } = useCorrosion();
  if (result.error) return null;
  return (
    <div className="space-y-1">
      <Row label="Rate" value={`${fmt(result.rate.rateMmYr, 3)} mm/yr`} hint={result.category} />
      <Row label="Uninhibited" value={`${fmt(result.rate.uninhibitedMmYr, 3)} mm/yr`} />
      <Row label="Effective inhibition" value={`${fmt(result.rate.effectiveInhibitionPct, 0)} %`} />
      <Row label="Controlled by" value={result.rate.controlling} />
      {!result.shear.error && (
        <Row label="Wall shear" value={`${fmt(result.shear.tauPa, 0)} Pa`} hint={`film risk ${result.shear.filmRisk}`} />
      )}
      <Row label="Sour service" value={result.sour.sour ? `Region ${result.sour.region}` : 'no'} />
      {result.life && !result.life.error && (
        <Row label="Remaining life"
          value={Number.isFinite(result.life.remainingYears) ? `${fmt(result.life.remainingYears, 1)} yr` : 'unbounded'} />
      )}
    </div>
  );
};

const StudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'rate',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
  } = useCorrosion();

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
        <SectionLabel>Conditions</SectionLabel>
        <ConditionInputs />
      </section>
      {activeTab === 'integrity' && (
        <section>
          <SectionLabel>Integrity</SectionLabel>
          <IntegrityInputs />
        </section>
      )}
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
      {activeTab === 'rate' && (
        <>
          <RateResults />
          <SweepChart />
        </>
      )}
      {activeTab === 'sour' && <SourResults />}
      {activeTab === 'integrity' && (
        <>
          <IntegrityResults />
          <SweepChart />
        </>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Corrosion &amp; Integrity Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="CO2 corrosion screening on de Waard-Milliams 1995 in resistance-in-series form, so velocity and line size actually change the answer, with the protective-scale correction, wall shear against inhibitor film survival, inhibitor efficiency separated from availability, MR0175 sour-service regions from H2S and pH, and remaining life against a corrosion allowance."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/facilities"
            backTitle="Back to Facilities Engineering"
            icon={ShieldAlert}
            iconGradientClass="from-amber-600 to-red-700"
            title="Corrosion & Integrity Studio"
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
              title="Corrosion & Integrity Guide"
              description="Why velocity belongs in the model, why hotter is not always worse, and why availability beats efficiency."
              triggerTitle="Corrosion documentation"
            >
              <CorrosionHelpContent />
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

const CorrosionRatePredictor = () => (
  <CorrosionStudioProvider>
    <StudioContent />
  </CorrosionStudioProvider>
);

export default CorrosionRatePredictor;
