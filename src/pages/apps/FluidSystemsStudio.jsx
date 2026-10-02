// Fluid Systems & Flow Behavior Studio on the shared Studio shell
// (StudioLayout/StudioHeader/StudioAutoSave/StudioHelp/StudioProjectManager,
// same kit as DCA/WTA/Waterflood/SCAL/Reservoir Balance). Compute is fully
// client-side: black-oil correlations by default plus the opt-in PR78
// compositional path (FS1-FS8, docs/scope/FluidSystemsStudio-STATUS.md).
// Persistence follows the saved_<app>_projects convention via
// useFluidStudioProjects (10 s autosave once a project is open).
//
// Reservoir upgrade round, app 1 (FLUID-U1, docs/upgrade/
// FluidSystemsStudio-UPGRADE.md): the page holds ONE model. `inputs` carries
// the fluid inputs, the identification, the source of each input, the unit
// system and the saved tuning record; the screen, the PDF report, the two
// CSV files, the pvt-1 handoff and the saved project are all built from it.
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FlaskConical, Beaker } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import FluidStudioInput from '@/components/fluidstudio/FluidStudioInput';
import FluidStudioResults from '@/components/fluidstudio/FluidStudioResults';
import FluidStudioEmptyState from '@/components/fluidstudio/FluidStudioEmptyState';
import { FluidStudioHelpContent } from '@/components/fluidstudio/FluidStudioHelpGuide';
import { useFluidStudioProjects } from '@/components/fluidstudio/useFluidStudioProjects';
import { FluidUnitsProvider } from '@/components/fluidstudio/FluidUnitsContext';
import { analyzeFluidSystem, sampleFluidStudioData } from '@/utils/fluidStudioCalculations';
import { runEosFlash, runEosSeparator, runEosPvtTable } from '@/utils/fluidstudio/eosAnalysis';
import { FLUID_UNIT_SYSTEMS, FLUID_PROFILE_FAMILIES } from '@/utils/fluidstudio/units';
import {
  sampleInputMeta, emptyIdentification, clearEditedSampleMarks, identificationOf, SAMPLE_NOTE,
} from '@/utils/fluidstudio/reportModel';
import { buildFluidPvtContract, buildFluidHandoff } from '@/utils/fluidstudio/pvtHandoff';
import { collectFluidReportArgs, exportFluidPdf } from '@/utils/fluidstudio/fluidReportExport';
import { setProvenanceField } from '@/lib/inputProvenance';
import { PVT_CONTRACT_PAYLOAD_KEY } from '@/lib/inputProvenance/pvtContract';
import { useProfileSystem } from '@/lib/units/useProfileSystem';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { buildLabel } from '@/lib/platformBuild';

// Design system rollout batch 1D (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so every class below is a theme role.

/** The sample fluid as the app opens it: every value marked as a sample, with no field data behind it. */
export const sampleWorkspace = () => ({
  ...sampleFluidStudioData(),
  identification: emptyIdentification(),
  inputMeta: sampleInputMeta(),
});

// The organisation name for the report header. The page also renders
// outside the auth provider (unit tests), where there is none.
const useOrganizationName = () => {
  try {
    return useAuth()?.organization?.name || '';
  } catch {
    return '';
  }
};

const FluidSystemsStudioContent = () => {
  const [inputs, setInputsRaw] = useState(sampleWorkspace);
  // an input that is edited stops being a sample value (PL11, RL1)
  const setInputs = useCallback((next) => setInputsRaw((prev) => {
    const value = typeof next === 'function' ? next(prev) : next;
    return clearEditedSampleMarks(prev, value);
  }), []);

  // Suite unit profile: a workspace that has not chosen follows the profile;
  // a saved project keeps the system it was saved with, and a project saved
  // before the choice existed opens in oilfield units, as it was written.
  const profileSystem = useProfileSystem('fluid', FLUID_PROFILE_FAMILIES);
  const system = FLUID_UNIT_SYSTEMS.includes(inputs.unitSystem) ? inputs.unitSystem : (profileSystem || 'oilfield');
  const setSystem = (v) => setInputsRaw((prev) => ({ ...prev, unitSystem: v }));
  const openInputs = useCallback((restored) => setInputsRaw({
    ...restored,
    unitSystem: FLUID_UNIT_SYSTEMS.includes(restored?.unitSystem) ? restored.unitSystem : 'oilfield',
  }), []);

  const organizationName = useOrganizationName();
  const build = buildLabel();

  // Pure, synchronous recompute on every keystroke: no backend, no spinner.
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
  const eosSalinity = inputs.streamA?.blackOil?.salinity;
  const eosFlash = useMemo(
    () => (eosComposition ? runEosFlash(eosComposition) : null),
    [eosComposition],
  );
  const eosSeparator = useMemo(
    () => (eosComposition ? runEosSeparator(eosComposition, sepStages).separator : null),
    [eosComposition, sepStages],
  );
  const eosPvtTable = useMemo(
    () => (eosComposition ? runEosPvtTable(eosComposition, sepStages, { salinityPpm: eosSalinity }) : null),
    [eosComposition, sepStages, eosSalinity],
  );
  const eos = useMemo(
    () => (eosComposition
      ? { ...eosFlash, separator: eosSeparator, pvtTable: eosPvtTable }
      : null),
    [eosComposition, eosFlash, eosSeparator, eosPvtTable],
  );

  // The pvt-1 block of the fluid on screen. The same builder writes the
  // block that is saved with the project, sent with a handoff, printed in
  // the report and put at the head of both CSV files.
  const identification = useMemo(() => {
    const id = identificationOf(inputs);
    return { ...id, company: id.company || organizationName };
  }, [inputs, organizationName]);
  const contractFor = useCallback((projectId, projectName) => buildFluidPvtContract({
    inputs, results, eos, projectId, projectName, generatedAt: new Date(), appBuild: build, identification,
  }), [inputs, results, eos, build, identification]);

  const inputsForSave = useMemo(() => ({ ...inputs, unitSystem: system }), [inputs, system]);
  const {
    projects, currentProjectId, projectName, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification, addNotification,
  } = useFluidStudioProjects({
    inputs: inputsForSave,
    setInputs: openInputs,
    extra: (id, name) => ({ [PVT_CONTRACT_PAYLOAD_KEY]: contractFor(id, name) }),
  });

  const contract = useMemo(
    () => (hasResults ? contractFor(currentProjectId, projectName || null) : null),
    [hasResults, contractFor, currentProjectId, projectName],
  );
  const handoff = useMemo(
    () => (hasResults ? buildFluidHandoff({ inputs, results, eos, projectId: currentProjectId, projectName: projectName || null, generatedAt: new Date(), appBuild: build, identification }) : null),
    [hasResults, inputs, results, eos, currentProjectId, projectName, build, identification],
  );

  // the envelope trace is held here so the report draws what the screen shows
  const [envelope, setEnvelope] = useState(null);

  // one model for the Report tab and the PDF
  const report = useMemo(() => (hasResults
    ? collectFluidReportArgs({ inputs, results, eos, envelope, system, projectName, organizationName, build, contract })
    : null), [hasResults, inputs, results, eos, envelope, system, projectName, organizationName, build, contract]);

  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const exportPdf = async () => {
    if (!report?.model || exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    const ok = await exportFluidPdf(report, { projectName, sampleName: identification.sampleName });
    exportingRef.current = false;
    setExporting(false);
    addNotification(ok ? 'Report exported as PDF' : 'The report could not be built', ok ? 'success' : 'error');
  };

  const loadSample = () => {
    setInputsRaw((prev) => ({ ...sampleWorkspace(), unitSystem: prev.unitSystem }));
    addNotification('Sample fluid loaded', 'info');
  };
  const hasSampleValues = Object.values(inputs.inputMeta || {}).some((m) => m?.note === SAMPLE_NOTE);

  // ET3: merge lab-tuning updates ({lab}, {applied} and the record of the
  // fit) into the composition. Replacing the composition object re-keys the
  // EOS memos, so an applied tune recomputes every compositional result.
  const updateTuning = (next) => setInputs((prev) => {
    const composition = prev.streamA?.composition ?? {};
    return {
      ...prev,
      streamA: {
        ...prev.streamA,
        composition: {
          ...composition,
          tuning: { ...(composition.tuning ?? {}), ...next },
        },
      },
    };
  });

  const setIdentification = (key, value) => setInputsRaw((prev) => ({
    ...prev, identification: { ...identificationOf(prev), [key]: value },
  }));
  const setSource = (key, field, value) => setInputsRaw((prev) => ({
    ...prev, inputMeta: setProvenanceField(prev.inputMeta, key, field, value),
  }));

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <StudioProjectManager
          projects={projects}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
          confirmDeleteMessage="Delete this project and its saved inputs? This cannot be undone."
        />
      </section>
      {hasSampleValues && (
        <p className="text-xs rounded-md border border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text px-3 py-2" data-testid="fluid-sample-banner">
          Sample fluid: these are example values, with no field data behind them. Edit them, or state their source on the Report tab.
        </p>
      )}
      <FluidStudioInput inputs={inputs} setInputs={setInputs} />
    </div>
  );

  return (
    <FluidUnitsProvider system={system}>
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
            <Select value={system} onValueChange={setSystem}>
              <SelectTrigger className="h-8 w-[104px] text-xs" aria-label="Display units" data-testid="fluid-unit-system" title={profileSystem && !inputs.unitSystem ? 'Following your Suite unit profile' : 'Display units of this project'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oilfield">Oilfield</SelectItem>
                <SelectItem value="si">SI</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-pl-muted hover:text-pl-text"
              title="Load the sample fluid"
              onClick={loadSample}
            >
              <Beaker size={18} />
            </Button>
            <StudioAutoSave isSaving={isSaving} saveError={saveError} lastSaveTime={lastSaveTime} onSave={manualSave} />
            <div className="h-4 w-[1px] bg-pl-border mx-1"></div>
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
          ? (
            <FluidStudioResults
              results={results}
              eos={eos}
              composition={inputs.streamA?.composition}
              sepStages={sepStages}
              onUpdateTuning={updateTuning}
              inputs={inputs}
              report={report}
              handoff={handoff}
              projectId={currentProjectId}
              onBeforeSend={currentProjectId ? manualSave : undefined}
              organizationName={organizationName}
              onIdentification={setIdentification}
              onSource={setSource}
              onExportPdf={exportPdf}
              exporting={exporting}
              envelope={envelope}
              onEnvelope={setEnvelope}
            />
          )
          : <FluidStudioEmptyState onRunSample={loadSample} />}
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </FluidUnitsProvider>
  );
};

export default function FluidSystemsStudio() {
  return (
    <div data-testid="fluid-theme-scope">
      <FluidSystemsStudioContent />
    </div>
  );
}
