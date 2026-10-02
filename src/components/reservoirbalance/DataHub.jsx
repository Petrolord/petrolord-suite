// src/components/reservoirbalance/DataHub.jsx
//
// Material Balance Studio: the Data tab.
//
// The pressure and production table of a case: imported from a file or a
// paste, checked, saved to rb_production_data and shown in the display
// units. Rebuilt in the Material Balance round of the app upgrade programme
// (MBAL-U1, PL2, PL3, RL10) on the shared typed reader
// (src/lib/tabularParse.js) through lib/productionImport.js:
//
//   - columns are found by header name in any order, and any column can be
//     placed by hand (which is how a file with no header is read);
//   - each column's unit is read from its header, or chosen at the door.
//     Gauge pressure is raised by the atmospheric pressure stated here;
//   - a date order the file does not settle is asked for, never guessed;
//   - the door shows what it read: which column became what, in which
//     unit, how many rows were read, and each row left out with the reason;
//   - CSV, semicolon, tab and white-space files, a paste, and Excel sheets.
//
// The rows are held and saved in engine units (psia, STB, scf, RB/STB,
// RB/Mscf); the table and the download show the display units.
//
// Data flow:
//   1. On mount: listProductionData(caseId), shown in the table
//   2. A file or a paste goes through readProductionTable; the choices of
//      the door (mapping, units, date order, decimal mark) re-read it
//   3. Validation against the engine's rules; errors are listed by row
//   4. Save to case: replaceProductionData(caseId, rows)
//   5. onDataSaved, so the studio reloads the case

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  Table as UiTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  Download,
  Trash2,
  Save,
  Loader2,
  RefreshCw,
  Info,
  X,
  ClipboardPaste,
} from 'lucide-react';
import {
  listProductionData,
  replaceProductionData,
} from '@/pages/apps/reservoir-balance/lib/api';
import {
  readProductionTable, IMPORT_COLUMNS, DOOR_UNITS, STANDARD_ATMOSPHERE_PSI,
} from '@/pages/apps/reservoir-balance/lib/productionImport';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import { OILFIELD_UNITS } from '@/pages/apps/reservoir-balance/lib/mbalUnits';
import { COMPACT_FIELD_THEMED } from '@/components/ui/native-select';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import UnitField from './UnitField';

// =============================================================================
// THE TABLE ON SCREEN
// =============================================================================

// Columns of the table, with the quantity each is shown in (lib/mbalUnits).
const SCHEMA_DISPLAY = [
  { col: 'timestep_index', label: 'Step', quantity: null },
  { col: 'observation_date', label: 'Date', quantity: null },
  { col: 'pressure_psia', label: 'Pressure', quantity: 'pressure' },
  { col: 'cum_oil_stb', label: 'Np', quantity: 'stockVolume', volume: true },
  { col: 'cum_gas_scf', label: 'Gp', quantity: 'gasVolume', volume: true },
  { col: 'cum_water_stb', label: 'Wp', quantity: 'stockVolume', volume: true },
  { col: 'cum_water_inj_stb', label: 'Winj', quantity: 'stockVolume', volume: true },
  { col: 'cum_gas_inj_scf', label: 'Ginj', quantity: 'gasVolume', volume: true },
  { col: 'bo_rb_stb', label: 'Bo', quantity: 'fvfOil', digits: 4 },
  { col: 'rs_scf_stb', label: 'Rs', quantity: 'gor', digits: 1 },
  { col: 'bg_rb_mscf', label: 'Bg', quantity: 'fvfGas', digits: 5 },
  { col: 'bw_rb_stb', label: 'Bw', quantity: 'fvfOil', digits: 4 },
  { col: 'z_factor', label: 'Z', quantity: null, digits: 4 },
  { col: 'observed_we_rb', label: 'Observed We', quantity: 'resVolume', volume: true },
];

// the door unit that matches the display unit of each kind of column, offered
// where the file names no unit
const doorDefaults = (units) => ({
  pressure: { psi: 'psia', kPa: 'kPa', bar: 'bara', MPa: 'MPa' }[units.unit('pressure')] ?? 'psia',
  stock: units.unit('stockVolume') === 'm3' ? 'm3' : 'STB',
  gas: units.unit('gasVolume') === 'm3' ? 'm3' : 'scf',
  res: units.unit('resVolume') === 'm3' ? 'm3' : 'RB',
  gor: units.unit('gor') === 'm3/m3' ? 'm3/m3' : 'scf/STB',
  fvfGas: units.unit('fvfGas') === 'm3/m3' ? 'm3/m3' : 'RB/Mscf',
});

/**
 * CSV text to mapped rows with the choices a file needs taken at their
 * defaults: the import path with no file and no DOM, kept for the tests of
 * Step 0a (H12). Returns { rows, warnings, colMap, scales, parseErrors }.
 */
export function readProductionCsv(text) {
  const src = String(text ?? '').replace(/^\ufeff/, '');
  const read = readProductionTable(src);
  const warnings = [...read.warnings];
  for (const q of read.questions) warnings.push(q.text);
  const cells = read.readBack.skipped.filter((s) => s.cell);
  if (cells.length) {
    warnings.push(`${cells.length} value(s) could not be read as numbers. Those cells were left empty, and a row with no pressure is left out.`);
  }
  if (!read.ok && read.refusal && !read.rows.length) {
    return { rows: [], warnings, colMap: {}, scales: {}, parseErrors: [{ message: read.refusal }] };
  }
  const colMap = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, read.mapping[c.key] !== undefined ? (read.columns[read.mapping[c.key]].header ?? null) : null]));
  return { rows: read.rows, warnings, colMap, scales: read.units, parseErrors: [] };
}

/** A dropped file as text: delimited text as it is, the first sheet of a workbook as tab-separated text. */
async function fileToText(file) {
  const name = String(file?.name ?? '').toLowerCase();
  if (/\.(xlsx|xlsm|xls)$/.test(name)) {
    const { readTabularFile } = await import('@/lib/tabularFile');
    const wb = await readTabularFile(file);
    const sheet = wb.sheets?.find((s) => s.rows.length) ?? wb.sheets?.[0];
    if (!sheet || !sheet.rows.length) throw new Error('The workbook has no rows.');
    return { text: sheet.rows.map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n'), note: wb.sheets.length > 1 ? `Sheet "${sheet.name}" was read; the workbook has ${wb.sheets.length} sheets.` : null };
  }
  const text = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error || new Error('The file could not be read.'));
    reader.readAsText(file);
  });
  return { text: text.replace(/^\ufeff/, ''), note: null };
}

/**
 * Validate rows against the engine's rules. Rows are in engine units; the
 * messages print the display units.
 * Returns array of {row, message} errors. Empty array = valid.
 */
export function validateRows(rows, caseData, units = OILFIELD_UNITS) {
  const errors = [];
  const pText = (v) => `${fmtNum(units.to('pressure', v), units.unit('pressure') === 'psi' ? 1 : 2)} ${units.label('pressure')}`;

  if (rows.length < 2) {
    errors.push({ row: null, message: `At least 2 rows are needed: the initial state and one later survey. The table has ${rows.length}.` });
    return errors;
  }

  // Row 0: zero cumulatives
  const r0 = rows[0];
  const CUMS = { cum_oil_stb: 'oil', cum_gas_scf: 'gas', cum_water_stb: 'water', cum_water_inj_stb: 'injected water', cum_gas_inj_scf: 'injected gas' };
  for (const [cum, word] of Object.entries(CUMS)) {
    if (r0[cum] != null && r0[cum] > 0) {
      errors.push({
        row: 0,
        message: `The first row is the initial state and must have no cumulative ${word}. Add a row above it with the initial pressure and zero volumes.`,
      });
    }
  }

  // Row 0: pressure matches case initial pressure
  if (caseData?.initial_pressure_psia != null) {
    const diff = Math.abs(r0.pressure_psia - caseData.initial_pressure_psia);
    if (diff > 1) {
      errors.push({
        row: 0,
        message: `The first row pressure (${pText(r0.pressure_psia)}) differs from the initial pressure of the case (${pText(Number(caseData.initial_pressure_psia))}). Change the data, or the initial pressure with Edit case on the case card.`,
      });
    }
  }

  // Monotone non-increasing pressures
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].pressure_psia > rows[i - 1].pressure_psia + 0.5) {
      errors.push({
        row: i,
        message: `The pressure of row ${i} (${pText(rows[i].pressure_psia)}) is above the row before it (${pText(rows[i - 1].pressure_psia)}). The engine needs pressures that do not rise.`,
      });
    }
  }

  // Dates, where given, must run forward
  let lastDate = null;
  for (let i = 0; i < rows.length; i++) {
    const d = rows[i].observation_date;
    if (!d) continue;
    if (lastDate && String(d) <= String(lastDate.value)) {
      errors.push({ row: i, message: `The date of row ${i} (${String(d).slice(0, 10)}) is not after the date of row ${lastDate.index} (${String(lastDate.value).slice(0, 10)}).` });
    }
    lastDate = { value: d, index: i };
  }

  // Required cumulatives by fluid system
  if (caseData?.fluid_system === 'gas') {
    const hasGas = rows.some((r) => r.cum_gas_scf != null && r.cum_gas_scf > 0);
    if (!hasGas) {
      errors.push({
        row: null,
        message: 'This is a gas case and the table holds no gas production. It needs a cumulative gas column.',
      });
    }
  } else {
    const hasOil = rows.some((r) => r.cum_oil_stb != null && r.cum_oil_stb > 0);
    if (!hasOil) {
      errors.push({
        row: null,
        message: 'This is an oil case and the table holds no oil production. It needs a cumulative oil column.',
      });
    }
  }

  return errors;
}

const fmtNum = (v, decimals = 2) => {
  if (v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return EMPTY_VALUE;
  if (typeof v !== 'number') return String(v);
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

// =============================================================================
// THE IMPORT DOOR: what was read, and the choices a file needs
// =============================================================================

const selectCls = `${COMPACT_FIELD_THEMED} h-7 text-[11px] max-w-full`;
const UNIT_FROM_WORDS = { header: 'from the header', chosen: 'chosen here', assumed: 'not named in the file', fixed: '' };

const ImportDoor = ({ read, choices, setChoices, fileName, units }) => {
  const set = (patch) => setChoices((c) => ({ ...c, ...patch }));
  const setMapping = (key, value) => set({ mapping: { ...(choices.mapping ?? {}), [key]: value === '' ? null : Number(value) } });
  const setUnit = (key, value) => set({ units: { ...(choices.units ?? {}), [key]: value } });
  const rb = read.readBack;
  const dateQuestion = read.questions.find((q) => q.kind === 'dateOrder');
  const decimalQuestion = read.questions.find((q) => q.kind === 'decimalMark');
  const gauge = DOOR_UNITS.pressure.find((u) => u.key === read.units.pressure_psia)?.gauge;
  const rowSkips = rb.skipped.filter((s) => !s.cell);
  const cellSkips = rb.skipped.filter((s) => s.cell);
  return (
    <div className="bg-pl-surface border border-pl-border rounded p-3 space-y-3" data-testid="mbal-import-door">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-pl-text">What was read from {fileName}</p>
        <p className="text-[11px] text-pl-muted" data-testid="mbal-import-counts">
          {rb.rowsRead} of {rb.rowsInFile} rows read, {rowSkips.length} left out. Columns split by {rb.delimiter}; decimal {rb.decimal.mark === ',' ? 'comma' : 'point'}{rb.header ? '' : '; no header row'}.
        </p>
      </div>

      {(dateQuestion || decimalQuestion) && (
        <div className="bg-pl-warning-bg border border-pl-warning/40 rounded p-3 space-y-2" data-testid="mbal-import-questions">
          {dateQuestion && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-pl-warning-text flex-1 min-w-[16rem]">{dateQuestion.text}</p>
              <select className={selectCls} aria-label="Date order" data-testid="mbal-import-date-order" value={choices.dateOrder ?? ''} onChange={(e) => set({ dateOrder: e.target.value || undefined })}>
                <option value="">Choose the date order</option>
                <option value="dmy">Day first (31/12/2024)</option>
                <option value="mdy">Month first (12/31/2024)</option>
              </select>
            </div>
          )}
          {decimalQuestion && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-pl-warning-text flex-1 min-w-[16rem]">{decimalQuestion.text}</p>
              <select className={selectCls} aria-label="Decimal mark" data-testid="mbal-import-decimal" value={choices.decimal ?? ''} onChange={(e) => set({ decimal: e.target.value || undefined })}>
                <option value="">As read (decimal {rb.decimal.mark === ',' ? 'comma' : 'point'})</option>
                <option value=".">Decimal point (1,234 is one thousand)</option>
                <option value=",">Decimal comma (1,234 is one and a bit)</option>
              </select>
            </div>
          )}
        </div>
      )}
      {choices.dateOrder && !dateQuestion && (
        <p className="text-[11px] text-pl-muted" data-testid="mbal-import-date-chosen">
          Dates read {choices.dateOrder === 'dmy' ? 'day first' : 'month first'}, as chosen here.{' '}
          <button type="button" className="underline" onClick={() => set({ dateOrder: undefined })}>Choose again</button>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" data-testid="mbal-import-mapping">
          <thead>
            <tr className="text-left text-pl-muted">
              <th className="font-semibold py-1 pr-3">Becomes</th>
              <th className="font-semibold py-1 pr-3">Column of the file</th>
              <th className="font-semibold py-1 pr-3">Unit in the file</th>
              <th className="font-semibold py-1 pr-3 text-right">Values</th>
            </tr>
          </thead>
          <tbody>
            {IMPORT_COLUMNS.map((t) => {
              const index = read.mapping[t.key];
              const placed = index !== undefined;
              const back = rb.columns.find((c) => c.key === t.key);
              const options = DOOR_UNITS[t.units] ?? [];
              return (
                <tr key={t.key} className="border-t border-pl-border/60 align-middle" data-testid={`mbal-import-row-${t.key}`}>
                  <td className="py-1 pr-3 text-pl-text whitespace-nowrap">{t.label}{t.required ? ' *' : ''}</td>
                  <td className="py-1 pr-3">
                    <select className={selectCls} aria-label={`File column for ${t.label}`} data-testid={`mbal-import-col-${t.key}`}
                      value={placed ? String(index) : ''} onChange={(e) => setMapping(t.key, e.target.value)}>
                      <option value="">{t.required ? 'Choose a column' : 'Not in the file'}</option>
                      {read.columns.map((c) => <option key={c.index} value={String(c.index)}>{c.header || c.name}</option>)}
                    </select>
                  </td>
                  <td className="py-1 pr-3">
                    {!placed ? null : t.kind === 'date' ? (
                      <span className="text-pl-muted">{back?.unit}</span>
                    ) : options.length > 1 ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <select className={selectCls} aria-label={`Unit of ${t.label} in the file`} data-testid={`mbal-import-unit-${t.key}`}
                          value={read.units[t.key]} onChange={(e) => setUnit(t.key, e.target.value)}>
                          {options.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
                        </select>
                        <span className={read.unitFrom[t.key] === 'assumed' ? 'text-pl-warning-text' : 'text-pl-muted'}>{UNIT_FROM_WORDS[read.unitFrom[t.key]]}</span>
                      </span>
                    ) : (
                      <span className="text-pl-muted">{options[0]?.label ?? 'no unit'}</span>
                    )}
                  </td>
                  <td className="py-1 pr-3 text-right font-pl-mono tabular-nums text-pl-text">{placed ? back?.values ?? 0 : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rb.unplaced?.length > 0 && (
        <p className="text-[11px] text-pl-muted" data-testid="mbal-import-unplaced">
          Columns of the file that were not used: {rb.unplaced.map((c) => c.name).join(', ')}.
        </p>
      )}
      {gauge && (
        <div className="max-w-xs">
          <UnitField label="Atmospheric pressure added to gauge pressures" quantity="dp" units={units} testId="mbal-import-atmosphere"
            value={choices.atmospherePsi ?? STANDARD_ATMOSPHERE_PSI} onCommit={(v) => set({ atmospherePsi: v == null ? undefined : v })} />
        </div>
      )}
      {(rowSkips.length > 0 || cellSkips.length > 0) && (
        <details className="text-[11px] text-pl-muted" data-testid="mbal-import-skipped" open={rowSkips.length + cellSkips.length <= 6}>
          <summary className="cursor-pointer text-pl-text">
            {rowSkips.length} row(s) left out{cellSkips.length ? `, ${cellSkips.length} cell(s) left empty` : ''}: the reasons
          </summary>
          <ul className="mt-1 space-y-0.5 list-disc pl-5">
            {[...rowSkips, ...cellSkips].slice(0, 40).map((s, i) => (
              <li key={i}>Line {s.line}: {s.reason}.</li>
            ))}
            {rowSkips.length + cellSkips.length > 40 && <li>and {rowSkips.length + cellSkips.length - 40} more.</li>}
          </ul>
        </details>
      )}
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const DataHub = ({ caseId, caseData, onDataSaved }) => {
  const { toast } = useToast();
  const { units } = useMaterialBalanceStudio();

  // Server state
  const [serverRows, setServerRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // The file (or paste) at the door, and the choices made for it
  const [source, setSource] = useState(null); // { text, name, note }
  const [choices, setChoices] = useState({});
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // Save state
  const [saving, setSaving] = useState(false);

  // ── Initial hydrate ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!caseId) {
        setLoading(false);
        return;
      }
      const { data, error } = await listProductionData(caseId);
      if (cancelled) return;
      if (error) {
        toast({
          title: 'Could not load production data',
          description: error.message,
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }
      setServerRows(data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, toast]);

  // The door re-reads the text whenever a choice changes. Where the file
  // names no unit, the display unit is offered.
  const defaults = useMemo(() => doorDefaults(units), [units]);
  const read = useMemo(
    () => (source ? readProductionTable(source.text, { ...choices, defaultUnits: defaults }) : null),
    [source, choices, defaults],
  );
  const pendingRows = read?.ok ? read.rows : null;

  const validationErrors = useMemo(() => {
    if (!pendingRows || !caseData) return [];
    return validateRows(pendingRows, caseData, units);
  }, [pendingRows, caseData, units]);

  const canSave = Boolean(pendingRows) && validationErrors.length === 0;

  const open = useCallback((text, name, note = null) => {
    setChoices({});
    setSource({ text, name, note });
    const first = readProductionTable(text);
    toast({
      title: first.ok ? 'File read and not saved yet' : 'The file needs a choice',
      description: first.ok
        ? `${first.rows.length} rows read. Check what was read, then press "Save to case" to write them to the case.`
        : first.refusal,
      duration: 8000,
    });
  }, [toast]);

  // ── Drop handler ──
  const onDrop = useCallback(
    (acceptedFiles, rejected) => {
      if (rejected?.length && !acceptedFiles.length) {
        toast({ title: 'That file type is not read here', description: 'Use a CSV, a text file with tab, semicolon or space columns, or an Excel workbook.', variant: 'destructive' });
        return;
      }
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];
      fileToText(file).then(({ text, note }) => open(text, file.name, note)).catch((err) => {
        toast({ title: 'File read error', description: err.message, variant: 'destructive' });
      });
    },
    [toast, open],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'], 'text/plain': ['.txt', '.tsv', '.dat', '.prn', '.asc'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  const discardPending = () => {
    setSource(null);
    setChoices({});
  };

  // ── Save pending rows ──
  const handleSave = async () => {
    if (!canSave || !caseId) return;
    setSaving(true);
    const { error } = await replaceProductionData(caseId, pendingRows);
    setSaving(false);
    if (error) {
      toast({
        title: 'Save failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setServerRows(pendingRows);
    discardPending();
    toast({
      title: 'Production data saved',
      description: `${pendingRows.length} rows written to the case.`,
    });
    onDataSaved?.();
  };

  const visibleRows = pendingRows ?? (read ? read.rows : null) ?? serverRows;
  const maxOf = (col) => visibleRows.reduce((mx, r) => Math.max(mx, Math.abs(Number(r[col]) || 0)), 0);
  const visibleCols = SCHEMA_DISPLAY.filter(({ col }) => col === 'timestep_index' || col === 'pressure_psia'
    || visibleRows.some((r) => r[col] != null && r[col] !== 0 && r[col] !== ''))
    .map((c) => {
      if (!c.quantity) return { ...c, unitLabel: '', show: (v) => (c.col === 'observation_date' ? (v ? String(v).slice(0, 10) : EMPTY_VALUE) : (c.col === 'timestep_index' ? v : fmtNum(Number(v), c.digits ?? 4))) };
      if (c.volume) {
        const s = units.scaled(c.quantity, maxOf(c.col));
        const digits = ['STB', 'RB', 'scf', 'm3'].includes(s.unit) ? 0 : 3;
        return { ...c, unitLabel: s.label, show: (v) => (v == null ? EMPTY_VALUE : fmtNum(s.to(Number(v)), digits)) };
      }
      const digits = c.col === 'pressure_psia' ? (units.unit('pressure') === 'psi' ? 1 : units.unit('pressure') === 'kPa' ? 0 : 3) : (c.digits ?? 4);
      return { ...c, unitLabel: units.label(c.quantity), show: (v) => (v == null ? EMPTY_VALUE : fmtNum(units.to(c.quantity, Number(v)), digits)) };
    });

  // ── Download the saved table, in the display units, with the unit in each header ──
  const downloadServerData = () => {
    if (serverRows.length === 0) return;
    const cols = SCHEMA_DISPLAY.filter(({ col }) => col !== 'timestep_index' && serverRows.some((r) => r[col] != null && r[col] !== ''));
    const unitOf = (c) => (c.quantity ? (c.volume ? units.label(c.quantity) : units.label(c.quantity)) : '');
    const head = cols.map((c) => (unitOf(c) ? `${c.label} (${unitOf(c)})` : c.label));
    const cell = (c, v) => {
      if (v == null || v === '') return '';
      if (c.col === 'observation_date') return String(v).slice(0, 10);
      const n = c.quantity ? units.to(c.quantity, Number(v)) : Number(v);
      return Number.isFinite(n) ? String(parseFloat(n.toPrecision(10))) : '';
    };
    const lines = [head.join(','), ...serverRows.map((r) => cols.map((c) => cell(c, r[c.col])).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(caseData?.name ?? 'case').replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'case'}-pressure-and-production.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Clear all server data ──
  const clearServerData = async () => {
    if (!caseId) return;
    if (!confirm(`Delete all ${serverRows.length} rows of production data for this case? This cannot be undone.`)) return;
    setSaving(true);
    const { error } = await replaceProductionData(caseId, []);
    setSaving(false);
    if (error) {
      toast({
        title: 'Clear failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setServerRows([]);
    toast({
      title: 'Cleared',
      description: 'All production data deleted for this case.',
    });
    onDataSaved?.();
  };

  // ── Loading state ──
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-pl-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!caseData) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-pl-muted">
          Open a case to load its data.
        </CardContent>
      </Card>
    );
  }

  const injected = (pendingRows ?? serverRows).some((r) => (r.cum_water_inj_stb ?? 0) > 0 || (r.cum_gas_inj_scf ?? 0) > 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <CardTitle>Data Hub</CardTitle>
            <CardDescription>
              The pressure and production history of the case. Bring it in from a file or a paste; columns are found by name, and each unit is read from its header or chosen here.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {serverRows.length > 0 && !source && (
              <>
                <Button
                  onClick={downloadServerData}
                  variant="outline"
                  size="sm"
                  data-testid="mbal-data-download"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download CSV
                </Button>
                <Button
                  onClick={clearServerData}
                  disabled={saving}
                  variant="outline"
                  size="sm"
                  className="border-pl-danger/40 text-pl-danger-text hover:bg-pl-danger-bg"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear all
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload zone, shown when nothing is at the door */}
          {!source && (
            <div className="space-y-3">
              <div
                {...getRootProps()}
                data-testid="mbal-data-dropzone"
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-pl-primary bg-pl-primary/10'
                    : 'border-pl-border-strong hover:border-pl-primary bg-pl-surface'
                }`}
              >
                <input {...getInputProps()} data-testid="mbal-data-file" />
                <Upload className="w-10 h-10 mx-auto mb-3 text-pl-primary-text" />
                <p className="text-pl-text font-medium mb-1">
                  {isDragActive ? 'Drop the file here' : 'Drag a file here, or click to select'}
                </p>
                <p className="text-xs text-pl-muted mt-2 leading-relaxed">
                  CSV, text with tab, semicolon or space columns, or an Excel sheet. One row per survey, the initial state first.
                  Needed: a <span className="font-mono">Pressure</span> column. Usual: <span className="font-mono">Date, Np, Gp, Wp</span>.
                  Optional per-row PVT: <span className="font-mono">Bo, Rs, Bg, Bw, Z</span>.
                  A unit in a header is read (for example <span className="font-mono">Pressure (psig)</span> or <span className="font-mono">Gp (MMscf)</span>); where there is none you choose it.
                </p>
              </div>
              <div>
                <Button variant="outline" size="sm" onClick={() => setPasteOpen((v) => !v)} data-testid="mbal-data-paste-toggle">
                  <ClipboardPaste className="h-4 w-4 mr-2" />
                  {pasteOpen ? 'Close the paste box' : 'Paste a table'}
                </Button>
                {pasteOpen && (
                  <div className="mt-2 space-y-2">
                    <Label htmlFor="mbal-paste" className="text-xs text-pl-text">Paste rows copied from a spreadsheet, with the header row</Label>
                    <textarea id="mbal-paste" data-testid="mbal-data-paste" rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                      className="w-full rounded-md border border-pl-border-strong bg-pl-surface text-pl-text text-xs font-mono p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus" />
                    <Button size="sm" disabled={!pasteText.trim()} data-testid="mbal-data-paste-read"
                      onClick={() => { open(pasteText, 'the pasted table'); setPasteOpen(false); setPasteText(''); }}>
                      Read the pasted table
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* A file at the door */}
          {source && read && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-pl-surface border border-pl-warning/40 rounded p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Info className="w-5 h-5 text-pl-warning-text flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-pl-text font-medium truncate" data-testid="mbal-pending-name">
                      Not saved yet: {source.name}
                    </p>
                    <p className="text-xs text-pl-muted" data-testid="mbal-pending-status">
                      {!read.ok
                        ? read.refusal
                        : validationErrors.length === 0
                          ? `${read.rows.length} rows read. Ready to save.`
                          : `${read.rows.length} rows read. ${validationErrors.length} problem(s) below stop the save.`}
                    </p>
                    {source.note && <p className="text-[11px] text-pl-muted">{source.note}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={discardPending}
                    variant="outline"
                    size="sm"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Discard
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!canSave || saving}
                    className="font-semibold"
                    data-testid="mbal-data-save"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save to case
                  </Button>
                </div>
              </div>

              <ImportDoor read={read} choices={choices} setChoices={setChoices} fileName={source.name} units={units} />

              {read.warnings.length > 0 && (
                <div className="bg-pl-warning-bg border border-pl-warning/40 rounded p-3 space-y-1" data-testid="mbal-import-warnings">
                  {read.warnings.map((w) => (
                    <p key={w} className="text-xs text-pl-warning-text flex items-start gap-2">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="bg-pl-danger-bg border border-pl-danger/40 rounded p-3 space-y-1" data-testid="mbal-import-errors">
                  <p className="text-xs font-medium text-pl-danger-text mb-2">
                    Problems that stop the save ({validationErrors.length})
                  </p>
                  {validationErrors.map((err, i) => (
                    <p key={i} className="text-xs text-pl-danger-text flex items-start gap-2">
                      <X className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span>{err.message}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {injected && (
            <p className="text-xs text-pl-warning-text flex items-start gap-2" data-testid="mbal-data-injection">
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>The table holds injected volumes. They are kept and printed, and this engine version leaves them out of the balance: the withdrawal term has no injection term.</span>
            </p>
          )}

          {/* The table: the file at the door, or the saved rows */}
          {visibleRows.length > 0 && (
            <Card>
              <CardHeader className="border-b border-pl-border p-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold text-pl-text uppercase tracking-wider flex items-center gap-2">
                    {source ? (
                      <>
                        <RefreshCw className="w-3 h-3 text-pl-warning-text" />
                        Read from the file, not saved
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3 h-3 text-pl-success-text" />
                        Saved data
                      </>
                    )}
                  </CardTitle>
                  <span className="text-[10px] text-pl-muted" data-testid="mbal-data-count">
                    {visibleRows.length} rows, {visibleCols.length} columns
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[360px] w-full">
                  <UiTable data-testid="mbal-data-table">
                    <TableHeader className="bg-pl-sunken sticky top-0 z-10">
                      <TableRow>
                        {visibleCols.map(({ col, label, unitLabel }) => (
                          <TableHead
                            key={col}
                            className="text-xs text-pl-muted font-semibold py-2 whitespace-nowrap normal-case"
                          >
                            {label}
                            {unitLabel && (
                              <span className="text-[10px] block font-normal normal-case text-pl-muted">
                                ({unitLabel})
                              </span>
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((r, i) => (
                        <TableRow
                          key={i}
                          className="border-pl-border hover:bg-pl-sunken"
                        >
                          {visibleCols.map(({ col, show }) => (
                            <TableCell
                              key={col}
                              className="font-mono text-xs text-pl-text py-1.5 whitespace-nowrap"
                            >
                              {show(r[col])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </UiTable>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!source && serverRows.length === 0 && (
            <div className="text-center py-8 text-pl-muted">
              <p className="text-sm">No production data yet.</p>
              <p className="text-xs mt-1">Bring in a file or paste a table above.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DataHub;
