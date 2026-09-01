// Deliverables dialog (Petrophysics Studio PS2, audit A1): the four
// ways an interpretation leaves the app — curves CSV, zone-summary
// CSV, LAS 2.0, and the branded PDF summary report. Assembly lives in
// services/petroExport.js and services/petroReport.js; this dialog
// only picks a deliverable and saves the blob, reporting per-item
// failures instead of swallowing them.

import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { saveAs } from 'file-saver';
import { Loader2, FileText, FileSpreadsheet, FileType } from 'lucide-react';
import { curvesCsv, zonesCsv, buildLas, exportBaseName } from '../services/petroExport';
import { buildReport } from '../services/petroReport';

export default function ExportDialog({
  open, onOpenChange, wellName, wellData, outputs, params, zones, summaries, projectId, onStatus,
}) {
  const [busy, setBusy] = useState(null); // which deliverable is building

  const base = exportBaseName(wellName);
  const run = (kind, build) => async () => {
    setBusy(kind);
    try {
      await build();
      onStatus(`Exported ${kind}.`);
    } catch (e) {
      onStatus(e.message);
    } finally {
      setBusy(null);
    }
  };

  const items = [
    {
      kind: 'curves CSV',
      testid: 'petro-export-csv',
      icon: FileSpreadsheet,
      label: 'Curves CSV',
      note: 'Depth, mapped inputs and computed outputs; blank cells for nulls.',
      build: () => saveAs(
        new Blob([curvesCsv(wellData, outputs)], { type: 'text/csv;charset=utf-8;' }),
        `${base}_curves.csv`,
      ),
    },
    {
      kind: 'zones CSV',
      testid: 'petro-export-zones',
      icon: FileSpreadsheet,
      label: 'Zone summary CSV',
      note: 'Gross, net, N/G and net-weighted averages per zone at the current parameters.',
      build: () => saveAs(
        new Blob([zonesCsv(zones, summaries)], { type: 'text/csv;charset=utf-8;' }),
        `${base}_zones.csv`,
      ),
    },
    {
      kind: 'LAS',
      testid: 'petro-export-las',
      icon: FileType,
      label: 'LAS 2.0',
      note: 'Inputs plus VSH, PHIE, SW and PAY, with the parameter set in ~Parameter.',
      build: () => saveAs(
        new Blob([buildLas(wellData, outputs, params, { wellName, projectId })], { type: 'text/plain;charset=utf-8;' }),
        `${base}_interpretation.las`,
      ),
    },
    {
      kind: 'PDF report',
      testid: 'petro-export-pdf',
      icon: FileText,
      label: 'PDF summary report',
      note: 'Parameters, methods with citations, zone table and provenance.',
      build: async () => {
        const doc = await buildReport({ wellName, wellData, params, zones, summaries, projectId });
        doc.save(`${base}_petrophysics_report.pdf`);
      },
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-export-dialog">
        <DialogHeader>
          <DialogTitle>Export deliverables</DialogTitle>
          <DialogDescription className="text-slate-400">
            {wellName} at the parameters now applied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          {items.map(({ kind, testid, icon: Icon, label, note, build }) => (
            <button
              key={kind}
              type="button"
              data-testid={testid}
              disabled={!!busy}
              className="w-full flex items-start gap-2.5 rounded border border-slate-700 px-3 py-2 text-left
                hover:bg-slate-800 disabled:opacity-50"
              onClick={run(kind, build)}
            >
              {busy === kind
                ? <Loader2 className="w-4 h-4 mt-0.5 animate-spin text-cyan-400" />
                : <Icon className="w-4 h-4 mt-0.5 text-cyan-400" />}
              <span>
                <span className="block text-sm text-slate-200">{label}</span>
                <span className="block text-[11px] text-slate-500">{note}</span>
              </span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
