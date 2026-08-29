// Heat Exchanger & Cooling Studio (Facilities F4,
// Facilities-ROADMAP.md §3 app 4) — the upgraded Heat Exchanger Sizer
// on the studio kit, keeping its slug (heat-exchanger-sizer) and its
// table. The physics is the vendored heat-transfer engine; this page
// wires it and decomposes the old 573-LOC inline sheet into panels.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Thermometer } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { HeatExchangerProvider, useHeatExchanger } from '@/contexts/HeatExchangerContext';
import {
  StreamInputs, CoefficientInputs, SizingResults,
} from '@/components/heatexchanger/SizingPanels';
import {
  RatingInputs, RatingResults, CoolerInputs, CoolerResults,
} from '@/components/heatexchanger/RatingCoolerPanels';
import HeatExchangerHelpContent from '@/components/heatexchanger/HeatExchangerHelpGuide';
import { fmt, Row } from '@/components/heatexchanger/fields';

const TABS = [
  { value: 'sizing', label: 'Sizing' },
  { value: 'rating', label: 'Rating' },
  { value: 'aircooler', label: 'Air Cooler' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const Summary = () => {
  const { thermal, coefficient, sizing, rating, cooler } = useHeatExchanger();
  return (
    <div className="space-y-1">
      {!thermal.error && (
        <>
          <Row label="Duty" value={`${fmt(thermal.qBtuHr / 1e6, 2)} MMBtu/hr`} />
          <Row label="LMTD" value={`${fmt(thermal.lmtdF, 1)} F`} />
          {thermal.arrangement === 'shell' && (
            <Row label="F" value={thermal.fError ? 'unreachable' : fmt(thermal.f, 3)} />
          )}
        </>
      )}
      {!coefficient.error && (
        <Row label="U dirty" value={`${fmt(coefficient.uDirtyBtuHrFt2F, 0)} Btu/hr ft2 F`} />
      )}
      {!sizing.error && (
        <Row label="Area required" value={`${fmt(sizing.areaFt2, 0)} ft2`} />
      )}
      {!rating.error && (
        <Row label="Rated effectiveness" value={`${fmt(rating.effectiveness * 100, 0)} %`} />
      )}
      {!cooler.error && cooler.hotDay && !cooler.hotDay.error && (
        <Row label="Hot-day capacity" value={`${fmt(cooler.hotDay.dutyFraction * 100, 0)} %`} />
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
  } = useHeatExchanger();

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
      {activeTab === 'sizing' && (
        <>
          <section>
            <SectionLabel>Streams</SectionLabel>
            <StreamInputs />
          </section>
          <section>
            <SectionLabel>Coefficient and bundle</SectionLabel>
            <CoefficientInputs />
          </section>
        </>
      )}
      {activeTab === 'rating' && (
        <>
          <section>
            <SectionLabel>Exchanger</SectionLabel>
            <RatingInputs />
          </section>
          <section>
            <SectionLabel>Streams</SectionLabel>
            <StreamInputs />
          </section>
        </>
      )}
      {activeTab === 'aircooler' && (
        <section>
          <SectionLabel>Air cooler</SectionLabel>
          <CoolerInputs />
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
      {activeTab === 'sizing' && <SizingResults />}
      {activeTab === 'rating' && <RatingResults />}
      {activeTab === 'aircooler' && <CoolerResults />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Heat Exchanger &amp; Cooling Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Shell-and-tube thermal design with the LMTD correction factor computed from its published closed form rather than typed, the overall coefficient assembled from its named resistances, tube-side film by Dittus-Boelter, TEMA-style bundle geometry, effectiveness-NTU rating, and air-cooler sizing with the hot-day capacity derate."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/facilities"
            backTitle="Back to Facilities Engineering"
            icon={Thermometer}
            iconGradientClass="from-orange-600 to-amber-700"
            title="Heat Exchanger & Cooling Studio"
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
              title="Heat Exchanger Guide"
              description="Why F is computed rather than typed, what the controlling resistance tells you, and where the studio refuses to answer."
              triggerTitle="Heat exchanger documentation"
            >
              <HeatExchangerHelpContent />
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

const HeatExchangerSizer = () => (
  <HeatExchangerProvider>
    <StudioContent />
  </HeatExchangerProvider>
);

export default HeatExchangerSizer;
