// Per-well production/injection import for the VRR Monitor (V2; VRR-U1 on
// the shared typed reader). The door reads the file, shows what it read
// (each field's column, unit and where the unit came from, the columns not
// used, every row left out), asks what the file cannot settle (day or month
// first, a decimal mark, a unit) and imports only on the user's word.
import React, { useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Download, Trash2, FileWarning, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { THEMED_TONE } from '@/components/studio/studioTheme';
import {
  parseVrrWellCSV, readLedgerFile, vrrTemplateCSV, DOOR_UNITS, LEDGER_COLUMNS, DAYS_ON_UNITS,
} from '@/utils/vrr/csvImport';
import { readTabularFile } from '@/lib/tabularFile';
import { downloadText } from './download';

const SAMPLE_NOTE = 'The built-in sample ledger of the app (3 months, 2 producers, 2 injectors; the engine test fixture, illustrative volumes).';
const FROM_WORDS = { header: 'from the header', chosen: 'chosen', assumed: 'assumed: no unit in the header', file: 'settled by the file', user: 'chosen' };

/** What the project keeps about an import, for the report. */
export const importInfoOf = (res, extra = {}) => ({
  rowsRead: res.report.imported,
  skipped: res.report.skipped.length,
  wells: res.report.wells,
  firstDate: res.report.firstDate,
  lastDate: res.report.lastDate,
  readBack: res.report.readBack,
  notUsed: res.report.notUsed,
  warnings: res.report.warnings,
  units: res.units,
  rateBasis: res.rateBasis || null,
  daysOnUnit: res.daysOnUnit || null,
  ...extra,
});

const ImportPanel = () => {
  const { inputs, isImported, ledgerWells, importWellRows, clearImported, addNotification, u, canWrite } = useVrrMonitor();
  const [file, setFile] = useState(null); // { name, loaded } (VRR-U2-006: a text file or a workbook)
  const [choices, setChoices] = useState({});
  const res = useMemo(() => (file ? readLedgerFile(file.loaded, { ...choices, system: u.system }) : null), [file, choices, u.system]);

  const onDrop = async (accepted) => {
    const f = accepted?.[0];
    if (!f) return;
    try {
      const loaded = await readTabularFile(f);
      setChoices({});
      setFile({ name: f.name, loaded });
    } catch (e) {
      addNotification(`${f.name}: ${e.message}`, 'error');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'], 'text/plain': ['.txt', '.tsv', '.dat', '.prn'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'], 'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  const accept = () => {
    if (!res?.ok) return;
    importWellRows(res.rows, res.sheet ? `${file.name}, sheet "${res.sheet}"` : file.name, importInfoOf(res));
    setFile(null);
  };

  const loadTemplateSample = () => {
    const r = parseVrrWellCSV(vrrTemplateCSV());
    importWellRows(r.rows, 'the sample ledger', importInfoOf(r, { sample: SAMPLE_NOTE }));
  };

  const setUnit = (key, unit) => setChoices((c) => ({ ...c, units: { ...(c.units || {}), [key]: unit } }));
  const setMap = (key, index) => setChoices((c) => ({ ...c, mapping: { ...(c.mapping || {}), [key]: index === '' ? null : Number(index) } }));
  const r = res?.report;

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base">Import per-well data</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadTemplateSample} disabled={!canWrite}>Sample wells</Button>
          <Button variant="outline" size="sm" onClick={() => downloadText(vrrTemplateCSV(), 'vrr_well_ledger_template.csv')}><Download className="w-4 h-4 mr-1" /> Template</Button>
          {isImported && (
            <Button variant="outline" size="sm" className="hover:text-pl-danger-text" onClick={() => { clearImported(); setFile(null); }} disabled={!canWrite}>
              <Trash2 className="w-4 h-4 mr-1" /> Clear import
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-pl-primary bg-pl-primary/10' : 'border-pl-border-strong bg-pl-sunken/40 hover:border-pl-primary'
          }`}
        >
          <input {...getInputProps()} data-testid="vrr-ledger-file" />
          <Upload className="w-6 h-6 mx-auto text-pl-muted mb-2" />
          <p className="text-sm text-pl-text">
            Drop a CSV, text table or Excel workbook here, or click to browse. One row per well per date (daily or monthly).
          </p>
          <p className="text-xs text-pl-muted mt-1">
            Any separator and decimal mark; columns found by name (date, well, oil, water, gas, water injected, gas
            injected, and producing days or hours); units read from the header (bbl, Mbbl, sm3, Mscf, MMscf, 10^3 sm3,
            or a daily rate such as BOPD), or chosen below. With a producing-days column, rates are read per producing
            day unless you choose calendar-day averages.
          </p>
        </div>

        {res && (
          <div className="rounded-md border border-pl-border p-3 space-y-2 text-xs" data-testid="vrr-import-readback">
            <div className="font-semibold text-pl-text">Read from {file.name}{res.sheet ? `, sheet "${res.sheet}"` : ''}: {r.totalRows} rows{res.sheet ? '' : `, ${r.delimiter} separated`}, decimal {r.decimal?.mark === ',' ? 'comma' : 'point'}</div>
            {res.columns.length > 0 && (
              <table className="w-full">
                <thead><tr className="text-pl-muted text-left"><th>Field</th><th>Column</th><th>Read as</th><th>Values</th></tr></thead>
                <tbody>
                  {LEDGER_COLUMNS.map((c) => {
                    const idx = res.mapping[c.key];
                    const rb = r.readBack.find((x) => x.key === c.key);
                    return (
                      <tr key={c.key}>
                        <td>{c.label}</td>
                        <td>
                          <select aria-label={`${c.label} column`} className="bg-pl-surface border border-pl-border rounded px-1" value={idx ?? ''} onChange={(e) => setMap(c.key, e.target.value)}>
                            <option value="">not in the file</option>
                            {res.columns.map((col) => <option key={col.index} value={col.index}>{col.header || col.name}</option>)}
                          </select>
                        </td>
                        <td>
                          {c.kind === 'days' && idx !== undefined ? (
                            <span className="inline-flex flex-wrap gap-1">
                              <select aria-label="Producing time unit" data-testid="vrr-days-on-unit" className="bg-pl-surface border border-pl-border rounded px-1" value={res.daysOnUnit || 'days'} onChange={(e) => setChoices((ch) => ({ ...ch, daysOnUnit: e.target.value }))}>
                                {DAYS_ON_UNITS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                              </select>
                              <select aria-label="Rate basis" data-testid="vrr-rate-basis" className="bg-pl-surface border border-pl-border rounded px-1" value={choices.rateBasis === 'calendar' ? 'calendar' : 'producing'} onChange={(e) => setChoices((ch) => ({ ...ch, rateBasis: e.target.value }))}>
                                <option value="producing">rates per producing day</option>
                                <option value="calendar">rates are calendar-day averages</option>
                              </select>
                            </span>
                          ) : c.stream && idx !== undefined ? (
                            <select aria-label={`${c.label} unit`} data-testid={`vrr-unit-${c.key}`} className="bg-pl-surface border border-pl-border rounded px-1 max-w-[16rem]" value={res.units[c.key]} onChange={(e) => setUnit(c.key, e.target.value)}>
                              {DOOR_UNITS[c.stream].map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                            </select>
                          ) : (rb?.unit || '')}
                          {rb?.from && <span className="text-pl-muted"> ({FROM_WORDS[rb.from] || rb.from})</span>}
                        </td>
                        <td>{rb ? rb.values : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {res.questions.map((q, i) => (
              <div key={i} className={`border rounded px-2 py-1.5 ${THEMED_TONE.warn}`} data-testid="vrr-import-question">
                {q.text}
                {q.kind === 'dateOrder' && (
                  <span className="ml-2 inline-flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setChoices((c) => ({ ...c, dateOrder: 'dmy' }))}>Day first</Button>
                    <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setChoices((c) => ({ ...c, dateOrder: 'mdy' }))}>Month first</Button>
                  </span>
                )}
                {q.kind === 'decimalMark' && (
                  <span className="ml-2 inline-flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setChoices((c) => ({ ...c, decimal: '.' }))}>Decimal point</Button>
                    <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setChoices((c) => ({ ...c, decimal: ',' }))}>Decimal comma</Button>
                  </span>
                )}
              </div>
            ))}
            {(r.warnings.length > 0 || r.skipped.length > 0 || r.notUsed.length > 0) && (
              <div className={`border rounded px-2 py-1.5 space-y-0.5 ${THEMED_TONE.warn}`}>
                <div className="flex items-center gap-2 font-semibold"><FileWarning className="w-4 h-4" /> Import report</div>
                {r.warnings.map((w, i) => <div key={`w${i}`}>{w}</div>)}
                {r.notUsed.map((n, i) => <div key={`n${i}`}>Column "{n.column}" not used: {n.reason}.</div>)}
                {r.skipped.slice(0, 8).map((s, i) => <div key={`s${i}`}>Line {s.row}: {s.reason}</div>)}
                {r.skipped.length > 8 && <div>...and {r.skipped.length - 8} more rows left out.</div>}
              </div>
            )}
            {res.refusal && <div className={`border rounded px-2 py-1.5 ${THEMED_TONE.danger}`} data-testid="vrr-import-refusal">{res.refusal}</div>}
            <div className="flex gap-2">
              <Button size="sm" onClick={accept} disabled={!res.ok || !canWrite} data-testid="vrr-import-accept">
                Import {res.ok ? `${r.imported} rows, ${r.wells} wells, ${r.firstDate} to ${r.lastDate}` : ''}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFile(null)}>Cancel</Button>
            </div>
          </div>
        )}

        {isImported && !res && (
          <div className={`flex items-start gap-2 text-xs border rounded px-3 py-2 ${THEMED_TONE.good}`}>
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {inputs.wellRows.length.toLocaleString()} well-rows active ({ledgerWells.producers.length} producer{ledgerWells.producers.length === 1 ? '' : 's'}, {ledgerWells.injectors.length} injector{ledgerWells.injectors.length === 1 ? '' : 's'}){inputs.importInfo?.file ? ` from ${inputs.importInfo.file}` : ''}.
              The dashboard now reads the imported ledger; manual grid entries are ignored until you clear the import.
              {' '}Volumes are held in {u.label('oil')}, {u.label('water')} and {u.label('gas')} on screen.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImportPanel;
