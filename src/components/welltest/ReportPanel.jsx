// Left rail for the Report tab: interpretation notes, exports and result
// handoffs (WT5): PDF report, project JSON, p-bar/k/s to Reservoir Balance
// and k to the Waterflood Design Studio via the navigate-state contract.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { exportProjectAsJSON } from '@/utils/savedProjects';
import { exportWellTestPdf } from '@/utils/wellTestReportExport';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { SectionLabel } from './primitives';

const ReportPanel = () => {
  const {
    notes, setNotes, projectName, wellName, reservoirInputs, testConfig,
    gaugeRows, rateRows, matchInputs, windows, addNotification,
    configSpec, reservoirSpec, prepared, model, matchParams, fitResult,
    derivedKpis, semilogResult, sqrtResult, pssResult, multiRateResult,
    deliverabilityResult, regimes, rtaResult, rtaRows, rtaWindows,
    deliverabilityInputs, unitSystem,
  } = useWellTestStudio();
  const navigate = useNavigate();

  const exportJson = () => {
    const result = exportProjectAsJSON({
      id: 'export',
      name: projectName || wellName || 'well-test',
      wellName, reservoirInputs, testConfig, gaugeRows, rateRows, matchInputs, windows, notes,
      deliverabilityInputs, rtaRows, rtaWindows, unitSystem,
    });
    if (result.success) addNotification('Project exported as JSON.', 'success');
    else addNotification('Export failed', 'error');
  };

  const exportPdf = () => {
    const ok = exportWellTestPdf({
      projectName, wellName,
      config: configSpec.config,
      reservoir: reservoirSpec.reservoir,
      prepared, model, matchParams, fitResult, derivedKpis,
      semilogResult, sqrtResult, pssResult, multiRateResult, deliverabilityResult,
      rtaResult, regimes, notes, unitSystem,
    });
    addNotification(ok ? 'PDF report saved.' : 'PDF export failed', ok ? 'success' : 'error');
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
          className="min-h-[160px] bg-slate-800 border-slate-700 text-sm"
        />
        <p className="text-[11px] text-slate-500 mt-2">Notes are saved with the project and appear in the report summary.</p>
      </section>

      <section>
        <SectionLabel>Export</SectionLabel>
        <div className="space-y-2">
          <Button size="sm" variant="outline" className="w-full border-slate-700" onClick={exportPdf} disabled={!prepared.points.length}>
            <FileText className="w-4 h-4 mr-2" /> Export PDF report
          </Button>
          <Button size="sm" variant="outline" className="w-full border-slate-700" onClick={exportJson}>
            <Download className="w-4 h-4 mr-2" /> Export project JSON
          </Button>
        </div>
      </section>

      <section>
        <SectionLabel>Send results</SectionLabel>
        <div className="space-y-2">
          <Button
            size="sm" variant="outline" className="w-full border-slate-700"
            disabled={!Number.isFinite(pBar)}
            onClick={sendToReservoirBalance}
          >
            <Send className="w-4 h-4 mr-2" /> p̄, k, s to Reservoir Balance
          </Button>
          <Button
            size="sm" variant="outline" className="w-full border-slate-700"
            disabled={!Number.isFinite(kBest)}
            onClick={sendToWaterflood}
          >
            <Send className="w-4 h-4 mr-2" /> k to Waterflood Design Studio
          </Button>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Reservoir Balance receives the average pressure for a new material balance case; Waterflood Design receives the tested permeability for the displacement inputs.
        </p>
      </section>
    </div>
  );
};

export default ReportPanel;
