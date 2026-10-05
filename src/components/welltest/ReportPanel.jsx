// Left rail for the Report tab: interpretation notes, exports and result
// handoffs (WT5): PDF report, project JSON, p*/k/s to Material Balance Studio
// and k to the Waterflood Design Studio via the navigate-state contract.
import React, { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, FileText, Send, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { exportProjectAsJSON, importProjectFromJSON } from '@/utils/savedProjects';
import { exportWellTestPdf, collectReportArgs } from '@/utils/wellTestReportExport';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { SectionLabel } from './primitives';
import { wellTestDataFromContract, WTA_PROJECT_PARAM } from '@/lib/wellTestSource';
import { eorScreeningHref } from '@/lib/eorScreeningLinks';

const ReportPanel = () => {
  const ctx = useWellTestStudio();
  const {
    notes, setNotes, projectName, wellName, addNotification,
    prepared, currentProjectId, wtaRecord,
    serializeInputs, importProjectPayload, manualSave,
  } = ctx;
  const navigate = useNavigate();
  const location = useLocation();
  const importRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  // The export is the saved payload itself, so whatever a project stores
  // (identification, completion, input sources, period notes) travels too.
  const exportJson = () => {
    const result = exportProjectAsJSON({
      ...serializeInputs(),
      id: 'export',
      name: projectName || wellName || 'well-test',
    });
    if (result.success) addNotification('Project exported as JSON.', 'success');
    else addNotification('Export failed', 'error');
  };

  const importJson = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      importProjectPayload(await importProjectFromJSON(file));
    } catch (err) {
      addNotification('That file could not be read as a project export.', 'error');
    }
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const ok = await exportWellTestPdf(collectReportArgs(ctx));
      addNotification(ok ? 'PDF report saved.' : 'PDF export failed', ok ? 'success' : 'error');
    } finally {
      setExporting(false);
    }
  };

  // WTA-U1-012: the sends carry the wta-1 record of the interpretation (k
  // with its method, interval and regression status; skin split; p* with
  // what it is and is not; the datum) in router state, and name the saved
  // project in the URL so the receiver reads the same record by id after a
  // refresh. An unsaved workspace sends router state only, and says so.
  const handoff = wellTestDataFromContract(wtaRecord);
  const pBar = handoff?.pAvg_psia;
  const kBest = handoff?.k_md;
  const byId = currentProjectId ? `?${WTA_PROJECT_PARAM}=${encodeURIComponent(currentProjectId)}` : '';

  const sendToReservoirBalance = () => {
    navigate(`/dashboard/apps/reservoir/reservoir-balance${byId}`, { state: { wellTestData: { ...handoff, sentAt: new Date().toISOString() } } });
  };

  const sendToWaterflood = () => {
    navigate(`/dashboard/apps/reservoir/waterflood-design-studio${byId}`, { state: { wellTestData: { ...handoff, sentAt: new Date().toISOString() } } });
  };

  // EOR-U2-002: EOR Screening reads the saved wta-1 record by id (permeability
  // and the average pressure), so the project is saved first and nothing
  // travels in router state.
  const sendToEor = async () => {
    const href = eorScreeningHref('wta', currentProjectId, { inHarness: location.pathname.startsWith('/dev/') });
    if (!href) { addNotification('Save the project first: EOR Screening reads it by id.', 'info'); return; }
    if (manualSave && !(await manualSave())) { addNotification('The project could not be saved first, so EOR Screening would read an older record.', 'error'); return; }
    navigate(href);
  };

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Interpretation notes</SectionLabel>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Model choice rationale, data quality remarks, boundary observations…"
          className="min-h-[160px] text-sm"
        />
        <p className="text-[11px] text-pl-muted mt-2">Notes are saved with the project and appear in the report summary.</p>
      </section>

      <section>
        <SectionLabel>Export</SectionLabel>
        <div className="space-y-2">
          <Button size="sm" variant="outline" className="w-full" onClick={exportPdf} disabled={!prepared.points.length || exporting}>
            <FileText className="w-4 h-4 mr-2" /> Export PDF report
          </Button>
          <Button size="sm" variant="outline" className="w-full" onClick={exportJson}>
            <Download className="w-4 h-4 mr-2" /> Export project JSON
          </Button>
          <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={importJson} data-testid="wts-import-json" />
          <Button size="sm" variant="outline" className="w-full" onClick={() => importRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" /> Import project JSON
          </Button>
        </div>
      </section>

      <section>
        <SectionLabel>Send results</SectionLabel>
        <div className="space-y-2">
          <Button
            size="sm" variant="outline" className="w-full"
            disabled={!Number.isFinite(pBar)}
            onClick={sendToReservoirBalance}
          >
            <Send className="w-4 h-4 mr-2" /> Pressure, k, skin to Material Balance
          </Button>
          <Button
            size="sm" variant="outline" className="w-full"
            disabled={!Number.isFinite(kBest)}
            onClick={sendToWaterflood}
          >
            <Send className="w-4 h-4 mr-2" /> k to Waterflood Design Studio
          </Button>
          <Button
            size="sm" variant="outline" className="w-full"
            disabled={!Number.isFinite(kBest) || !currentProjectId}
            title={currentProjectId ? undefined : 'Save the project first: EOR Screening reads it by id'}
            onClick={sendToEor}
            data-testid="wts-send-eor"
          >
            <Send className="w-4 h-4 mr-2" /> Send to EOR Screening
          </Button>
        </div>
        <p className="text-[11px] text-pl-muted mt-2" data-testid="wts-send-note">
          Material Balance Studio receives the pressure for a new case; Waterflood Design Studio receives the permeability; EOR Screening reads the permeability and the average pressure from the saved project. Each value travels with its method{currentProjectId ? ' and the saved project, so the receiver can read it again by id.' : '. Save the project first so the receiver can read the results again after a refresh.'}
          {handoff && ` What is sent: k ${Number(handoff.k_md).toPrecision(3)} md (${handoff.kMethod})${Number.isFinite(pBar) ? `, pressure ${Number(pBar).toFixed(1)} psia (${handoff.contract?.pressure?.p_star_psia != null ? 'extrapolated p*, not corrected to an average pressure' : 'initial pressure as entered'})` : ''}.`}
        </p>
      </section>
    </div>
  );
};

export default ReportPanel;
