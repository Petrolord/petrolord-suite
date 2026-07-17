// Waterflood Design Studio — analytical waterflood design and prediction
// workstation on the shared Studio shell. Replaces the single-page
// Fractional Flow Analyzer (its displacement physics and charts live on in
// the Displacement tab). Tabs: Displacement | Layered Sweep | Pattern
// Forecast | Scenarios. Engines: fractionalFlowCalculations (generalized),
// layeredSweepCalculations, patternForecastCalculations — all golden-tested.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Waves } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { WaterfloodDesignProvider, useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import DisplacementPanel from '@/components/waterflooddesign/DisplacementPanel';
import DisplacementResults from '@/components/waterflooddesign/DisplacementResults';
import LayeredPanel from '@/components/waterflooddesign/LayeredPanel';
import LayeredResults from '@/components/waterflooddesign/LayeredResults';
import PatternPanel from '@/components/waterflooddesign/PatternPanel';
import PatternResults from '@/components/waterflooddesign/PatternResults';
import ScenarioCompare from '@/components/waterflooddesign/ScenarioCompare';
import DiagnosticsRail from '@/components/waterflooddesign/DiagnosticsRail';
import WDSHelpContent from '@/components/waterflooddesign/WDSHelpContent';
import { SectionLabel } from '@/components/waterflooddesign/primitives';

const TABS = [
  { value: 'displacement', label: 'Displacement' },
  { value: 'layered', label: 'Layered Sweep' },
  { value: 'pattern', label: 'Pattern Forecast' },
  { value: 'scenarios', label: 'Scenarios' },
];

const WaterfloodDesignContent = () => {
  const [activeTab, setActiveTab] = useState('displacement');
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
  } = useWaterfloodDesign();

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Project</SectionLabel>
        <StudioProjectManager
          projects={projects}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
        />
      </section>
      {activeTab === 'displacement' && <DisplacementPanel />}
      {activeTab === 'layered' && <LayeredPanel />}
      {activeTab === 'pattern' && <PatternPanel />}
      {activeTab === 'scenarios' && (
        <p className="text-xs text-slate-500">
          Snapshot scenarios from the right rail on any tab; this tab compares them. Inputs stay editable on the
          Displacement, Layered Sweep and Pattern tabs.
        </p>
      )}
    </div>
  );

  const main = (
    <>
      {activeTab === 'displacement' && <DisplacementResults />}
      {activeTab === 'layered' && <LayeredResults />}
      {activeTab === 'pattern' && <PatternResults />}
      {activeTab === 'scenarios' && <ScenarioCompare />}
    </>
  );

  return (
    <>
      <Helmet>
        <title>Waterflood Design Studio | Petrolord Suite</title>
        <meta name="description" content="Buckley-Leverett displacement design, layered sweep and five-spot pattern forecasting." />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/reservoir"
            backTitle="Back to Reservoir Management"
            icon={Waves}
            iconGradientClass="from-cyan-600 to-blue-600"
            title="Waterflood Design Studio"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        headerActions={
          <>
            <StudioAutoSave isSaving={isSaving} saveError={saveError} lastSaveTime={lastSaveTime} onSave={manualSave} />
            <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>
            <StudioHelp
              title="Waterflood Design Studio Guide"
              description="Displacement design, layered conformance, pattern forecasting and scenario comparison."
              triggerTitle="Waterflood Design documentation"
            >
              <WDSHelpContent />
            </StudioHelp>
          </>
        }
        sidebarLeft={leftPanel}
        sidebarRight={<DiagnosticsRail activeTab={activeTab} />}
        main={main}
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </>
  );
};

export default function WaterfloodDesignStudio() {
  return (
    <WaterfloodDesignProvider>
      <WaterfloodDesignContent />
    </WaterfloodDesignProvider>
  );
}
