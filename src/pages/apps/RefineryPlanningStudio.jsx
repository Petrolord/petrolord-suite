// Refinery Planning & Scheduling Studio (Midstream & Downstream DS3).
//
// Doctrine 2's headline app: plan, schedule and actuals on one data model.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Factory } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { RefineryPlanningProvider, useRefineryPlanning } from '@/contexts/RefineryPlanningContext';
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
      <div className="flex flex-col h-full bg-slate-950 text-white">
        <header className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
          <Link to="/dashboard/midstream-downstream">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white pl-0 mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" /> Midstream &amp; Downstream
            </Button>
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-2 rounded-xl shadow-lg">
                <Factory className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Refinery Planning &amp; Scheduling Studio</h1>
                <p className="text-slate-400 text-xs">
                  The plan, the schedule and what actually happened, on one data model.
                </p>
              </div>
            </div>
            <div className="flex items-end gap-3">
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
              <RefineryPlanningHelpGuide />
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-full md:w-1/3 xl:w-1/4 border-r border-slate-800 bg-slate-900/40 p-4 overflow-y-auto">
            <ConfigPanel />
          </aside>
          <main className="flex-1 p-4 overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="bg-slate-900 border border-slate-800">
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

const RefineryPlanningStudio = () => (
  <>
    <Helmet>
      <title>Refinery Planning &amp; Scheduling Studio - Petrolord Suite</title>
      <meta name="description" content="Configuration-level refinery planning LP that cascades to a schedule and reconciles against actuals with variance attributed to volume and price." />
    </Helmet>
    <RefineryPlanningProvider>
      <Workspace />
    </RefineryPlanningProvider>
  </>
);

export default RefineryPlanningStudio;
