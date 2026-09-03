// Deliverables dialog (Petrophysics Studio PS2, audit A1): the four
// ways an interpretation leaves the app — curves CSV, zone-summary
// CSV, LAS 2.0, and the branded PDF summary report. Assembly lives in
// services/petroExport.js and services/petroReport.js; this dialog
// only picks a deliverable and saves the blob, reporting per-item
// failures instead of swallowing them.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { saveAs } from 'file-saver';
import { Loader2, FileText, FileSpreadsheet, FileType, FileImage, Package } from 'lucide-react';
import PackageExportDialog from '@/components/portability/PackageExportDialog';
import { curvesCsv, zonesCsv, buildLas, exportBaseName, trackPlotPng } from '../services/petroExport';
import { buildReport } from '../services/petroReport';

/** @param {Object} [p.well] the registry well row (survey + KB) for TVD /
 *  TVDSS columns; @param {'m'|'ft'} [p.depthUnit] the workstation's display
 *  unit, the export's initial unit (PT2) */
export default function ExportDialog({
  open, onOpenChange, wellName, wellData, outputs, params, zones, summaries, projectId, projectName, onStatus,
  well = null, depthUnit = 'm',
}) {
  const [busy, setBusy] = useState(null); // which deliverable is building
  // depth options (PT2): unit, which depth columns travel, which is DEPT
  const [unit, setUnit] = useState(depthUnit);
  const [cols, setCols] = useState({ md: true, tvd: false, tvdss: false });
  const [primary, setPrimary] = useState('md');
  useEffect(() => { setUnit(depthUnit); }, [depthUnit, open]);
  const columns = ['md', 'tvd', 'tvdss'].filter((k) => cols[k]);
  const depthOpts = { well, depthUnit: unit, columns: columns.length ? columns : ['md'], primary: columns.includes(primary) ? primary : (columns[0] || 'md') };
  const hasSurvey = Array.isArray(well?.deviation) && well.deviation.length >= 2;
  const depthNote = [
    columns.some((k) => k !== 'md') ? (hasSurvey ? `TVD from the ${well.deviation.length}-station survey` : 'no survey: TVD assumes a vertical well') : null,
    columns.includes('tvdss') ? `TVDSS uses KB ${Number(well?.kb_m ?? 0).toFixed(2)} m` : null,
    unit === 'ft' ? 'depths in feet; DT stays US/M' : null,
  ].filter(Boolean).join(' · ');
  const [packageOpen, setPackageOpen] = useState(false); // PP1 sibling dialog
  const packagePreselect = useMemo(
    () => ({ wells: wellData?.wellId ? [wellData.wellId] : [], name: projectName || wellName || '' }),
    [wellData?.wellId, projectName, wellName],
  );

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
      note: 'Depth columns as set above, mapped inputs and computed outputs; blank cells for nulls.',
      build: () => saveAs(
        new Blob([curvesCsv(wellData, outputs, depthOpts)], { type: 'text/csv;charset=utf-8;' }),
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
        new Blob([zonesCsv(zones, summaries, depthOpts)], { type: 'text/csv;charset=utf-8;' }),
        `${base}_zones.csv`,
      ),
    },
    {
      kind: 'LAS',
      testid: 'petro-export-las',
      icon: FileType,
      label: 'LAS 2.0',
      note: 'DEPT plus any extra depth columns, inputs, VSH, PHIE, SW and PAY, with the parameter set in ~Parameter.',
      build: () => saveAs(
        new Blob([buildLas(wellData, outputs, params, { wellName, projectId, ...depthOpts })], { type: 'text/plain;charset=utf-8;' }),
        `${base}_interpretation.las`,
      ),
    },
    {
      kind: 'track plot PNG',
      testid: 'petro-export-png',
      icon: FileImage,
      label: 'Track plot PNG',
      note: 'The track view exactly as rendered, with a branded title band.',
      build: async () => {
        const canvas = document.querySelector('[data-testid="petro-tracks-canvas"]');
        if (!canvas) throw new Error('Open the Tracks view first, then export the plot.');
        const blob = await trackPlotPng({
          canvas,
          title: `${wellName} · Petrophysics Studio · ${new Date().toISOString().slice(0, 10)}`,
        });
        saveAs(blob, `${base}_tracks.png`);
      },
    },
    {
      kind: 'project package',
      testid: 'petro-export-pld',
      icon: Package,
      label: 'Project package (.pld)',
      note: 'This well, its curves, tops and zones, and this interpretation as a portable Petrolord package with LAS and CSV sidecars.',
      build: async () => { setPackageOpen(true); },
    },
    {
      kind: 'PDF report',
      testid: 'petro-export-pdf',
      icon: FileText,
      label: 'PDF summary report',
      note: 'Parameters, methods with citations, zone table and provenance.',
      build: async () => {
        const doc = await buildReport({ wellName, wellData, params, zones, summaries, projectId, depthUnit: unit, well, columns: depthOpts.columns });
        doc.save(`${base}_petrophysics_report.pdf`);
      },
    },
  ];

  return (
    <>
    <PackageExportDialog
      open={packageOpen}
      onOpenChange={setPackageOpen}
      preselect={packagePreselect}
      onStatus={onStatus}
    />
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-export-dialog">
        <DialogHeader>
          <DialogTitle>Export deliverables</DialogTitle>
          <DialogDescription className="text-slate-400">
            {wellName} at the parameters now applied.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded border border-slate-800 bg-slate-950/40 px-2.5 py-2 space-y-1.5 text-xs" data-testid="petro-export-options">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-500">Depths in</span>
            <button type="button" data-testid="petro-export-unit"
              className="px-2 py-0.5 rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
              onClick={() => setUnit((u) => (u === 'm' ? 'ft' : 'm'))} title="Unit of every depth column in the deliverables">
              {unit === 'ft' ? 'feet' : 'metres'}
            </button>
            <span className="text-slate-500">Columns</span>
            {['md', 'tvd', 'tvdss'].map((k) => (
              <label key={k} className="flex items-center gap-1 text-slate-300">
                <input type="checkbox" checked={!!cols[k]} data-testid={`petro-export-col-${k}`}
                  onChange={(e) => setCols((c) => ({ ...c, [k]: e.target.checked }))} />
                {k.toUpperCase()}
              </label>
            ))}
            <label className="flex items-center gap-1 text-slate-300">
              DEPT is
              <select className="rounded bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5" value={depthOpts.primary}
                onChange={(e) => setPrimary(e.target.value)} data-testid="petro-export-primary">
                {depthOpts.columns.map((k) => <option key={k} value={k}>{k.toUpperCase()}</option>)}
              </select>
            </label>
          </div>
          {depthNote && <div className="text-[11px] text-slate-500" data-testid="petro-export-depth-note">{depthNote}</div>}
        </div>

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
    </>
  );
}
