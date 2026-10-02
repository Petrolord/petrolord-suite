// Left rail for the Report tab: interpretation notes, exports and result
// handoffs (WT5): PDF report, project JSON, p-bar/k/s to Reservoir Balance
// and k to the Waterflood Design Studio via the navigate-state contract.
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, Send, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { exportProjectAsJSON, importProjectFromJSON } from '@/utils/savedProjects';
import { exportWellTestPdf, collectReportArgs } from '@/utils/wellTestReportExport';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { SectionLabel } from './primitives';

const ReportPanel = () => {
  const ctx = useWellTestStudio();
  const {
    notes, setNotes, projectName, wellName, addNotification,
    reservoirSpec, prepared, derivedKpis, semilogResult,
    serializeInputs, importProjectPayload,
  } = ctx;
  const navigate = useNavigate();
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

  // p-bar for material balance: extrapolated p* when the test gives one,
  // otherwise the entered initial pressure.
  const pBar = Number.isFinite(semilogResult?.pStar)
    ? semilogResult.pStar
    : reservoirSpec.reservoir?.pi;
  const kBest = derivedKpis?.k;
  const skinBest = derivedKpis?.skin;

  const sendToReservoirBalance = () => {
    navigate('/dashboard/apps/reservoir/reservoir-balance', {
      state: {
        wellTestData: {
          source: projectName || wellName || 'Well Test Analysis Studio',
          wellName,
          pAvg_psia: pBar,
          // how the pressure was obtained and when it was sent, so the
          // receiving report can cite it (reviewer lens RL11)
          pressureMethod: Number.isFinite(semilogResult?.pStar) ? 'extrapolated p* of the semilog straight line' : 'initial pressure as entered on the test',
          sentAt: new Date().toISOString(),
          k_md: kBest,
          skin: skinBest,
          fluid: reservoirSpec.reservoir?.fluid || 'oil',
          tempF: reservoirSpec.reservoir?.fluid === 'gas' ? reservoirSpec.reservoir.tempR - 460 : undefined,
        },
      },
    });
  };

  const sendToWaterflood = () => {
    navigate('/dashboard/apps/reservoir/waterflood-design-studio', {
      state: {
        wellTestData: {
          source: projectName || wellName || 'Well Test Analysis Studio',
          wellName,
          k_md: kBest,
        },
      },
    });
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
            <Send className="w-4 h-4 mr-2" /> p̄, k, s to Reservoir Balance
          </Button>
          <Button
            size="sm" variant="outline" className="w-full"
            disabled={!Number.isFinite(kBest)}
            onClick={sendToWaterflood}
          >
            <Send className="w-4 h-4 mr-2" /> k to Waterflood Design Studio
          </Button>
        </div>
        <p className="text-[11px] text-pl-muted mt-2">
          Reservoir Balance receives the average pressure for a new material balance case; Waterflood Design receives the tested permeability for the displacement inputs.
        </p>
      </section>
    </div>
  );
};

export default ReportPanel;
