// Nodal Analysis Studio (NA4): IPR x VLP system analysis on the validated
// nodal engine stack (src/utils/nodal, gates in tools/validation/nodal).
import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { Activity } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import { NodalAnalysisStudioProvider, useNodalStudio } from '@/contexts/NodalAnalysisStudioContext';
import { SetupRail } from '@/components/nodalstudio/InputCards';
import { TraverseViewPanel, SensitivityPanel, GasLiftPanel, ChokesPanel } from '@/components/nodalstudio/Panels';
import SystemResults from '@/components/nodalstudio/SystemResults';
import IprResults from '@/components/nodalstudio/IprResults';
import VlpResults from '@/components/nodalstudio/VlpResults';
import { SensitivityResults, GasLiftResults } from '@/components/nodalstudio/SweepResults';
import ChokesResults from '@/components/nodalstudio/ChokesResults';
import NASHelpContent from '@/components/nodalstudio/NASHelpContent';
import { SectionLabel } from '@/components/nodalstudio/primitives';

const TABS = [
  { value: 'system', label: 'System' },
  { value: 'ipr', label: 'Inflow' },
  { value: 'vlp', label: 'Outflow' },
  { value: 'sensitivity', label: 'Sensitivity' },
  { value: 'gaslift', label: 'Gas lift' },
  { value: 'chokes', label: 'Chokes' },
];

const StatusRail = () => {
  const { system, isGasWell, fluidSpec, wellSpec, inflowSpec, vlpSpec } = useNodalStudio();
  const items = [
    { label: 'Fluid model', ok: !!fluidSpec.model, note: fluidSpec.error },
    { label: 'Well geometry', ok: !wellSpec.error, note: wellSpec.error },
    { label: 'Inflow', ok: !inflowSpec.error, note: inflowSpec.error },
    {
      label: 'Outflow',
      ok: isGasWell ? !wellSpec.error : !!vlpSpec.vlp,
      note: isGasWell ? null : vlpSpec.error,
    },
  ];
  return (
    <div className="space-y-4">
      <SectionLabel>Model status</SectionLabel>
      <div className="space-y-2 text-xs">
        {items.map((it) => (
          <div key={it.label} className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
            <span className="text-slate-400">{it.label}</span>
            <span className={it.ok ? 'text-emerald-400' : 'text-amber-400'}>
              {it.ok ? 'Ready' : it.note || 'Incomplete'}
            </span>
          </div>
        ))}
        <div className="flex items-start justify-between gap-2 pb-1">
          <span className="text-slate-400">System</span>
          <span className={system?.status === 'flowing' ? 'text-emerald-400' : 'text-amber-400'}>
            {system?.status === 'flowing' ? 'Flowing' : system?.status || 'Pending'}
          </span>
        </div>
      </div>
      <div className="text-[11px] text-slate-500 leading-relaxed">
        Engine tier: oracle validated with armed literature anchors. See the documentation drawer
        for the validation map.
      </div>
    </div>
  );
};

const NodalStudioContent = () => {
  const {
    notifications,
    removeNotification,
    projects,
    currentProjectId,
    openProject,
    createProject,
    deleteProject,
    isSaving,
    saveError,
    lastSaveTime,
    manualSave,
    isScreening,
  } = useNodalStudio();

  const [searchParams] = useSearchParams();
  const initialTab = TABS.some((t) => t.value === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'system';
  const [activeTab, setActiveTab] = useState(initialTab);

  const leftPanel = useMemo(() => {
    const projectBlock = (
      <StudioProjectManager
        projects={projects}
        currentProjectId={currentProjectId}
        onCreate={createProject}
        onOpen={openProject}
        onDelete={deleteProject}
      />
    );
    let tabPanel;
    switch (activeTab) {
      case 'ipr':
        tabPanel = <SetupRail sections={['fluid', 'inflow']} />;
        break;
      case 'vlp':
        tabPanel = (
          <>
            <SetupRail sections={['well', 'completion']} />
            <TraverseViewPanel />
          </>
        );
        break;
      case 'sensitivity':
        tabPanel = <SensitivityPanel />;
        break;
      case 'gaslift':
        tabPanel = <GasLiftPanel />;
        break;
      case 'chokes':
        tabPanel = <ChokesPanel />;
        break;
      default:
        tabPanel = <SetupRail />;
    }
    return (
      <div className="space-y-6">
        {projectBlock}
        {tabPanel}
      </div>
    );
  }, [activeTab, projects, currentProjectId, createProject, openProject, deleteProject]);

  const main = useMemo(() => {
    switch (activeTab) {
      case 'ipr':
        return <IprResults />;
      case 'vlp':
        return <VlpResults />;
      case 'sensitivity':
        return <SensitivityResults />;
      case 'gaslift':
        return <GasLiftResults />;
      case 'chokes':
        return <ChokesResults />;
      default:
        return <SystemResults />;
    }
  }, [activeTab]);

  return (
    <>
      <Helmet>
        <title>Nodal Analysis Studio | Petrolord</title>
        <meta
          name="description"
          content="IPR and VLP system analysis with validated multiphase correlations, operating point solve, sensitivities, gas lift screening and choke performance."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/production"
            backTitle="Production"
            icon={Activity}
            iconGradientClass="from-cyan-600 to-blue-600"
            title="Nodal Analysis Studio"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        headerActions={
          <>
            <StudioAutoSave
              isSaving={isSaving}
              saveError={saveError}
              lastSaveTime={lastSaveTime}
              onSave={manualSave}
              disabled={!currentProjectId}
            />
            <div className="h-4 w-[1px] bg-slate-700 mx-1" />
            <StudioHelp
              title="Nodal Analysis Studio"
              description="How the system solve, correlations and screenings work."
            >
              <NASHelpContent />
            </StudioHelp>
          </>
        }
        sidebarLeft={leftPanel}
        sidebarRight={<StatusRail />}
        main={<div className="p-6">{main}</div>}
        busyMessage={isScreening ? 'Screening gas lift response…' : null}
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </>
  );
};

export default function NodalAnalysisStudio() {
  return (
    <NodalAnalysisStudioProvider>
      <NodalStudioContent />
    </NodalAnalysisStudioProvider>
  );
}
