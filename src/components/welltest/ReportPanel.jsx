// Left rail for the Report tab: interpretation notes and export.
import React from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { exportProjectAsJSON } from '@/utils/savedProjects';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { SectionLabel } from './primitives';

const ReportPanel = () => {
  const { notes, setNotes, projectName, wellName, reservoirInputs, testConfig, gaugeRows, rateRows, matchInputs, windows, addNotification } = useWellTestStudio();

  const exportJson = () => {
    const result = exportProjectAsJSON({
      id: 'export',
      name: projectName || wellName || 'well-test',
      wellName, reservoirInputs, testConfig, gaugeRows, rateRows, matchInputs, windows, notes,
    });
    if (result.success) addNotification('Project exported as JSON.', 'success');
    else addNotification('Export failed', 'error');
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
        <Button size="sm" variant="outline" className="w-full border-slate-700" onClick={exportJson}>
          <Download className="w-4 h-4 mr-2" /> Export project JSON
        </Button>
        <p className="text-[11px] text-slate-500 mt-2">PDF report export and result handoffs to Reservoir Balance arrive in WT5.</p>
      </section>
    </div>
  );
};

export default ReportPanel;
