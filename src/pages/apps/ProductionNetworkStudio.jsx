// Production Network Studio (Production P11, Production-ROADMAP.md
// app 11) — the wells solved together, against each other, instead of
// one at a time against a wellhead pressure somebody typed in.
//
// The network solver is the vendored production engine; the branch
// relations are the Suite's already-validated nodal traverse and IPR.
// This page wires them to the shared per-well records the whole module
// has been filling in since P6.5.
//
// It absorbs the retired Network Diagram Pro, whose canvas drew a
// network and whose Solve button raised a toast. The topology editor
// here is table-driven and the drawing is generated from it, because a
// gathering system flows one way and so lays itself out; that also
// frees the drawing to carry the answer, which a hand-arranged one
// never could.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Waypoints } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { ProductionNetworkProvider, useProductionNetwork } from '@/contexts/ProductionNetworkContext';
import TopologyPanel from '@/components/prodnetwork/TopologyPanel';
import InspectorPanel from '@/components/prodnetwork/InspectorPanel';
import SchematicPanel from '@/components/prodnetwork/SchematicPanel';
import ResultsPanel from '@/components/prodnetwork/ResultsPanel';
import SweepPanel from '@/components/prodnetwork/SweepPanel';
import SummaryPanel from '@/components/prodnetwork/SummaryPanel';
import NetworkHelpContent from '@/components/prodnetwork/NetworkHelpGuide';

const TABS = [
  { value: 'network', label: 'Network' },
  { value: 'results', label: 'Results' },
  { value: 'sensitivity', label: 'Sensitivity' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const NetworkContent = () => {
  // ?tab= deep link (studio-kit pattern); invalid values fall back.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'network',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, busyMessage,
  } = useProductionNetwork();

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Network</SectionLabel>
        <StudioProjectManager
          projects={projects}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
        />
      </section>
      <section>
        <SectionLabel>Build</SectionLabel>
        <TopologyPanel />
      </section>
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Summary</SectionLabel>
        <SummaryPanel />
      </section>
      <section>
        <SectionLabel>Selected</SectionLabel>
        <InspectorPanel />
      </section>
    </div>
  );

  const main = (
    <div className="h-full overflow-y-auto space-y-4">
      {activeTab === 'network' && (
        <>
          <SchematicPanel />
          <ResultsPanel />
        </>
      )}
      {activeTab === 'results' && (
        <>
          <ResultsPanel />
          <SchematicPanel />
        </>
      )}
      {activeTab === 'sensitivity' && (
        <>
          <SweepPanel />
          <SchematicPanel />
        </>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Production Network Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Solve a gathering system as one system: every well's inflow met against its own tubing, every flowline and trunk on the validated two-phase traverse, and nodal mass balance driven to zero by Newton. Reports what each well makes in the network against what it would make alone through the same lines, so the backpressure the wells put on each other is a number rather than an impression."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/production"
            backTitle="Back to Production Operations"
            icon={Waypoints}
            iconGradientClass="from-sky-600 to-indigo-700"
            title="Production Network Studio"
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
              title="Production Network Guide"
              description="How the wells fight each other, and what that costs in barrels."
              triggerTitle="Production network documentation"
            >
              <NetworkHelpContent />
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

export default function ProductionNetworkStudio() {
  return (
    <ProductionNetworkProvider>
      <NetworkContent />
    </ProductionNetworkProvider>
  );
}
