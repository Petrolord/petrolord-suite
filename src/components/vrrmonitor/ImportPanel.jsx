// Per-well production/injection CSV importer for the VRR Monitor (V2).
// DataHub-style UX: dropzone, alias/unit-aware parser, honest per-row
// report (every skip and adjustment listed), template download whose
// sample volumes reproduce the jest-pinned engine fixture oracle.
import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Download, Trash2, FileWarning, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { parseVrrWellCSV, vrrTemplateCSV } from '@/utils/vrr/csvImport';

const ImportPanel = () => {
  const { inputs, isImported, ledgerWells, importWellRows, clearImported, addNotification } = useVrrMonitor();
  const [report, setReport] = useState(null);

  const handleText = (text, name) => {
    const { rows, report: r } = parseVrrWellCSV(text);
    setReport(r);
    if (!rows.length) {
      addNotification(r.warnings[0] || 'No usable rows in the file', 'error');
      return;
    }
    importWellRows(rows, name);
  };

  const onDrop = (accepted) => {
    const file = accepted?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleText(String(ev.target.result), file.name);
    reader.readAsText(file);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] },
    maxFiles: 1,
  });

  const downloadTemplate = () => {
    const blob = new Blob([vrrTemplateCSV()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vrr_well_ledger_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const loadTemplateSample = () => handleText(vrrTemplateCSV(), 'the sample ledger');

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base">Import per-well data</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadTemplateSample}>Sample wells</Button>
          <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="w-4 h-4 mr-1" /> Template</Button>
          {isImported && (
            <Button variant="outline" size="sm" className="text-slate-400 hover:text-red-400" onClick={() => { clearImported(); setReport(null); }}>
              <Trash2 className="w-4 h-4 mr-1" /> Clear import
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 hover:border-slate-500'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="w-6 h-6 mx-auto text-slate-500 mb-2" />
          <p className="text-sm text-slate-400">
            Drop a CSV here, or click to browse. One row per well per date (daily or monthly).
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Recognized columns (aliases welcome): date, well, oil, water, gas, water_inj, gas_inj.
            Units auto-scale from headers (Mscf/MMscf/Bscf, bbl/Mbbl).
          </p>
        </div>

        {isImported && (
          <div className="flex items-start gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {inputs.wellRows.length.toLocaleString()} well-rows active ({ledgerWells.producers.length} producer{ledgerWells.producers.length === 1 ? '' : 's'}, {ledgerWells.injectors.length} injector{ledgerWells.injectors.length === 1 ? '' : 's'}).
              The dashboard now reads the imported ledger; manual grid entries are ignored until you clear the import.
            </span>
          </div>
        )}

        {report && (report.skipped.length > 0 || report.warnings.length > 0) && (
          <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 space-y-1">
            <div className="flex items-center gap-2 font-semibold"><FileWarning className="w-4 h-4" /> Import report</div>
            {report.warnings.map((w, i) => <div key={`w${i}`}>{w}</div>)}
            {report.skipped.slice(0, 8).map((s, i) => <div key={`s${i}`}>Row {s.row}: {s.reason}</div>)}
            {report.skipped.length > 8 && <div>...and {report.skipped.length - 8} more skipped rows.</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImportPanel;
