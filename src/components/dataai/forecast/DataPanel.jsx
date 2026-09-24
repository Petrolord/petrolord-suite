// Production Forecasting ML Workbench: pick the data (Data & AI D4).
//
// Two sources: a table uploaded in the browser, one row per well and step,
// or wells of a field in the Production data spine (the ledger the
// Production Operations apps import to), read through the spine's own
// service. Empty states say what is missing and where it comes from; nothing
// is filled in.
import React, { useEffect, useMemo, useState } from 'react';
import { Database, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useForecasting } from '@/contexts/ForecastingContext';
import { listFields, listProducers, loadSpineTable } from '@/utils/dataAi/forecastSources';
import {
  forecastTableFromUpload, MISSING_RULES, SPINE_PHASES, SPINE_STEPS,
} from '@/utils/dataAi/forecastData';
import { describeColumns } from '@/utils/dataAi/qcDatasets';
import {
  readTabularFile, parseDelimitedText, tableFromRows, unsupportedFileMessage, classifyFile,
} from '@/lib/tabularFile';
import {
  Note, SelectField, Toggle, TextInput,
} from '@/components/dataai/quality/shared';

const SOURCES = [
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'spine', label: 'Production data', icon: Database },
];

const ErrorLine = ({ error }) => (error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null);

const UploadSource = () => {
  const { setTable } = useForecasting();
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState(null);
  const [sheet, setSheet] = useState('');
  const [parsed, setParsed] = useState(null);
  const [wellCol, setWellCol] = useState('');
  const [periodCol, setPeriodCol] = useState('');
  const [valueCol, setValueCol] = useState('');
  const [unit, setUnit] = useState('');
  const [missing, setMissing] = useState('refuse');
  const [nullValue, setNullValue] = useState('');
  const [error, setError] = useState(null);

  const cols = useMemo(() => (parsed ? describeColumns(parsed) : []), [parsed]);

  const adopt = (t) => {
    setParsed(t);
    const c = describeColumns(t);
    const well = c.find((x) => x.kind === 'text' && /WELL|UWI|NAME/i.test(x.name));
    setWellCol(well ? String(well.index) : '');
    const period = c.find((x) => /DATE|MONTH|PERIOD|TIME/i.test(x.name));
    setPeriodCol(period ? String(period.index) : '');
    const value = c.find((x) => x.kind === 'number' && (!period || x.index !== period.index) && /OIL|GAS|WATER|RATE|PROD|STB|MSCF|BOPD|Q/i.test(x.name))
      || c.find((x) => x.kind === 'number' && (!period || x.index !== period.index));
    setValueCol(value ? String(value.index) : '');
  };

  const onFile = async (file) => {
    setError(null);
    setParsed(null);
    setSheets(null);
    if (!file) return;
    setFileName(file.name);
    if (classifyFile(file.name) === 'unsupported') { setError(unsupportedFileMessage(file.name)); return; }
    try {
      const read = await readTabularFile(file);
      if (read.kind === 'workbook') {
        setSheets(read.sheets);
        setSheet(read.sheets[0].name);
        adopt(tableFromRows(read.sheets[0].rows));
      } else {
        adopt(parseDelimitedText(read.text));
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const use = () => {
    setError(null);
    try {
      const t = forecastTableFromUpload(parsed, {
        label: `${fileName}${sheet ? ` [${sheet}]` : ''}`,
        wellColumn: wellCol === '' ? null : Number(wellCol),
        periodColumn: periodCol === '' ? null : Number(periodCol),
        valueColumn: valueCol === '' ? null : Number(valueCol),
        unit,
        missing,
        nullValues: nullValue.trim() ? nullValue.split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      setTable(t, { fileName, sheet });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-[11px] text-slate-400">
        <span>CSV, TSV, TXT or Excel file, one row per well and time step</span>
        <input
          type="file"
          accept=".csv,.tsv,.txt,.dat,.prn,.asc,.xlsx,.xlsm,.xls"
          data-testid="upload-input"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="mt-1 block w-full text-xs text-slate-300"
        />
      </label>
      <Note>
        The file stays in your browser. Each well&apos;s rows are read in file order, oldest first, one row per step
        (a month, say) with no step left out. A shut-in step is a 0. A saved run keeps the series so it can be re-run.
      </Note>
      {sheets && sheets.length > 1 ? (
        <SelectField
          label="Sheet"
          value={sheet}
          onChange={(v) => { setSheet(v); adopt(tableFromRows(sheets.find((s) => s.name === v).rows)); }}
          options={sheets.map((s) => ({ value: s.name, label: s.name }))}
        />
      ) : null}
      {parsed && !parsed.rows.length ? <Note tone="warn">The file has no data rows.</Note> : null}
      {parsed && parsed.rows.length ? (
        <div className="space-y-2 rounded border border-slate-800 p-2" data-testid="upload-mapping">
          <p className="text-[11px] text-slate-400">{parsed.rows.length} rows, {cols.length} columns.</p>
          <SelectField label="Well column" value={wellCol} onChange={setWellCol} emptyLabel="None (one series)" testId="well-col" options={cols.map((c) => ({ value: String(c.index), label: `${c.name} (${c.kind})` }))} />
          <SelectField label="Period column (labels only)" value={periodCol} onChange={setPeriodCol} emptyLabel="None (row number)" testId="period-col" options={cols.map((c) => ({ value: String(c.index), label: `${c.name} (${c.kind})` }))} />
          <SelectField label="Production column" value={valueCol} onChange={setValueCol} emptyLabel="Choose" testId="value-col" options={cols.filter((c) => c.kind === 'number').map((c) => ({ value: String(c.index), label: c.name }))} />
          <TextInput label="Unit" value={unit} onChange={setUnit} placeholder="for example stb per month" width="w-40" testId="unit" />
          <SelectField label="Missing values" value={missing} onChange={setMissing} testId="missing-rule" options={MISSING_RULES} />
          <TextInput
            label="Extra missing-value codes"
            value={nullValue}
            onChange={setNullValue}
            placeholder="for example -999"
            width="w-40"
            source="Blank cells and NA, NaN, null, none and - are always missing. Add codes your file uses, separated by commas."
          />
          <Button size="sm" onClick={use} disabled={valueCol === ''} data-testid="use-upload">Use this table</Button>
        </div>
      ) : null}
      <ErrorLine error={error} />
    </div>
  );
};

const SpineSource = () => {
  const { setTable } = useForecasting();
  const [fields, setFields] = useState(null);
  const [fieldId, setFieldId] = useState('');
  const [wells, setWells] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [phase, setPhase] = useState('oil_stb');
  const [step, setStep] = useState('month');
  const [missing, setMissing] = useState('refuse');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let off = false;
    listFields().then((f) => { if (!off) setFields(f); }).catch((e) => { if (!off) { setFields([]); setError(e.message); } });
    return () => { off = true; };
  }, []);

  useEffect(() => {
    if (!fieldId) { setWells(null); return undefined; }
    let off = false;
    setWells(null);
    setChosen([]);
    listProducers(fieldId).then((w) => { if (!off) { setWells(w); setChosen(w.map((x) => x.id)); } })
      .catch((e) => { if (!off) { setWells([]); setError(e.message); } });
    return () => { off = true; };
  }, [fieldId]);

  const field = (fields || []).find((f) => f.id === fieldId);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const picked = wells.filter((w) => chosen.includes(w.id));
      const t = await loadSpineTable({
        field, wells: picked, phase, step, missing,
      });
      setTable(t, {
        fieldId, fieldName: field.name, wellIds: picked.map((w) => w.id), wellNames: picked.map((w) => w.name), phase, step, missing,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (fields === null) return <Note>Reading the production data fields.</Note>;
  if (!fields.length) {
    return (
      <div className="space-y-2">
        <ErrorLine error={error} />
        <Note testId="fields-empty">
          No fields are in the production data you can see. Production is imported in the Production Operations apps
          (Production Surveillance Studio), or upload a table here instead.
        </Note>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <SelectField label="Field" value={fieldId} onChange={setFieldId} emptyLabel="Choose" testId="spine-field" options={fields.map((f) => ({ value: f.id, label: f.name }))} />
      {fieldId && wells === null ? <Note>Reading the field&apos;s wells.</Note> : null}
      {wells && !wells.length ? <Note testId="spine-no-wells">This field has no producing wells.</Note> : null}
      {wells && wells.length ? (
        <>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded border border-slate-800 p-2" data-testid="spine-wells">
            {wells.map((w) => (
              <Toggle key={w.id} label={w.name} checked={chosen.includes(w.id)} onChange={(on) => setChosen((c) => (on ? [...c, w.id] : c.filter((x) => x !== w.id)))} />
            ))}
          </div>
          <SelectField label="Phase" value={phase} onChange={setPhase} testId="spine-phase" options={SPINE_PHASES.map((p) => ({ value: p.value, label: `${p.label} (${p.value})` }))} />
          <SelectField label="Time step" value={step} onChange={setStep} testId="spine-step" options={SPINE_STEPS} />
          <SelectField label="Missing values" value={missing} onChange={setMissing} testId="spine-missing" options={MISSING_RULES} />
          <Button size="sm" disabled={!chosen.length || busy} onClick={load} data-testid="load-spine">
            {busy ? 'Reading production' : 'Use these wells'}
          </Button>
        </>
      ) : null}
      <ErrorLine error={error} />
    </div>
  );
};

const TableSummary = () => {
  const { table } = useForecasting();
  if (!table) return <Note testId="no-data">No data loaded. Choose a source above.</Note>;
  const steps = table.wells.reduce((s, w) => s + w.values.length, 0);
  return (
    <div className="space-y-1 rounded border border-slate-800 bg-slate-950/60 p-2 text-xs" data-testid="table-summary">
      <p className="font-medium text-slate-100">{table.label}</p>
      <p className="text-slate-400" data-testid="table-counts">
        {table.wells.length} well{table.wells.length === 1 ? '' : 's'}, {steps.toLocaleString('en-US')} steps in all; one step is a {table.step}
        {table.unit ? `; unit ${table.unit}` : ''}.
      </p>
      {table.notes.map((t) => <Note key={t}>{t}</Note>)}
    </div>
  );
};

const DataPanel = () => {
  const {
    sourceKind, setSourceKind, reloadError, reloading,
  } = useForecasting();
  return (
    <div className="space-y-3" data-testid="data-panel">
      <h2 className="text-sm font-semibold text-slate-100">Data</h2>
      <div className="flex gap-1" role="tablist" aria-label="Data source">
        {SOURCES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={sourceKind === id}
            onClick={() => setSourceKind(id)}
            data-testid={`source-${id}`}
            className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs ${sourceKind === id ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      {sourceKind === 'spine' ? <SpineSource /> : <UploadSource />}
      {reloading ? <Note>Re-reading the saved run&apos;s data.</Note> : null}
      {reloadError ? <Note tone="warn" testId="reload-error">{reloadError}</Note> : null}
      <TableSummary />
    </div>
  );
};

export default DataPanel;
