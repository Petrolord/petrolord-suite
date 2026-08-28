// Ledger and well-test CSV intake for the Surveillance Studio (P2).
// The parsers are the P1 importers (utils/production/csvImport); the
// writes go through the spine, so what lands here is what every other
// production app reads. Honest report: every skipped row and every
// adjustment is shown, nothing is silent.
import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Download, FileWarning, CheckCircle2, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSurveillance } from '@/contexts/ProductionSurveillanceContext';
import {
  parseDailyProductionCSV, dailyProductionTemplateCSV,
  parseWellTestCSV, wellTestTemplateCSV,
} from '@/utils/production/csvImport';

const download = (text, filename) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const ReportBlock = ({ report }) => {
  if (!report) return null;
  const hasProblems = report.skipped.length > 0 || report.warnings.length > 0;
  if (!hasProblems) return null;
  return (
    <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 space-y-1">
      <div className="flex items-center gap-2 font-semibold"><FileWarning className="w-4 h-4" /> Import report</div>
      {report.warnings.map((w, i) => <div key={`w${i}`}>{w}</div>)}
      {report.skipped.slice(0, 8).map((s, i) => <div key={`s${i}`}>Row {s.row}: {s.reason}</div>)}
      {report.skipped.length > 8 && <div>...and {report.skipped.length - 8} more skipped rows.</div>}
    </div>
  );
};

const Dropzone = ({ onText, disabled, title, hint }) => {
  const onDrop = (accepted) => {
    const file = accepted?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onText(String(ev.target.result));
    reader.readAsText(file);
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] },
    maxFiles: 1,
    disabled,
  });
  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors ${
        disabled ? 'border-slate-800 opacity-50 cursor-not-allowed'
          : isDragActive ? 'border-sky-500 bg-sky-500/10 cursor-pointer' : 'border-slate-700 hover:border-slate-500 cursor-pointer'
      }`}
    >
      <input {...getInputProps()} />
      <Upload className="w-5 h-5 mx-auto text-slate-500 mb-2" />
      <p className="text-sm text-slate-400">{title}</p>
      <p className="text-xs text-slate-600 mt-1">{hint}</p>
    </div>
  );
};

const ImportPanel = () => {
  const {
    currentField, canEditField, importing, ledgerRows, wells,
    importDailyRows, importTests, addNotification,
  } = useSurveillance();
  const [dailyReport, setDailyReport] = useState(null);
  const [testReport, setTestReport] = useState(null);

  const disabled = !currentField || !canEditField || importing;

  const handleDaily = (text) => {
    const { rows, report } = parseDailyProductionCSV(text);
    setDailyReport(report);
    if (!rows.length) {
      addNotification(report.warnings[0] || 'No usable rows in the file', 'error');
      return;
    }
    importDailyRows(rows);
  };

  const handleTests = (text) => {
    const { tests, report } = parseWellTestCSV(text);
    setTestReport(report);
    if (!tests.length) {
      addNotification(report.warnings[0] || 'No usable well tests in the file', 'error');
      return;
    }
    importTests(tests);
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="w-4 h-4 text-sky-400" /> Production data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!currentField && (
          <p className="text-sm text-slate-400">
            Select or create a field in the left rail first. Fields hold the wells, the daily
            ledger, well tests and deferments, and every other production app reads the same data.
          </p>
        )}
        {currentField && !canEditField && (
          <p className="text-sm text-slate-400">
            This field is shared with you read-only. Only its owner can import data.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-sm font-semibold text-slate-200">Daily production ledger</h4>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={disabled}
                onClick={() => handleDaily(dailyProductionTemplateCSV())}>
                Sample data
              </Button>
              <Button variant="outline" size="sm"
                onClick={() => download(dailyProductionTemplateCSV(), 'po_daily_production_template.csv')}>
                <Download className="w-4 h-4 mr-1" /> Template
              </Button>
            </div>
          </div>
          <Dropzone
            onText={handleDaily}
            disabled={disabled}
            title="Drop a ledger CSV here, or click to browse. One row per well per date."
            hint="Recognized columns (aliases welcome): date, well, oil, water, gas, water_inj, gas_inj, hours_on. Units auto-scale from headers (Mscf/MMscf, bbl/Mbbl). Monthly rows land on the first of the month."
          />
          <ReportBlock report={dailyReport} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-sm font-semibold text-slate-200">Well tests</h4>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={disabled}
                onClick={() => handleTests(wellTestTemplateCSV())}>
                Sample data
              </Button>
              <Button variant="outline" size="sm"
                onClick={() => download(wellTestTemplateCSV(), 'po_well_tests_template.csv')}>
                <Download className="w-4 h-4 mr-1" /> Template
              </Button>
            </div>
          </div>
          <Dropzone
            onText={handleTests}
            disabled={disabled}
            title="Drop a well-test CSV here, or click to browse. One row per test."
            hint="Recognized columns: test_date, well, duration_hours, oil_rate, water_rate, gas_rate, thp, choke. Tests validate and factor allocation in the Allocation Studio."
          />
          <ReportBlock report={testReport} />
        </div>

        {currentField && ledgerRows.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {ledgerRows.length.toLocaleString()} ledger rows across {wells.length} well{wells.length === 1 ? '' : 's'} in
              {' '}{currentField.name}. Re-importing a corrected file overwrites the same well-dates in place.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImportPanel;
