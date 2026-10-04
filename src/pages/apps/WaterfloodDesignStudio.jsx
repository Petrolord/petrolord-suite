// Waterflood Design Studio — analytical waterflood design and prediction
// workstation on the shared Studio shell. Replaces the single-page
// Fractional Flow Analyzer (its displacement physics and charts live on in
// the Displacement tab). Also absorbs the retired Waterflood Dashboard as
// the Surveillance tab (W6). Tabs: Displacement | Layered Sweep | Pattern
// Forecast | Uncertainty | Surveillance | Scenarios. Engines:
// fractionalFlowCalculations (generalized), layeredSweepCalculations,
// patternForecastCalculations, waterfloodUncertainty (Monte Carlo over the
// pattern forecast), waterfloodCalculations (surveillance) — all
// golden-tested.
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Waves } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { WaterfloodDesignProvider, useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import DisplacementPanel from '@/components/waterflooddesign/DisplacementPanel';
import DisplacementResults from '@/components/waterflooddesign/DisplacementResults';
import LayeredPanel from '@/components/waterflooddesign/LayeredPanel';
import LayeredResults from '@/components/waterflooddesign/LayeredResults';
import PatternPanel from '@/components/waterflooddesign/PatternPanel';
import PatternResults from '@/components/waterflooddesign/PatternResults';
import UncertaintyPanel from '@/components/waterflooddesign/UncertaintyPanel';
import UncertaintyResults from '@/components/waterflooddesign/UncertaintyResults';
import SurveillancePanel from '@/components/waterflooddesign/SurveillancePanel';
import SurveillanceResults from '@/components/waterflooddesign/SurveillanceResults';
import ScenarioCompare from '@/components/waterflooddesign/ScenarioCompare';
import DiagnosticsRail from '@/components/waterflooddesign/DiagnosticsRail';
import WDSHelpContent from '@/components/waterflooddesign/WDSHelpContent';
import { mapScalKrIntake, scalKrFromContract } from '@/components/waterflooddesign/scalKrIntake';
import { readScalProjectKr, KR_PROJECT_PARAM } from '@/lib/krSource';
import { supabaseSharingStore } from '@/lib/recordSharing';
import { RecordSharingBar } from '@/components/recordSharing';
import { useProfileSystem } from '@/lib/units/useProfileSystem';
import { buildLabel } from '@/lib/platformBuild';
import { WF_PROFILE_FAMILIES } from '@/utils/waterflooddesign/units';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// one sharing store per page load (the signed-in user's session)
const SHARING_STORE = supabaseSharingStore();

// Design system rollout batch 1D (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so every class below is a theme role.

const TABS = [
  { value: 'displacement', label: 'Displacement' },
  { value: 'layered', label: 'Layered Sweep' },
  { value: 'pattern', label: 'Pattern Forecast' },
  { value: 'uncertainty', label: 'Uncertainty' },
  { value: 'surveillance', label: 'Surveillance' },
  { value: 'scenarios', label: 'Scenarios' },
];

const WaterfloodDesignContent = () => {
  // ?tab= deep link (the retired Waterflood Dashboard route redirects to
  // ?tab=surveillance); invalid values fall back to the default tab.
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'displacement',
  );
  const {
    projects, sharedProjects, currentProjectId, createProject, openProject, deleteProject,
    projectRow, sharing, viewingShared, canWrite, saveCopy,
    unitSystem, setUnitSystem, followsProfile,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, addNotification, removeNotification,
    setDisplacementField, setDisplacementInputs,
  } = useWaterfloodDesign();

  // Tested permeability from the Well Test Analysis Studio (navigate-state
  // handoff, the Pipeline Sizer contract): applied to the displacement k.
  const location = useLocation();
  const wtIntakeDone = useRef(false);
  useEffect(() => {
    const wt = location.state?.wellTestData;
    if (!wt || wtIntakeDone.current) return;
    wtIntakeDone.current = true;
    if (Number.isFinite(wt.k_md) && wt.k_md > 0) {
      setDisplacementField('k_md', wt.k_md.toPrecision(3));
      addNotification(
        `Permeability ${wt.k_md.toPrecision(3)} md received from ${wt.source || 'the Well Test Analysis Studio'} and applied to the displacement inputs.`,
        'success',
      );
    }
  }, [location.state, setDisplacementField, addNotification]);

  // Rel-perm set from SCAL Studio (SC5; same navigate-state contract).
  // Mapping is the jest-guarded pure function in scalKrIntake.js.
  // SCAL-U1: with ?scalProject=<id> and no router state (a fresh visit, a
  // copied link, a new tab), the kr-1 block is read from the saved SCAL
  // project by id and taken the same way.
  const scalIntakeDone = useRef(false);
  useEffect(() => {
    const scalKr = location.state?.scalKr;
    const projectId = new URLSearchParams(location.search).get(KR_PROJECT_PARAM);
    if ((!scalKr && !projectId) || scalIntakeDone.current) return;
    scalIntakeDone.current = true;
    const take = (payload) => {
      const mapped = mapScalKrIntake(payload);
      if (!mapped) {
        addNotification('A SCAL handoff arrived but its rel-perm payload was not usable.', 'error');
        return;
      }
      setDisplacementInputs((prev) => ({ ...prev, ...mapped.patch }));
      addNotification(mapped.note, 'success');
    };
    if (scalKr) { take(scalKr); return; }
    readScalProjectKr(projectId).then((res) => {
      if (!res.ok) { addNotification(res.reason, 'error'); return; }
      take(scalKrFromContract(res.contract));
    });
  }, [location.state, location.search, setDisplacementInputs, addNotification]);

  const leftPanel = (
    <div className="space-y-6">
      <section>
        <StudioProjectManager
          projects={projects}
          sharedProjects={sharedProjects}
          canDelete={!viewingShared}
          currentProjectId={currentProjectId}
          onCreate={createProject}
          onOpen={openProject}
          onDelete={deleteProject}
        />
        {projectRow && (
          <RecordSharingBar
            sharing={sharing}
            label="project"
            className="mt-2"
            onSaveCopy={saveCopy}
            onReload={() => openProject(currentProjectId)}
            fieldLabels={{ project_name: 'name', inputs_data: 'inputs, intakes, surveillance data and scenarios' }}
          />
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-pl-muted">Display units{followsProfile ? ' (your Suite unit profile)' : ''}</span>
          <Select value={unitSystem} onValueChange={setUnitSystem}>
            <SelectTrigger className="h-8 w-[112px] text-xs" aria-label="Display units" data-testid="wds-unit-system">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oilfield">Oilfield</SelectItem>
              <SelectItem value="si">SI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {projectRow && sharing.ready && !canWrite && (
          <p className="mt-2 text-xs text-pl-warning-text" data-testid="wds-read-only">
            {sharing.readOnlyReason || 'This project is open read-only.'} Changes you make here are not saved to it.
          </p>
        )}
      </section>
      {activeTab === 'displacement' && <DisplacementPanel />}
      {activeTab === 'layered' && <LayeredPanel />}
      {activeTab === 'pattern' && <PatternPanel />}
      {activeTab === 'uncertainty' && <UncertaintyPanel />}
      {activeTab === 'surveillance' && <SurveillancePanel />}
      {activeTab === 'scenarios' && (
        <p className="text-xs text-pl-muted">
          Snapshot scenarios from the right rail on any tab; this tab compares them. Inputs stay editable on the
          Displacement, Layered Sweep and Pattern tabs.
        </p>
      )}
    </div>
  );

  const main = (
    <>
      {activeTab === 'displacement' && <DisplacementResults />}
      {activeTab === 'layered' && <LayeredResults />}
      {activeTab === 'pattern' && <PatternResults />}
      {activeTab === 'uncertainty' && <UncertaintyResults />}
      {activeTab === 'surveillance' && <SurveillanceResults />}
      {activeTab === 'scenarios' && <ScenarioCompare />}
    </>
  );

  return (
    <>
      <Helmet>
        <title>Waterflood Design Studio | Petrolord Suite</title>
        <meta name="description" content="Buckley-Leverett displacement design, layered sweep, five-spot pattern forecasting, Monte Carlo uncertainty and flood surveillance." />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/reservoir"
            backTitle="Back to Reservoir Management"
            icon={Waves}
            iconGradientClass="from-cyan-600 to-blue-600"
            title="Waterflood Design Studio"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        headerActions={
          <>
            <StudioAutoSave isSaving={isSaving} saveError={saveError} lastSaveTime={lastSaveTime} onSave={manualSave} />
            <div className="h-4 w-[1px] bg-pl-border mx-1"></div>
            <StudioHelp
              title="Waterflood Design Studio Guide"
              description="Displacement design, layered conformance, pattern forecasting, Monte Carlo uncertainty and scenario comparison."
              triggerTitle="Waterflood Design documentation"
            >
              <WDSHelpContent />
            </StudioHelp>
          </>
        }
        sidebarLeft={leftPanel}
        sidebarRight={<DiagnosticsRail activeTab={activeTab} />}
        main={main}
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </>
  );
};

export default function WaterfloodDesignStudio({ sharingStore = SHARING_STORE }) {
  const profileSystem = useProfileSystem('waterflood', WF_PROFILE_FAMILIES);
  return (
    <div data-testid="wds-theme-scope">
      <WaterfloodDesignProvider sharingStore={sharingStore} profileSystem={profileSystem} build={buildLabel()}>
        <WaterfloodDesignContent />
      </WaterfloodDesignProvider>
    </div>
  );
}
