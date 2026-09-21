// Consequence Modelling Studio (Process Safety PS2).
//
// The module's second app and the live counterpart of NextGen course H4
// `consequence`. Source terms, Gaussian plume dispersion, a pool fire by the
// solid-flame model, TNT equivalence with Kinney and Graham overpressure, and
// the probits that turn each dose into a probability of harm. Every number
// comes from the vendored engine (packages/engines/engines/hse/consequence.js);
// studies are saved per organization.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { ConsequenceStudioProvider, useConsequenceStudio } from '@/contexts/ConsequenceStudioContext';
import ConsequenceScopeNotice from '@/components/processsafety/consequence/ConsequenceScopeNotice';
import SourceTermPanel from '@/components/processsafety/consequence/SourceTermPanel';
import DispersionPanel from '@/components/processsafety/consequence/DispersionPanel';
import FirePanel from '@/components/processsafety/consequence/FirePanel';
import ExplosionPanel from '@/components/processsafety/consequence/ExplosionPanel';
import HarmPanel from '@/components/processsafety/consequence/HarmPanel';
import { CONSEQUENCE_STUDIO_ROUTE } from '@/utils/processSafety/consequenceStudy';

const TABS = [
  { id: 'source', label: 'Source term', Panel: SourceTermPanel },
  { id: 'dispersion', label: 'Dispersion', Panel: DispersionPanel },
  { id: 'fire', label: 'Fire', Panel: FirePanel },
  { id: 'explosion', label: 'Explosion', Panel: ExplosionPanel },
  { id: 'harm', label: 'Harm', Panel: HarmPanel },
];

const Workspace = () => {
  const {
    persistence, notifications, removeNotification, orgId,
  } = useConsequenceStudio();
  const [tab, setTab] = useState('source');

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
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Consequence Modelling Studio</h1>
                <p className="text-xs text-slate-400">
                  How much is released, where it goes, how hot a pool fire burns, how hard a blast pushes, and
                  what each does to a person.
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
                  confirmDeleteMessage="Delete this consequence study for everyone in your organization? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <Link to={`${CONSEQUENCE_STUDIO_ROUTE}/help`} title="Documentation">
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
          <ConsequenceScopeNotice />
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

const ConsequenceModellingStudio = () => (
  <>
    <Helmet>
      <title>Consequence Modelling Studio - Petrolord Suite</title>
      <meta
        name="description"
        content="Release source terms, Gaussian plume dispersion, solid-flame pool fire radiation, TNT equivalence with Kinney and Graham overpressure, and thermal, toxic and blast probits."
      />
    </Helmet>
    <ConsequenceStudioProvider>
      <Workspace />
    </ConsequenceStudioProvider>
  </>
);

export default ConsequenceModellingStudio;
