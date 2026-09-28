// LOPA & SIL Studio (Process Safety PS1).
//
// The module's first app and the live counterpart of NextGen course H3
// `lopa`. Layers of protection analysis against a tolerable target, the SIL
// a safety function must reach, and verification of that function's PFDavg
// with proof testing. Every number comes from the vendored engine
// (packages/engines/engines/hse/lopa.js); studies are saved per organization.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, ShieldHalf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ThemedApp } from '@/design/ThemeProvider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioNotifications from '@/components/studio/StudioNotifications';
import { LopaStudioProvider, useLopaStudio } from '@/contexts/LopaStudioContext';
import ScenarioRail from '@/components/processsafety/lopa/ScenarioRail';
import LopaWorksheet from '@/components/processsafety/lopa/LopaWorksheet';
import SifVerification from '@/components/processsafety/lopa/SifVerification';
import ProofTestPanel from '@/components/processsafety/lopa/ProofTestPanel';
import ScopeNotice from '@/components/processsafety/lopa/ScopeNotice';
import { LOPA_STUDIO_ROUTE } from '@/utils/processSafety/lopaStudy';

const Workspace = () => {
  const {
    persistence, notifications, removeNotification, orgId,
  } = useLopaStudio();
  const [tab, setTab] = useState('lopa');

  return (
    <>
      <StudioNotifications notifications={notifications} onDismiss={removeNotification} />
      <div className="flex h-full flex-col bg-pl-bg text-pl-text">
        <header className="flex-shrink-0 border-b border-pl-border bg-pl-surface px-4 py-3">
          <Link to="/dashboard/process-safety">
            <Button variant="ghost" size="sm" className="mb-2 pl-0 text-pl-muted hover:text-pl-text">
              <ArrowLeft className="mr-2 h-4 w-4" /> Process Safety
            </Button>
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-pl-primary p-2 text-pl-primary-fg shadow-pl-sm">
                <ShieldHalf className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">LOPA &amp; SIL Studio</h1>
                <p className="text-xs text-pl-muted">
                  How often a scenario gets through its layers, how much risk reduction is still missing,
                  and whether the safety function you propose supplies it.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-52">
                <StudioProjectManager
                  label="Saved study"
                  projects={persistence.projects}
                  currentProjectId={persistence.currentProjectId}
                  onCreate={persistence.createProject}
                  onOpen={persistence.openProject}
                  onDelete={persistence.deleteProject}
                  confirmDeleteMessage="Delete this LOPA study for everyone in your organization? This cannot be undone."
                />
              </div>
              <StudioAutoSave
                isSaving={persistence.isSaving}
                saveError={persistence.saveError}
                lastSaveTime={persistence.lastSaveTime}
                onSave={persistence.manualSave}
                disabled={!persistence.currentProjectId}
              />
              <Link to={`${LOPA_STUDIO_ROUTE}/help`} title="Documentation">
                <Button variant="ghost" size="sm" className="text-pl-muted hover:text-pl-text">
                  <BookOpen className="mr-1 h-4 w-4" /> Help guide
                </Button>
              </Link>
              <ThemeToggle />
            </div>
          </div>
          {orgId ? null : (
            <p className="mt-2 text-xs text-pl-warning-text">
              Studies are saved to your organization. Without one you can work here, and saving is unavailable.
            </p>
          )}
        </header>

        <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <aside className="w-full flex-shrink-0 border-b border-pl-border bg-pl-surface p-4 md:w-1/3 md:overflow-y-auto md:border-b-0 md:border-r xl:w-1/4">
            <ScenarioRail />
          </aside>
          <main className="min-w-0 flex-1 space-y-4 p-4 md:overflow-y-auto">
            <ScopeNotice />
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-auto flex-wrap">
                <TabsTrigger value="lopa">LOPA worksheet</TabsTrigger>
                <TabsTrigger value="sif">SIF verification</TabsTrigger>
                <TabsTrigger value="proof">Proof test interval</TabsTrigger>
              </TabsList>
              <TabsContent value="lopa" className="mt-4">
                <LopaWorksheet />
              </TabsContent>
              <TabsContent value="sif" className="mt-4">
                <SifVerification />
              </TabsContent>
              <TabsContent value="proof" className="mt-4">
                <ProofTestPanel />
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </>
  );
};

const LopaSilStudio = () => (
  <ThemedApp className="h-full min-h-screen" data-testid="lopa-theme-scope">
    <Helmet>
      <title>LOPA &amp; SIL Studio - Petrolord Suite</title>
      <meta
        name="description"
        content="Layers of protection analysis, required SIL and risk reduction, and SIF PFDavg verification with proof test interval sensitivity, low demand mode."
      />
    </Helmet>
    <LopaStudioProvider>
      <Workspace />
    </LopaStudioProvider>
  </ThemedApp>
);

export default LopaSilStudio;
