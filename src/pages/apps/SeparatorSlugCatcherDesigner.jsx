// Separator & Slug Catcher Studio (Facilities F5,
// Facilities-ROADMAP.md §3 app 5) — the rebuilt Separator & Slug
// Catcher Designer on the studio kit, keeping its slug. The physics is
// the vendored API 12J / GPSA vessel-sizing engine.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Container } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { SeparatorStudioProvider, useSeparator } from '@/contexts/SeparatorStudioContext';
import { VesselInputs, VesselResults } from '@/components/separatorstudio/SeparatorPanels';
import { SlugInputs, SlugResults } from '@/components/separatorstudio/SlugCatcherPanels';
import SeparatorHelpContent from '@/components/separatorstudio/SeparatorHelpGuide';
import { fmt, Row } from '@/components/separatorstudio/fields';

const TABS = [
  { value: 'vessel', label: 'Separator' },
  { value: 'slug', label: 'Slug Catcher' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const Summary = () => {
  const { conditions, selected, detail, slug, inputs } = useSeparator();
  const vertical = inputs.vessel.type === 'vertical2';
  return (
    <div className="space-y-1">
      {!conditions.error && (
        <>
          <Row label="z-factor" value={fmt(conditions.z, 4)} />
          <Row label="K used" value={`${fmt(conditions.k, 3)} ft/s`} />
          <Row label="Settling velocity" value={`${fmt(conditions.vTerminalFtS, 3)} ft/s`} />
        </>
      )}
      {!selected.error && (
        <>
          <Row label="Vessel" value={`${fmt(selected.diameterFt, 1)} ft x ${fmt(selected.lengthFt, 1)} ft`}
            hint={vertical ? 'diameter by height' : 'diameter by length'} />
          <Row label="L/D" value={fmt(selected.ldRatio, 2)} />
          {detail?.controlling && <Row label="Set by" value={detail.controlling} />}
        </>
      )}
      {!slug.error && (
        <Row label="Slug catcher"
          value={inputs.slug.mode === 'finger'
            ? `${fmt(slug.fingerLengthFt, 0)} ft x ${inputs.slug.nFingers}`
            : `${fmt(slug.diameterFt, 1)} ft x ${fmt(slug.lengthFt, 1)} ft`} />
      )}
    </div>
  );
};

const StudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'vessel',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
  } = useSeparator();

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
      {activeTab === 'vessel' ? (
        <section>
          <SectionLabel>Vessel and process</SectionLabel>
          <VesselInputs />
        </section>
      ) : (
        <section>
          <SectionLabel>Slug catcher</SectionLabel>
          <SlugInputs />
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
      {activeTab === 'vessel' ? <VesselResults /> : <SlugResults />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Separator &amp; Slug Catcher Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="API 12J and GPSA vessel sizing: Souders-Brown gas capacity with the K derated for pressure, exact circular-segment geometry at the actual liquid level, three-phase sizing that solves both retention times against one vessel and checks whether the droplets can actually cross their layers, the L/D family as a table, and vessel or finger slug catchers."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/facilities"
            backTitle="Back to Facilities Engineering"
            icon={Container}
            iconGradientClass="from-sky-600 to-blue-700"
            title="Separator & Slug Catcher Studio"
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
              title="Separator Sizing Guide"
              description="Which length requirement wins, why the droplet check catches carryover that retention time misses, and where vendor data takes over."
              triggerTitle="Separator documentation"
            >
              <SeparatorHelpContent />
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

const SeparatorSlugCatcherDesigner = () => (
  <SeparatorStudioProvider>
    <StudioContent />
  </SeparatorStudioProvider>
);

export default SeparatorSlugCatcherDesigner;
