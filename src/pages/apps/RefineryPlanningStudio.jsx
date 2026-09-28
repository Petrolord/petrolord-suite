// Refinery Planning & Scheduling Studio (Midstream & Downstream DS3).
//
// Doctrine 2's headline app: plan, schedule and actuals on one data model.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Factory } from 'lucide-react';
import { AppHeader } from '@/components/ui/app-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { RefineryPlanningProvider, useRefineryPlanning } from '@/contexts/RefineryPlanningContext';
import { FullPrecisionProvider, FullPrecisionToggle } from '@/components/fullprecision/FullPrecision';
import ConfigPanel from '@/components/refineryplanning/ConfigPanel';
import PlanResults from '@/components/refineryplanning/PlanResults';
import SchedulePanel from '@/components/refineryplanning/SchedulePanel';
import ActualsPanel from '@/components/refineryplanning/ActualsPanel';
import RefineryPlanningHelpGuide from '@/components/refineryplanning/RefineryPlanningHelpGuide';

const Workspace = () => {
  const { persistence, notifications, removeNotification } = useRefineryPlanning();
  const [tab, setTab] = useState('plan');

  return (
    <>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="flex h-full flex-col bg-pl-bg text-pl-text">
        <AppHeader
          backTo="/dashboard/midstream-downstream"
          backLabel="Midstream & Downstream"
          icon={Factory}
          eyebrow="Midstream & Downstream"
          title="Refinery Planning & Scheduling Studio"
          subtitle="The plan, the schedule and what actually happened, on one data model."
          className="static flex-shrink-0"
          actions={(
            <>
              <div className="w-52">
                <StudioProjectManager
                  label="Saved plan"
                  projects={persistence.projects}
                  currentProjectId={persistence.currentProjectId}
                  onCreate={persistence.createProject}
                  onOpen={persistence.openProject}
                  onDelete={persistence.deleteProject}
                  confirmDeleteMessage="Delete this plan and everything saved with it? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <FullPrecisionToggle app="refinery-planning-studio" />
              <RefineryPlanningHelpGuide />
            </>
          )}
        />

        <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <aside className="w-full border-b border-pl-border bg-pl-surface p-4 md:w-1/3 md:overflow-y-auto md:border-b-0 md:border-r xl:w-1/4">
            <ConfigPanel />
          </aside>
          <main className="min-w-0 flex-1 p-4 md:overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="plan">Plan</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="actuals">Actuals &amp; variance</TabsTrigger>
              </TabsList>
              <TabsContent value="plan" className="mt-4"><PlanResults /></TabsContent>
              <TabsContent value="schedule" className="mt-4"><SchedulePanel /></TabsContent>
              <TabsContent value="actuals" className="mt-4"><ActualsPanel /></TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

// Design system rollout batch 5C (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so every class below is a theme role.
const RefineryPlanningStudio = () => (
  <div data-testid="refinery-planning-theme-scope" className="h-full">
    <Helmet>
      <title>Refinery Planning &amp; Scheduling Studio - Petrolord Suite</title>
      <meta name="description" content="Configuration-level refinery planning LP that cascades to a schedule and reconciles against actuals with variance attributed to volume and price." />
    </Helmet>
    <RefineryPlanningProvider>
      <FullPrecisionProvider>
        <Workspace />
      </FullPrecisionProvider>
    </RefineryPlanningProvider>
  </div>
);

export default RefineryPlanningStudio;
