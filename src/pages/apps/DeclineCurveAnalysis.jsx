// Decline Curve Analysis on the shared Studio shell (W5). The original DCA
// layout was the template the Studio kit was generalized from in W1; this
// page now consumes the kit (StudioLayout/Header/AutoSave/Help/
// ProjectManager) so there is a single shell implementation, with the DCA
// panels unchanged.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { TrendingDown } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { DeclineCurveProvider, useDeclineCurve } from '@/contexts/DeclineCurveContext';
import DCAWellSelector from '@/components/declineCurve/DCAWellSelector';
import DCADataImporter from '@/components/declineCurve/DCADataImporter';
import DCAModelFitting from '@/components/declineCurve/DCAModelFitting';
import DCAForecastEngine from '@/components/declineCurve/DCAForecastEngine';
import DCAScenarioBuilder from '@/components/declineCurve/DCAScenarioBuilder';
import DCAFitDiagnostics from '@/components/declineCurve/DCAFitDiagnostics';
import DCAScenarioComparison from '@/components/declineCurve/DCAScenarioComparison';
import DCABasePlots from '@/components/declineCurve/DCABasePlots';
import DCAKPICardsEnhanced from '@/components/declineCurve/DCAKPICardsEnhanced';
import DCAForecastResults from '@/components/declineCurve/DCAForecastResults';
import DCAMultiStreamAnalysis from '@/components/declineCurve/DCAMultiStreamAnalysis';
import DCAGroupRollup from '@/components/declineCurve/DCAGroupRollup';
import DCATypeCurve from '@/components/declineCurve/DCATypeCurve';
import DCAWellGrouping from '@/components/declineCurve/DCAWellGrouping';
import DCAWellFilters from '@/components/declineCurve/DCAWellFilters';
import DCAIntegrationPanel from '@/components/declineCurve/DCAIntegrationPanel';
import DCAWellMetadata from '@/components/declineCurve/DCAWellMetadata';
import DCAHelpContent from '@/components/declineCurve/DCAHelpContent';
import { Separator } from '@/components/ui/separator';

const TABS = [
  { value: 'analysis', label: 'Single Well Analysis' },
  { value: 'typecurve', label: 'Type Curve' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">{children}</h3>
);

const DeclineCurveContent = () => {
  const [activeTab, setActiveTab] = useState('analysis');
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    isFitting, isForecasting,
    notifications, removeNotification,
  } = useDeclineCurve();

  const leftPanel = activeTab === 'analysis' ? (
    <div className="space-y-6">
      <section>
        <SectionLabel>Project &amp; Data</SectionLabel>
        <StudioProjectManager
          projects={projects}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
        />
        <div className="h-2"></div>
        <DCAWellSelector />
        <div className="mt-4">
          <DCADataImporter />
        </div>
      </section>

      <Separator className="bg-slate-800" />

      <section>
        <SectionLabel>Analysis</SectionLabel>
        <DCAMultiStreamAnalysis />
        <DCAModelFitting />
      </section>

      <Separator className="bg-slate-800" />

      <section>
        <SectionLabel>Forecasting</SectionLabel>
        <DCAForecastEngine />
      </section>
    </div>
  ) : (
    <div className="space-y-6">
      <section>
        <DCAWellGrouping />
      </section>
      <Separator className="bg-slate-800" />
      <section>
        <DCAWellFilters />
      </section>
    </div>
  );

  const rightPanel = activeTab === 'analysis' ? (
    <div className="space-y-6">
      <section>
        <DCAWellMetadata />
      </section>
      <Separator className="bg-slate-800" />
      <section>
        <SectionLabel>Scenarios</SectionLabel>
        <DCAScenarioBuilder />
      </section>

      <Separator className="bg-slate-800" />

      <section>
        <DCAScenarioComparison />
      </section>

      <Separator className="bg-slate-800" />

      <section>
        <SectionLabel>Diagnostics</SectionLabel>
        <DCAFitDiagnostics />
      </section>

      <Separator className="bg-slate-800" />

      <section>
        <DCAIntegrationPanel />
      </section>
    </div>
  ) : (
    <div className="space-y-6">
      <section>
        <DCAGroupRollup />
      </section>
    </div>
  );

  const main = activeTab === 'analysis' ? (
    <div className="h-full flex flex-col gap-4">
      <div className="flex-shrink-0">
        <DCAKPICardsEnhanced />
      </div>
      <div className="flex-1 min-h-0">
        <DCABasePlots />
      </div>
    </div>
  ) : (
    <div className="h-full flex flex-col gap-4">
      <DCATypeCurve />
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Decline Curve Analysis | Petrolord Suite</title>
        <meta name="description" content="Arps decline curve fitting, probabilistic forecasting, type curves and scenario comparison." />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/reservoir"
            backTitle="Back to Reservoir Management"
            icon={TrendingDown}
            iconGradientClass="from-blue-600 to-indigo-600"
            title="Decline Curve Analysis"
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
              title="DCA User Guide"
              description="Complete guide to Decline Curve Analysis in Petrolord Suite: single-well fitting, type curves, probabilistic forecasting, and scenarios."
              triggerTitle="DCA Documentation"
            >
              <DCAHelpContent />
            </StudioHelp>
          </>
        }
        sidebarLeft={leftPanel}
        sidebarRight={rightPanel}
        main={main}
        bottom={activeTab === 'analysis' ? <DCAForecastResults /> : null}
        busyMessage={isFitting ? 'Fitting Model...' : isForecasting ? 'Generating Forecast...' : null}
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </>
  );
};

const DeclineCurveAnalysisPage = () => {
  return (
    <DeclineCurveProvider>
      <DeclineCurveContent />
    </DeclineCurveProvider>
  );
};

export default DeclineCurveAnalysisPage;
