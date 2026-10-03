// The production import door (DCA-U1-004, DCA-U1-009; PL2, RL10).
//
// A file is read with the shared typed reader (utils/declineCurve/
// productionImport.js) and NOT imported until the user has seen what was
// read: which column became which stream and in which unit, the decimal
// mark, the date order, the rows left out and why. Questions the file
// cannot settle (day first or month first; a rate or a monthly volume) are
// asked here and nothing is guessed. Import commits the rows to the well.
import React, { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle2, RefreshCw, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readProductionTable, DOOR_UNITS } from '@/utils/declineCurve/productionImport';
import { generateQCSummary } from '@/utils/declineCurve/dataQuality';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { useToast } from '@/components/ui/use-toast';
import { readTabularFile, classifyFile } from '@/lib/tabularFile';

const quote = (c) => {
  const s = String(c ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** A workbook sheet as delimited text, so one reader reads every door. */
const sheetText = (rows) => rows.map((r) => r.map(quote).join(',')).join('\n');

const FIELD_LABELS = { date: 'Date', well: 'Well', oilRate: 'Oil', gasRate: 'Gas', waterRate: 'Water' };

const DCADataImporter = () => {
  const { currentWell, importProductionData, setDataQuality, clearWellData, canWrite } = useDeclineCurve();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [pending, setPending] = useState(null); // { fileName, text }
  const [choices, setChoices] = useState({});

  const result = useMemo(() => (pending ? readProductionTable(pending.text, choices) : null), [pending, choices]);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!currentWell) {
      toast({ title: 'No well selected', description: 'Select or add a well first.', variant: 'destructive' });
      return;
    }
    const file = acceptedFiles[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      let text;
      if (classifyFile(file.name) === 'workbook') {
        const book = await readTabularFile(file);
        text = sheetText(book.sheets[0]?.rows || []);
      } else {
        text = await file.text();
      }
      setChoices({});
      setPending({ fileName: file.name, text });
    } catch (error) {
      console.error(error);
      toast({ title: 'Import Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  }, [currentWell, toast]);

  const commit = () => {
    if (!result?.ok || !currentWell) return;
    const rows = result.rows.map(({ well, ...r }) => r);
    setDataQuality(generateQCSummary(rows));
    const dataMeta = {
      fileName: pending.fileName,
      rowCount: rows.length,
      rowsInFile: result.readBack.rowsInFile,
      skipped: result.readBack.skipped.length,
      importedAt: new Date().toISOString(),
      dateRange: rows.length ? { start: rows[0].date, end: rows[rows.length - 1].date } : null,
      // what the door read, kept with the well and printed in the report (RL5, RL10)
      readBack: {
        delimiter: result.readBack.delimiter,
        decimal: result.readBack.decimal?.mark,
        columns: result.readBack.columns.map((c) => ({ key: c.key, fileColumn: c.fileColumn, unit: c.unit, unitFrom: c.unitFrom })),
        notUsed: result.readBack.notUsed,
        skipped: result.readBack.skipped.slice(0, 50),
        negative: result.readBack.negative,
        volumeRows: result.readBack.volumeRows,
        warnings: result.warnings,
      },
    };
    importProductionData(currentWell.id, rows, dataMeta);
    const streams = ['oilRate', 'gasRate', 'waterRate'].filter((k) => result.mapping[k] !== undefined).map((k) => FIELD_LABELS[k].toLowerCase());
    toast({ title: 'Import Successful', description: `Loaded ${rows.length} of ${result.readBack.rowsInFile} rows (${streams.join(', ')}).` });
    setPending(null);
  };

  const handleClear = () => {
    if (currentWell && clearWellData) {
      clearWellData(currentWell.id);
      toast({ title: 'Data Cleared', description: `${currentWell.name} data removed.` });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'], 'text/plain': ['.txt', '.tsv', '.dat', '.prn'], 'application/vnd.ms-excel': ['.csv', '.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    multiple: false,
    disabled: isProcessing || canWrite === false,
  });

  if (!currentWell) return null;

  const meta = currentWell.dataMeta;
  const hasData = !!(currentWell.data && currentWell.data.length > 0);

  const setUnit = (key, unit) => setChoices((c) => ({ ...c, units: { ...(c.units || {}), [key]: unit } }));

  return (
    <div className="space-y-2" data-testid="dca-import">
      {pending && result ? (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-3 space-y-2 text-xs" data-testid="dca-import-door">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-pl-text truncate">{pending.fileName}</span>
            <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => setPending(null)}>Cancel</Button>
          </div>
          <p className="text-pl-muted" data-testid="dca-import-summary">
            {result.readBack.rowsInFile} rows in the file, {result.rows.length} read; {result.readBack.delimiter} columns; decimal {result.readBack.decimal?.mark === ',' ? 'comma' : 'point'}{result.readBack.decimal?.certain === false ? ' (not settled by the file)' : ''}.
          </p>
          {result.readBack.columns.length > 0 && (
            <table className="w-full text-[11px]" data-testid="dca-import-columns">
              <thead><tr className="text-pl-muted text-left"><th className="pr-2">Field</th><th className="pr-2">File column</th><th>Unit</th></tr></thead>
              <tbody>
                {result.readBack.columns.map((c) => (
                  <tr key={c.key}>
                    <td className="pr-2 text-pl-text">{FIELD_LABELS[c.key] || c.label}</td>
                    <td className="pr-2 font-pl-mono">{c.fileColumn}</td>
                    <td>
                      {['oilRate', 'gasRate', 'waterRate'].includes(c.key) ? (
                        <select
                          aria-label={`${FIELD_LABELS[c.key]} unit`}
                          className="h-6 rounded border border-pl-border bg-pl-surface text-pl-text text-[11px]"
                          value={result.units[c.key]}
                          onChange={(e) => setUnit(c.key, e.target.value)}
                          data-testid={`dca-import-unit-${c.key}`}
                        >
                          {DOOR_UNITS[c.key === 'gasRate' ? 'gas' : 'liquid'].map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
                        </select>
                      ) : c.unit}
                      {c.unitFrom ? <span className="text-pl-muted"> ({c.unitFrom === 'header' ? 'from the header' : c.unitFrom === 'chosen' ? 'chosen' : c.unitFrom === 'ask' ? 'choose' : c.unitFrom === 'assumed' ? 'assumed' : c.unitFrom})</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.questions.map((q, i) => (
            <div key={i} className="rounded border border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text p-2 space-y-1" data-testid={`dca-import-question-${q.kind}`}>
              <p>{q.text}</p>
              {q.kind === 'dateOrder' && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setChoices((c) => ({ ...c, dateOrder: 'dmy' }))}>Day first</Button>
                  <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setChoices((c) => ({ ...c, dateOrder: 'mdy' }))}>Month first</Button>
                </div>
              )}
              {q.kind === 'decimalMark' && (
                <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setChoices((c) => ({ ...c, decimal: q.assumed === ',' ? '.' : ',' }))}>
                  Read with a decimal {q.assumed === ',' ? 'point' : 'comma'}
                </Button>
              )}
              {q.kind === 'rateOrVolume' && (
                <div className="flex flex-wrap gap-2">
                  {q.options.map((key) => {
                    const def = DOOR_UNITS[q.key === 'gasRate' ? 'gas' : 'liquid'].find((u) => u.key === key);
                    return <Button key={key} size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setUnit(q.key, key)}>{def?.label || key}</Button>;
                  })}
                </div>
              )}
            </div>
          ))}
          {result.warnings.map((w, i) => <p key={i} className="text-pl-warning-text">{w}</p>)}
          {result.readBack.notUsed.length > 0 && (
            <p className="text-pl-muted">Not used: {result.readBack.notUsed.map((c) => `${c.name} (${c.reason})`).join('; ')}.</p>
          )}
          {result.readBack.skipped.length > 0 && (
            <details className="text-pl-muted" data-testid="dca-import-skipped">
              <summary>{result.readBack.skipped.length} row(s) or cell(s) left out</summary>
              <ul className="list-disc pl-4">
                {result.readBack.skipped.slice(0, 20).map((s, i) => <li key={i}>Line {s.line}: {s.reason}</li>)}
              </ul>
            </details>
          )}
          {result.refusal ? (
            <p className="text-pl-danger-text flex gap-1" data-testid="dca-import-refusal"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{result.refusal}</p>
          ) : null}
          <Button size="sm" className="w-full h-7 text-xs" disabled={!result.ok} onClick={commit} data-testid="dca-import-commit">
            Import {result.rows.length} rows to {currentWell.name}
          </Button>
        </div>
      ) : hasData ? (
        <div className="rounded-lg border border-pl-success/40 bg-pl-success-bg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="text-pl-success-text mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-pl-success-text truncate">{meta?.fileName || 'Production data'}</div>
              <div className="text-[10px] text-pl-muted mt-0.5">
                {(meta?.rowCount ?? currentWell.data.length).toLocaleString()} records
                {meta?.dateRange && ` · ${meta.dateRange.start} to ${meta.dateRange.end}`}
                {Number.isFinite(meta?.skipped) && meta.skipped > 0 ? ` · ${meta.skipped} left out at import` : ''}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <div {...getRootProps()} className="flex-1">
              <input {...getInputProps()} />
              <Button variant="outline" size="sm" className="w-full h-7 text-[11px] gap-1" disabled={canWrite === false}>
                <RefreshCw size={11} /> Replace File
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={canWrite === false}
              className="h-7 text-[11px] gap-1 text-pl-muted hover:text-pl-danger-text"
            >
              <X size={11} /> Clear
            </Button>
          </div>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-pl-primary bg-pl-primary/10' : 'border-pl-border hover:border-pl-border-strong'}
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-2 text-pl-muted">
            <Upload size={24} />
            <p className="text-sm">{isProcessing ? 'Reading...' : 'Drop a production file here or click to choose one'}</p>
            <span className="text-xs text-pl-muted">CSV, text or Excel: a date column and oil, gas or water rates or monthly volumes</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DCADataImporter;
