// Reservoir Simulation Studio (S2 of the OPM Flow connectivity program,
// docs/scope/ReservoirSimulationStudio-STATUS.md): deck-first V1 on the
// shared Studio shell. Cases + deck upload/templates, queued runs on the
// VPS worker, honest status + results charts.
import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Cuboid } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { SimStudioProvider, useSimStudio } from '@/contexts/SimStudioContext';
import DeckPanel from '@/components/simstudio/DeckPanel';
import BuilderPanel from '@/components/simstudio/BuilderPanel';
import RunPanel from '@/components/simstudio/RunPanel';
import ResultsPanel from '@/components/simstudio/ResultsPanel';
import SimKpiPanel from '@/components/simstudio/SimKpiPanel';
import SimHelpGuide from '@/components/simstudio/SimHelpGuide';
import ReportPanel from '@/components/simstudio/ReportPanel';
import { supabaseSharingStore } from '@/lib/recordSharing';
import { RecordSharingBar } from '@/components/recordSharing';
import { useProfileSystem } from '@/lib/units/useProfileSystem';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { SIM_PROFILE_FAMILIES } from '@/utils/simstudio/simUnits';

// One store per page; record sharing of sim_cases (SIM-U1, PL5).
const SHARING_STORE = supabaseSharingStore();
const useOrganizationName = () => {
  try { return useAuth()?.organization?.name || ''; } catch { return ''; }
};

const TABS = [
  { value: 'deck', label: 'Deck' },
  { value: 'builder', label: 'Builder' },
  { value: 'runs', label: 'Runs' },
  { value: 'results', label: 'Results' },
  { value: 'report', label: 'Report' },
];

const SectionLabel = ({ children }) => (
  <h3 className="text-[10px] font-bold text-pl-muted uppercase mb-3 tracking-widest">{children}</h3>
);

const SimStudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'deck',
  );
  const {
    cases, activeCase, activeCaseId, createCase, openCase, deleteCase,
    notifications, removeNotification, sharing, ownerOnlyReason, readOnlyReason,
  } = useSimStudio();
  const myId = sharing?.userId;

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Cases</SectionLabel>
        <StudioProjectManager
          label="Case"
          projects={cases.map((c) => ({ id: c.id, name: myId && c.user_id && c.user_id !== myId ? `${c.name} (shared with me)` : c.name }))}
          currentProjectId={activeCaseId}
          onCreate={createCase}
          onOpen={openCase}
          onDelete={deleteCase}
        />
        {activeCase && (
          <RecordSharingBar sharing={sharing} label="case" className="mt-2" />
        )}
        {ownerOnlyReason && (
          <p className="text-[11px] text-pl-warning-text mt-2" data-testid="sim-owner-only">{ownerOnlyReason}</p>
        )}
        {readOnlyReason && (
          <p className="text-[11px] text-pl-muted mt-1" data-testid="sim-read-only">{readOnlyReason}</p>
        )}
      </section>
      <section>
        <p className="text-[11px] text-pl-muted leading-relaxed">
          A case is one Eclipse-format deck, the Model Builder form that made it (saved with the case) and its run
          history. The simulation runs on the platform&apos;s OPM Flow worker; results, the material balance and the
          convergence come from the simulator&apos;s own output.
        </p>
      </section>
    </div>
  );

  const rightPanel = (
    <div className="space-y-6">
      <section>
        <SectionLabel>Run Status</SectionLabel>
        <SimKpiPanel />
      </section>
    </div>
  );

  const main = (
    <div className="h-full overflow-y-auto space-y-4">
      {activeTab === 'deck' && <DeckPanel />}
      {activeTab === 'builder' && <BuilderPanel />}
      {activeTab === 'runs' && <RunPanel />}
      {activeTab === 'results' && <ResultsPanel />}
      {activeTab === 'report' && <ReportPanel />}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Reservoir Simulation Studio | Petrolord Suite</title>
        <meta name="description" content="Run black-oil reservoir simulations on the open-source OPM Flow engine: upload an Eclipse-format deck or an SPE benchmark template, queue the run, and chart field and well results." />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/reservoir"
            backTitle="Back to Reservoir Management"
            icon={Cuboid}
            title="Reservoir Simulation Studio"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        headerActions={
          <StudioHelp
            title="Reservoir Simulation Studio Guide"
            description="Decks, runs on the OPM Flow engine, and reading the results."
            triggerTitle="Simulation documentation"
          >
            <SimHelpGuide />
          </StudioHelp>
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

// Design system rollout batch 2A (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so it opens light and the header toggle
// switches it to dark per user. Charts keep the white chart standard; the
// 3D preview is a dark canvas.
export default function ReservoirSimulationStudio({ sharingStore = SHARING_STORE }) {
  const profileSystem = useProfileSystem('sim', SIM_PROFILE_FAMILIES);
  const organizationName = useOrganizationName();
  return (
    <div data-testid="sim-theme-scope">
      <SimStudioProvider sharingStore={sharingStore} profileSystem={profileSystem} organizationName={organizationName}>
        <SimStudioContent />
      </SimStudioProvider>
    </div>
  );
}
