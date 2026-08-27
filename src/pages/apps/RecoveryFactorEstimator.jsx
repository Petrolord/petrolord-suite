// Recovery Factor Estimator on the shared Studio shell (kit upgrade,
// docs/scope/RecoveryFactorEstimator-STATUS.md): StudioLayout +
// saved_rf_projects persistence with debounced autosave. The engine
// (recoveryFactorCalculations.js) is untouched; the pre-Studio inputs,
// chart and reference table live on as rfestimator panels.
import React from 'react';
import { Helmet } from 'react-helmet';
import { Percent, Beaker } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { RfEstimatorProvider, useRfEstimator } from '@/contexts/RfEstimatorContext';
import InPlacePanel from '@/components/rfestimator/InPlacePanel';
import MethodPanel from '@/components/rfestimator/MethodPanel';
import RfKpiPanel from '@/components/rfestimator/RfKpiPanel';
import ReservesChartPanel from '@/components/rfestimator/ReservesChartPanel';
import DriveReferencePanel from '@/components/rfestimator/DriveReferencePanel';
import RecoveryFactorHelpContent from '@/components/reservoir/RecoveryFactorHelpGuide';

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const RfEstimatorContent = () => {
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, loadSample,
  } = useRfEstimator();

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
        <SectionLabel>In-place Volume</SectionLabel>
        <InPlacePanel />
      </section>
      <section>
        <SectionLabel>Method</SectionLabel>
        <MethodPanel />
      </section>
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Recovery Summary</SectionLabel>
        <RfKpiPanel />
      </section>
    </div>
  );

  const main = (
    <div className="h-full overflow-y-auto space-y-4">
      <ReservesChartPanel />
      <DriveReferencePanel />
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Recovery Factor Estimator | Petrolord Suite</title>
        <meta name="description" content="Estimate recovery factor from drive-mechanism analogs or correlations and convert OOIP / OGIP into recoverable reserves." />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/reservoir"
            backTitle="Back to Reservoir Management"
            icon={Percent}
            iconGradientClass="from-lime-600 to-emerald-600"
            title="Recovery Factor Estimator"
          />
        }
        headerActions={
          <>
            <Button variant="ghost" size="sm" onClick={loadSample} className="h-8 text-xs text-slate-300 hover:text-white">
              <Beaker className="w-3.5 h-3.5 mr-1" /> Sample
            </Button>
            <StudioAutoSave isSaving={isSaving} saveError={saveError} lastSaveTime={lastSaveTime} onSave={manualSave} />
            <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>
            <StudioHelp
              title="Recovery Factor Estimator Guide"
              description="How to estimate recovery factor and convert in-place volumes to reserves."
              triggerTitle="Recovery Factor documentation"
            >
              <RecoveryFactorHelpContent />
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

export default function RecoveryFactorEstimator() {
  return (
    <RfEstimatorProvider>
      <RfEstimatorContent />
    </RfEstimatorProvider>
  );
}
