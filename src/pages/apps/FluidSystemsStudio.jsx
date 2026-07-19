// Fluid Systems & Flow Behavior Studio on the shared Studio shell
// (StudioLayout/StudioHeader/StudioAutoSave/StudioHelp/StudioProjectManager,
// same kit as DCA/WTA/Waterflood/SCAL/Reservoir Balance). Compute is fully
// client-side: black-oil correlations by default plus the opt-in PR78
// compositional path (FS1-FS8, docs/scope/FluidSystemsStudio-STATUS.md).
// Persistence follows the saved_<app>_projects convention via
// useFluidStudioProjects (10 s autosave once a project is open).
import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { FlaskConical, Beaker } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { SectionLabel } from '@/components/waterflooddesign/primitives';
import FluidStudioInput from '@/components/fluidstudio/FluidStudioInput';
import FluidStudioResults from '@/components/fluidstudio/FluidStudioResults';
import FluidStudioEmptyState from '@/components/fluidstudio/FluidStudioEmptyState';
import { FluidStudioHelpContent } from '@/components/fluidstudio/FluidStudioHelpGuide';
import { useFluidStudioProjects } from '@/components/fluidstudio/useFluidStudioProjects';
import { analyzeFluidSystem, sampleFluidStudioData } from '@/utils/fluidStudioCalculations';
import { runEosFlash, runEosSeparator, runEosPvtTable } from '@/utils/fluidstudio/eosAnalysis';

const FluidSystemsStudio = () => {
  const [inputs, setInputs] = useState(sampleFluidStudioData);

  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, addNotification,
  } = useFluidStudioProjects({ inputs, setInputs });

  // Pure, synchronous recompute on every keystroke — no backend, no spinner.
  const results = useMemo(() => analyzeFluidSystem(inputs), [inputs]);
  const hasResults = !!results?.pvt?.kpis;

  // Compositional path (FS5): opt-in beside the black-oil default. The flash
  // is fast enough to recompute synchronously; the envelope card owns the
  // slow worker path.
  // FS8 memoization: the EOS pipeline (flash + separator + saturation
  // scan + DL table) keys on the composition and separator stages only,
  // so black-oil-side edits (correlations, blending, flow assurance...)
  // no longer re-run it. The input components replace these objects
  // immutably when and only when their own fields change.
  const eosComposition = inputs.fluidModel === 'eos' ? inputs.streamA?.composition : null;
  const sepStages = inputs.separatorTrain?.stages;
  const eosFlash = useMemo(
    () => (eosComposition ? runEosFlash(eosComposition) : null),
    [eosComposition],
  );
  const eosSeparator = useMemo(
    () => (eosComposition ? runEosSeparator(eosComposition, sepStages).separator : null),
    [eosComposition, sepStages],
  );
  const eosPvtTable = useMemo(
    () => (eosComposition ? runEosPvtTable(eosComposition, sepStages) : null),
    [eosComposition, sepStages],
  );
  const eos = useMemo(
    () => (eosComposition
      ? { ...eosFlash, separator: eosSeparator, pvtTable: eosPvtTable }
      : null),
    [eosComposition, eosFlash, eosSeparator, eosPvtTable],
  );

  const loadSample = () => {
    setInputs(sampleFluidStudioData());
    addNotification('Sample fluid loaded', 'info');
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
          confirmDeleteMessage="Delete this project and its saved inputs? This cannot be undone."
        />
      </section>
      <FluidStudioInput inputs={inputs} setInputs={setInputs} />
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Fluid Systems & Flow Behavior Studio - Petrolord Suite</title>
        <meta name="description" content="Client-side black-oil and compositional PVT, blending, separator and flow-assurance analysis from reservoir to stock tank." />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/reservoir"
            backTitle="Back to Reservoir Management"
            icon={FlaskConical}
            iconGradientClass="from-teal-500 to-cyan-500"
            title="Fluid Systems & Flow Behavior Studio"
          />
        }
        headerActions={
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-white"
              title="Load the sample fluid"
              onClick={loadSample}
            >
              <Beaker size={18} />
            </Button>
            <StudioAutoSave isSaving={isSaving} saveError={saveError} lastSaveTime={lastSaveTime} onSave={manualSave} />
            <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>
            <StudioHelp
              title="Fluid Systems & Flow Behavior Studio Guide"
              description="Black-oil and compositional PVT, blending, separator train and flow-assurance screening: how it works and how to read it."
              triggerTitle="Fluid Studio documentation"
            >
              <FluidStudioHelpContent />
            </StudioHelp>
          </>
        }
        sidebarLeft={leftPanel}
        sidebarRight={null}
        leftWidthClass="w-96"
        main={hasResults
          ? <FluidStudioResults results={results} eos={eos} composition={inputs.streamA?.composition} />
          : <FluidStudioEmptyState onRunSample={loadSample} />}
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </>
  );
};

export default FluidSystemsStudio;
