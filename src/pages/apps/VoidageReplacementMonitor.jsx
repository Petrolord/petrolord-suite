// Voidage Replacement Monitor on the shared Studio shell (V1 of the VRR
// upgrade program, docs/scope/VoidageReplacementMonitor-STATUS.md). This
// closes the W5 kit-adoption queue item from the Waterflood Design Studio
// program: same shell as DCA/WDS, saved_vrr_projects persistence, panels
// split out of the old single-file page. Math unchanged (vrr.js engine).
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Droplets } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { VrrMonitorProvider, useVrrMonitor } from '@/contexts/VrrMonitorContext';
import FvfPanel from '@/components/vrrmonitor/FvfPanel';
import PeriodGridPanel from '@/components/vrrmonitor/PeriodGridPanel';
import VrrChartsPanel from '@/components/vrrmonitor/VrrChartsPanel';
import VrrKpiPanel from '@/components/vrrmonitor/VrrKpiPanel';
import VrrHelpContent from '@/components/reservoir/VrrHelpGuide';

const TABS = [
  { value: 'data', label: 'Data & PVT' },
  { value: 'dashboard', label: 'VRR Dashboard' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const VrrMonitorContent = () => {
  // ?tab= deep link (WDS pattern); invalid values fall back to the default.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'data',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
  } = useVrrMonitor();

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
      <section>
        <SectionLabel>Fluid Properties (Reservoir)</SectionLabel>
        <FvfPanel />
      </section>
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Voidage Summary</SectionLabel>
        <VrrKpiPanel />
      </section>
    </div>
  );

  const main = (
    <div className="h-full overflow-y-auto space-y-4">
      {activeTab === 'data' && <PeriodGridPanel />}
      {activeTab === 'dashboard' && <VrrChartsPanel />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Voidage Replacement Monitor | Petrolord Suite</title>
        <meta name="description" content="Track voidage replacement ratio (instantaneous and cumulative, in reservoir barrels) to confirm produced voidage is being replaced by injection." />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/reservoir"
            backTitle="Back to Reservoir Management"
            icon={Droplets}
            iconGradientClass="from-sky-600 to-cyan-600"
            title="Voidage Replacement Monitor"
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
              title="Voidage Replacement Monitor Guide"
              description="How to track voidage replacement and read the VRR trend."
              triggerTitle="VRR documentation"
            >
              <VrrHelpContent />
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

export default function VoidageReplacementMonitor() {
  return (
    <VrrMonitorProvider>
      <VrrMonitorContent />
    </VrrMonitorProvider>
  );
}
