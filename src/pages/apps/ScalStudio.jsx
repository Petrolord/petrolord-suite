// SCAL Studio — special core analysis workstation on the shared Studio
// shell (SC3 of the SCAL program, docs/scope/SCALStudio-STATUS.md).
// Thin-real per the ReservoirEngineering-Module.md 4.2 owner lock: Corey
// relative permeability curve design plus capillary pressure via the
// Leverett J-function; no LET, no hysteresis, no network models, no
// displacement math (that stays in the Waterflood Design Studio).
// Tabs: Curves | Lab Data | Capillary | Height & Saturation | Export
// (built across SC3-SC5). Engine:
// src/utils/scalCalculations.js (golden-tested, Leverett collapse suite).
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { FlaskConical } from 'lucide-react';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { ScalStudioProvider, useScalStudio } from '@/contexts/ScalStudioContext';
import CurvesPanel from '@/components/scalstudio/CurvesPanel';
import CurvesResults from '@/components/scalstudio/CurvesResults';
import CapillaryPanel from '@/components/scalstudio/CapillaryPanel';
import CapillaryResults from '@/components/scalstudio/CapillaryResults';
import LabDataPanel from '@/components/scalstudio/LabDataPanel';
import LabDataResults from '@/components/scalstudio/LabDataResults';
import HeightPanel from '@/components/scalstudio/HeightPanel';
import HeightResults from '@/components/scalstudio/HeightResults';
import ExportTab from '@/components/scalstudio/ExportTab';
import ScalHelpContent from '@/components/scalstudio/ScalHelpContent';
import ScalReportTab from '@/components/scalstudio/ScalReportTab';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabaseSharingStore } from '@/lib/recordSharing';
import { RecordSharingBar } from '@/components/recordSharing';
import { useProfileSystem } from '@/lib/units/useProfileSystem';
import { SCAL_PROFILE_FAMILIES } from '@/utils/scalstudio/units';
import { buildLabel } from '@/lib/platformBuild';

// Design system rollout batch 1D (docs/scope/DesignSystem-Rollout.md): the
// page sits in the dashboard scope, so every class below is a theme role.

const TABS = [
  { value: 'curves', label: 'Curves' },
  { value: 'labdata', label: 'Lab Data' },
  { value: 'capillary', label: 'Capillary' },
  { value: 'height', label: 'Height & Saturation' },
  { value: 'report', label: 'Report' },
  { value: 'export', label: 'Export' },
];

// One store per page; record sharing of saved_scal_projects (SCAL-U1, PL5).
const SHARING_STORE = supabaseSharingStore();

const ScalStudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'curves',
  );
  // Lab Data tab selection (page-level so panel and results stay in step).
  const [selectedSampleId, setSelectedSampleId] = useState(null);
  const {
    projects, sharedProjects, viewingShared, projectRow, sharing, saveCopy, canWrite,
    currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
    unitSystem, setUnitSystem, followsProfile,
  } = useScalStudio();

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
          confirmDeleteMessage="Delete this SCAL project? Apps that read it by id (Waterflood, Petrophysics, Earth Modeling, Rock Physics, ReservoirCalc Pro) will no longer find it."
        />
        {projectRow && (
          <RecordSharingBar
            sharing={sharing}
            label="project"
            className="mt-2"
            onSaveCopy={saveCopy}
            onReload={() => openProject(currentProjectId)}
            fieldLabels={{ project_name: 'name', inputs_data: 'curves, samples and report fields' }}
          />
        )}
        {projectRow && sharing.ready && !canWrite && (
          <p className="mt-2 text-xs text-pl-warning-text" data-testid="scal-read-only">
            {sharing.readOnlyReason || 'This project is open read-only.'} Changes you make here are not saved to it.
          </p>
        )}
      </section>
      {activeTab === 'curves' && <CurvesPanel />}
      {activeTab === 'labdata' && (
        <LabDataPanel selectedId={selectedSampleId} onSelect={setSelectedSampleId} />
      )}
      {activeTab === 'capillary' && <CapillaryPanel />}
      {activeTab === 'height' && <HeightPanel />}
      {activeTab === 'report' && (
        <p className="text-xs text-pl-muted">
          The report prints the identification, every input with its unit and source, the sample pedigree, the model and
          its fit, the limits of the analysis and the figures of the other tabs. Fill the identification and the sources
          in the main area.
        </p>
      )}
      {activeTab === 'export' && (
        <p className="text-xs text-pl-muted">
          Handoffs and downloads live in the main area. Everything exports the WORKING state: the Curves tab's
          oil-water set, the Capillary tab's scaled Pc and the Height tab's profile.
        </p>
      )}
    </div>
  );

  const main = (
    <>
      {activeTab === 'curves' && <CurvesResults />}
      {activeTab === 'labdata' && <LabDataResults selectedId={selectedSampleId} />}
      {activeTab === 'capillary' && <CapillaryResults />}
      {activeTab === 'height' && <HeightResults />}
      {activeTab === 'report' && <ScalReportTab />}
      {activeTab === 'export' && <ExportTab />}
    </>
  );

  return (
    <>
      <Helmet>
        <title>SCAL Studio | Petrolord Suite</title>
        <meta
          name="description"
          content="Corey relative permeability curve design, fitting to core data, and Leverett J-function capillary pressure with saturation-height profiles."
        />
      </Helmet>
      <StudioLayout
        header={
          <StudioHeader
            backTo="/dashboard/reservoir"
            backTitle="Back to Reservoir Management"
            icon={FlaskConical}
            iconGradientClass="from-violet-600 to-purple-600"
            title="SCAL Studio"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        headerActions={
          <>
            <Select value={unitSystem} onValueChange={setUnitSystem}>
              <SelectTrigger className="h-8 w-[104px] text-xs" aria-label="Display units" data-testid="scal-unit-system" title={followsProfile ? 'Following your Suite unit profile' : 'Display units of this project'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oilfield">Oilfield</SelectItem>
                <SelectItem value="si">SI</SelectItem>
              </SelectContent>
            </Select>
            <StudioAutoSave isSaving={isSaving} saveError={saveError} lastSaveTime={lastSaveTime} onSave={manualSave} />
            <div className="h-4 w-[1px] bg-pl-border mx-1"></div>
            <StudioHelp
              title="SCAL Studio Guide"
              description="Corey relative permeability and Leverett J-function capillary pressure, validated thin and done properly."
              triggerTitle="SCAL Studio documentation"
            >
              <ScalHelpContent />
            </StudioHelp>
          </>
        }
        sidebarLeft={leftPanel}
        sidebarRight={null}
        main={main}
        notifications={notifications}
        onDismissNotification={removeNotification}
      />
    </>
  );
};

export default function ScalStudio() {
  const profileSystem = useProfileSystem('scal', SCAL_PROFILE_FAMILIES);
  return (
    <div data-testid="scal-theme-scope">
      <ScalStudioProvider sharingStore={SHARING_STORE} profileSystem={profileSystem} build={buildLabel()}>
        <ScalStudioContent />
      </ScalStudioProvider>
    </div>
  );
}
