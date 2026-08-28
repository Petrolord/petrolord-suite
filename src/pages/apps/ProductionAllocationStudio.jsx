// Production Allocation Studio (Production P3, Production-ROADMAP.md
// §3 app 3) — back-allocation of metered facility totals across the
// wells on the P1 po_* spine, with well-test QC and meter-to-ledger
// reconciliation. Studio kit shell; all math is pure functions in
// utils/production/allocation; all persistence goes through
// lib/productionSpine (shared data) and saved_allocation_projects
// (analysis state).
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Scale } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import {
  ProductionAllocationProvider, useAllocation,
} from '@/contexts/ProductionAllocationContext';
import FieldPanel from '@/components/allocation/FieldPanel';
import SettingsPanel from '@/components/allocation/SettingsPanel';
import QcSettingsPanel from '@/components/allocation/QcSettingsPanel';
import TotalsPanel from '@/components/allocation/TotalsPanel';
import TestQcPanel from '@/components/allocation/TestQcPanel';
import NodalCheckPanel from '@/components/allocation/NodalCheckPanel';
import AllocationResultsPanel from '@/components/allocation/AllocationResultsPanel';
import FactorChartPanel from '@/components/allocation/FactorChartPanel';
import DiagnosticsPanel from '@/components/allocation/DiagnosticsPanel';
import ImbalancePanel from '@/components/allocation/ImbalancePanel';
import FactorsPanel from '@/components/allocation/FactorsPanel';
import SummaryPanel from '@/components/allocation/SummaryPanel';
import AllocationHelpContent from '@/components/allocation/AllocationHelpGuide';

const TABS = [
  { value: 'allocation', label: 'Allocation' },
  { value: 'tests', label: 'Test QC' },
  { value: 'reconciliation', label: 'Reconciliation' },
  { value: 'factors', label: 'Factors' },
  { value: 'data', label: 'Data' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const AllocationContent = () => {
  // ?tab= deep link (studio-kit pattern); invalid values fall back.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'allocation',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, loadingField, busyMessage,
  } = useAllocation();

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
        <SectionLabel>Field</SectionLabel>
        <FieldPanel />
      </section>
      {activeTab === 'tests' ? (
        <section>
          <SectionLabel>Test QC Thresholds</SectionLabel>
          <QcSettingsPanel />
        </section>
      ) : (
        <section>
          <SectionLabel>Allocation Basis</SectionLabel>
          <SettingsPanel />
        </section>
      )}
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Period Summary</SectionLabel>
        <SummaryPanel />
      </section>
    </div>
  );

  const main = (
    <div className="h-full overflow-y-auto space-y-4">
      {activeTab === 'allocation' && (
        <>
          <AllocationResultsPanel />
          <FactorChartPanel />
          <DiagnosticsPanel />
        </>
      )}
      {activeTab === 'tests' && (
        <>
          <TestQcPanel />
          <NodalCheckPanel />
        </>
      )}
      {activeTab === 'reconciliation' && <ImbalancePanel />}
      {activeTab === 'factors' && <FactorsPanel />}
      {activeTab === 'data' && <TotalsPanel />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Production Allocation Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Back-allocate metered facility totals across wells by well test and uptime, QC the tests behind the split, reconcile the meter against the ledger, and write monthly allocation factors."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/production"
            backTitle="Back to Production Operations"
            icon={Scale}
            iconGradientClass="from-sky-600 to-indigo-600"
            title="Production Allocation Studio"
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
              title="Production Allocation Studio Guide"
              description="How to back-allocate a metered total across your wells and check the result."
              triggerTitle="Allocation documentation"
            >
              <AllocationHelpContent />
            </StudioHelp>
          </>
        }
        sidebarLeft={leftPanel}
        sidebarRight={rightPanel}
        main={main}
        busyMessage={busyMessage || (loadingField ? 'Loading field data...' : null)}
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </>
  );
};

export default function ProductionAllocationStudio() {
  return (
    <ProductionAllocationProvider>
      <AllocationContent />
    </ProductionAllocationProvider>
  );
}
