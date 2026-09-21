// QRA Studio (Process Safety PS3).
//
// The module's third app and the live counterpart of NextGen course H5
// `qra`. Event trees, the location specific individual risk, the individual
// risk per annum of the most exposed person, potential loss of life, FAR,
// F-N curves against criterion lines, ALARP banding, and the cost-benefit
// test with its disproportion factor. Every number comes from the vendored
// engine (packages/engines/engines/hse/qra.js); the doses behind each
// probability of death come from the Consequence Modelling Studio. Studies
// are saved per organization.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { QraStudioProvider, useQraStudio } from '@/contexts/QraStudioContext';
import QraScopeNotice from '@/components/processsafety/qra/QraScopeNotice';
import EventTreePanel from '@/components/processsafety/qra/EventTreePanel';
import RegisterPanel from '@/components/processsafety/qra/RegisterPanel';
import IndividualRiskPanel from '@/components/processsafety/qra/IndividualRiskPanel';
import SocietalRiskPanel from '@/components/processsafety/qra/SocietalRiskPanel';
import AlarpPanel from '@/components/processsafety/qra/AlarpPanel';
import { QRA_STUDIO_ROUTE } from '@/utils/processSafety/qraStudy';

const TABS = [
  { id: 'register', label: 'Register', Panel: RegisterPanel },
  { id: 'event-tree', label: 'Event tree', Panel: EventTreePanel },
  { id: 'individual', label: 'Individual risk', Panel: IndividualRiskPanel },
  { id: 'societal', label: 'Societal risk', Panel: SocietalRiskPanel },
  { id: 'alarp', label: 'ALARP and cost-benefit', Panel: AlarpPanel },
];

const Workspace = () => {
  const {
    persistence, notifications, removeNotification, orgId,
  } = useQraStudio();
  const [tab, setTab] = useState('register');

  return (
    <>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="flex h-full flex-col bg-slate-950 text-white">
        <header className="flex-shrink-0 border-b border-slate-800 px-4 py-3">
          <Link to="/dashboard/process-safety">
            <Button variant="ghost" size="sm" className="mb-2 pl-0 text-slate-400 hover:text-white">
              <ArrowLeft className="mr-2 h-4 w-4" /> Process Safety
            </Button>
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-r from-red-500 to-amber-500 p-2 shadow-lg">
                <Scale className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">QRA Studio</h1>
                <p className="text-xs text-slate-400">
                  How often each outcome happens, who it kills where, the risk to a person and to a crowd, and
                  whether a measure is worth its cost.
                </p>
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="w-52">
                <StudioProjectManager
                  label="Saved study"
                  projects={persistence.projects}
                  currentProjectId={persistence.currentProjectId}
                  onCreate={persistence.createProject}
                  onOpen={persistence.openProject}
                  onDelete={persistence.deleteProject}
                  confirmDeleteMessage="Delete this QRA study for everyone in your organization? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <Link to={`${QRA_STUDIO_ROUTE}/help`} title="Documentation">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                  <BookOpen className="mr-1 h-4 w-4" /> Help guide
                </Button>
              </Link>
            </div>
          </div>
          {orgId ? null : (
            <p className="mt-2 text-xs text-amber-200">
              Studies are saved to your organization. Without one you can work here, and saving is unavailable.
            </p>
          )}
        </header>

        <main className="flex-1 space-y-4 overflow-y-auto p-4">
          <QraScopeNotice />
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="border border-slate-800 bg-slate-900">
              {TABS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
            </TabsList>
            {TABS.map(({ id, Panel }) => (
              <TabsContent key={id} value={id} className="mt-4">
                <Panel />
              </TabsContent>
            ))}
          </Tabs>
        </main>
      </div>
    </>
  );
};

const QraStudio = () => (
  <>
    <Helmet>
      <title>QRA Studio - Petrolord Suite</title>
      <meta
        name="description"
        content="Quantitative risk assessment: event trees, individual risk and IRPA, potential loss of life, FAR, F-N curves against criterion lines, ALARP bands and the cost-benefit test with a disproportion factor."
      />
    </Helmet>
    <QraStudioProvider>
      <Workspace />
    </QraStudioProvider>
  </>
);

export default QraStudio;
