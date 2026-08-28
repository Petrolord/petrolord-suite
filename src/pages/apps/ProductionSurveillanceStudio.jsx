// Production Surveillance Studio (Production P2, Production-ROADMAP.md
// §3 app 2) — the OFM-class rebuild of the retired surveillance
// dashboard, on the P1 po_* data spine. Studio kit shell; all analytics
// are pure functions in utils/production/surveillance; all persistence
// goes through lib/productionSpine (shared data) and
// saved_surveillance_projects (analysis state).
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Activity } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import {
  ProductionSurveillanceProvider, useSurveillance,
} from '@/contexts/ProductionSurveillanceContext';
import FieldPanel from '@/components/surveillance/FieldPanel';
import ImportPanel from '@/components/surveillance/ImportPanel';
import WellsPanel from '@/components/surveillance/WellsPanel';
import SettingsPanel from '@/components/surveillance/SettingsPanel';
import KpiPanel from '@/components/surveillance/KpiPanel';
import ExceptionsPanel from '@/components/surveillance/ExceptionsPanel';
import TrendsControlsPanel from '@/components/surveillance/TrendsControlsPanel';
import TrendsChartPanel from '@/components/surveillance/TrendsChartPanel';
import DefermentsPanel from '@/components/surveillance/DefermentsPanel';
import DeclineControlsPanel from '@/components/surveillance/DeclineControlsPanel';
import DeclinePanel from '@/components/surveillance/DeclinePanel';
import SurveillanceHelpContent from '@/components/surveillance/SurveillanceHelpGuide';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'trends', label: 'Trends' },
  { value: 'deferments', label: 'Deferments' },
  { value: 'decline', label: 'Decline' },
  { value: 'data', label: 'Data' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const SurveillanceContent = () => {
  // ?tab= deep link (studio-kit pattern); invalid values fall back.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'overview',
  );
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, loadingField, importing,
    setTrendsField,
  } = useSurveillance();

  // Exception rows hand their well to the Trends tab.
  const openWellTrend = (wellId) => {
    setTrendsField('view', 'well');
    setTrendsField('wellId', wellId);
    setActiveTab('trends');
  };

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
      {activeTab === 'trends' && (
        <section>
          <SectionLabel>Trend Controls</SectionLabel>
          <TrendsControlsPanel />
        </section>
      )}
      {activeTab === 'decline' && (
        <section>
          <SectionLabel>Decline Controls</SectionLabel>
          <DeclineControlsPanel />
        </section>
      )}
      {(activeTab === 'overview' || activeTab === 'deferments' || activeTab === 'data') && (
        <section>
          <SectionLabel>Exception Thresholds</SectionLabel>
          <SettingsPanel />
        </section>
      )}
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Field Performance</SectionLabel>
        <KpiPanel />
      </section>
    </div>
  );

  const main = (
    <div className="h-full overflow-y-auto space-y-4">
      {activeTab === 'overview' && <ExceptionsPanel onOpenWell={openWellTrend} />}
      {activeTab === 'trends' && <TrendsChartPanel />}
      {activeTab === 'deferments' && <DefermentsPanel />}
      {activeTab === 'decline' && <DeclinePanel />}
      {activeTab === 'data' && (
        <>
          <ImportPanel />
          <WellsPanel />
        </>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Production Surveillance Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Surveil a field on its own production ledger: rate, watercut and GOR trends, exception surveillance by well, downtime and deferment capture, and decline overlays."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/production"
            backTitle="Back to Production Operations"
            icon={Activity}
            iconGradientClass="from-emerald-600 to-teal-600"
            title="Production Surveillance Studio"
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
              title="Production Surveillance Studio Guide"
              description="How to load a field's production data and surveil it well by well."
              triggerTitle="Surveillance documentation"
            >
              <SurveillanceHelpContent />
            </StudioHelp>
          </>
        }
        sidebarLeft={leftPanel}
        sidebarRight={rightPanel}
        main={main}
        busyMessage={
          importing ? 'Importing production data...'
            : loadingField ? 'Loading field data...' : null
        }
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </>
  );
};

export default function ProductionSurveillanceStudio() {
  return (
    <ProductionSurveillanceProvider>
      <SurveillanceContent />
    </ProductionSurveillanceProvider>
  );
}
