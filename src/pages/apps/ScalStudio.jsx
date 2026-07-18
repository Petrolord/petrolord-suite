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
import { SectionLabel } from '@/components/waterflooddesign/primitives';

const TABS = [
  { value: 'curves', label: 'Curves' },
  { value: 'labdata', label: 'Lab Data' },
  { value: 'capillary', label: 'Capillary' },
  { value: 'height', label: 'Height & Saturation' },
  { value: 'export', label: 'Export' },
];

const ScalStudioContent = () => {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.value === requested) ? requested : 'curves',
  );
  // Lab Data tab selection (page-level so panel and results stay in step).
  const [selectedSampleId, setSelectedSampleId] = useState(null);
  const {
    projects, currentProjectId, createProject, openProject, deleteProject,
    manualSave, isSaving, saveError, lastSaveTime,
    notifications, removeNotification,
  } = useScalStudio();

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
        />
      </section>
      {activeTab === 'curves' && <CurvesPanel />}
      {activeTab === 'labdata' && (
        <LabDataPanel selectedId={selectedSampleId} onSelect={setSelectedSampleId} />
      )}
      {activeTab === 'capillary' && <CapillaryPanel />}
      {activeTab === 'height' && <HeightPanel />}
      {activeTab === 'export' && (
        <p className="text-xs text-slate-500">
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
            <StudioAutoSave isSaving={isSaving} saveError={saveError} lastSaveTime={lastSaveTime} onSave={manualSave} />
            <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>
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
  return (
    <ScalStudioProvider>
      <ScalStudioContent />
    </ScalStudioProvider>
  );
}
