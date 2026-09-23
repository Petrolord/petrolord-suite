// Data Quality Studio: pick the data (Data & AI D1).
//
// Three sources, each read through its owner's service: the wells registry
// (Well Data Manager), the Production data spine, or a file read in the
// browser by the shared tabular reader. Empty states say what is missing and
// where it comes from; nothing is filled in.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Database, Droplets, Upload } from 'lucide-react';
import { useDataQualityStudio } from '@/contexts/DataQualityStudioContext';
import {
  listWells, listLogs, listFields, listPoWells, loadWellDataset, loadProductionDataset, isDepthLog,
} from '@/utils/dataAi/qcSources';
import { readTabularFile, parseDelimitedText, tableFromRows, unsupportedFileMessage, classifyFile } from '@/lib/tabularFile';
import { datasetFromTable, describeColumns } from '@/utils/dataAi/qcDatasets';
import { Note, SelectField, Toggle, TextInput } from './shared';

const SOURCES = [
  { id: 'wells', label: 'Well logs', icon: Database },
  { id: 'production', label: 'Production', icon: Droplets },
  { id: 'upload', label: 'Upload', icon: Upload },
];

const ErrorLine = ({ error }) => (error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null);

const WellsSource = () => {
  const { setDataset } = useDataQualityStudio();
  const [wells, setWells] = useState(null);
  const [wellId, setWellId] = useState('');
  const [logs, setLogs] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let off = false;
    listWells().then((w) => { if (!off) setWells(w); }).catch((e) => { if (!off) { setWells([]); setError(e.message); } });
    return () => { off = true; };
  }, []);

  useEffect(() => {
    if (!wellId) { setLogs(null); return undefined; }
    let off = false;
    setError(null);
    listLogs(wellId).then((l) => {
      if (off) return;
      setLogs(l);
      setChosen(l.filter((x) => !isDepthLog(x)).map((x) => x.id));
    }).catch((e) => { if (!off) { setLogs([]); setError(e.message); } });
    return () => { off = true; };
  }, [wellId]);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const well = wells.find((w) => w.id === wellId);
      setDataset(await loadWellDataset({ well, logs, chosenIds: chosen, wells }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (wells === null) return <Note>Reading the wells registry.</Note>;
  if (!wells.length) {
    return (
      <div className="space-y-2">
        <ErrorLine error={error} />
        <Note testId="wells-empty">
          No wells are in the registry you can see. Well logs come from the Well Data Manager: import LAS files there
          (the Ekene demonstration kit&apos;s 01-wells folder is one set), or upload a table here instead.
        </Note>
      </div>
    );
  }
  const valueLogs = (logs || []).filter((l) => !isDepthLog(l));
  return (
    <div className="space-y-2">
      <SelectField
        label="Well"
        value={wellId}
        onChange={setWellId}
        emptyLabel="Choose a well"
        testId="well-select"
        options={wells.map((w) => ({ value: w.id, label: w.name }))}
      />
      {wellId && logs && !valueLogs.length ? <Note>This well has no stored curves yet.</Note> : null}
      {valueLogs.length ? (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-slate-800 p-2">
          {valueLogs.map((l) => (
            <Toggle
              key={l.id}
              label={`${l.mnemonic}${l.unit ? ` (${l.unit})` : ''}, ${l.n_samples} samples`}
              checked={chosen.includes(l.id)}
              onChange={(on) => setChosen((c) => (on ? [...c, l.id] : c.filter((x) => x !== l.id)))}
            />
          ))}
        </div>
      ) : null}
      <ErrorLine error={error} />
      <Button size="sm" disabled={!wellId || !chosen.length || busy} onClick={load} data-testid="load-wells">
        {busy ? 'Reading curves' : 'Use these curves'}
      </Button>
    </div>
  );
};

const ProductionSource = () => {
  const { setDataset } = useDataQualityStudio();
  const [fields, setFields] = useState(null);
  const [fieldId, setFieldId] = useState('');
  const [wells, setWells] = useState(null);
  const [wellId, setWellId] = useState('');
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
    listPoWells(fieldId).then((w) => { if (!off) setWells(w); }).catch((e) => { if (!off) { setWells([]); setError(e.message); } });
    return () => { off = true; };
  }, [fieldId]);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const field = fields.find((f) => f.id === fieldId);
      const well = wells.find((w) => w.id === wellId);
      setDataset(await loadProductionDataset({ field, well, fieldWells: wells }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (fields === null) return <Note>Reading the production data spine.</Note>;
  if (!fields.length) {
    return (
      <div className="space-y-2">
        <ErrorLine error={error} />
        <Note testId="production-empty">
          No production fields are stored that you can see. Daily production is imported in the Production
          Surveillance Studio (the Ekene kit&apos;s ekene-daily-production.csv is one file), or upload the file here.
        </Note>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <SelectField label="Field" value={fieldId} onChange={(v) => { setFieldId(v); setWellId(''); }} emptyLabel="Choose a field" testId="field-select" options={fields.map((f) => ({ value: f.id, label: f.name }))} />
      {wells && !wells.length ? <Note>This field has no production wells yet.</Note> : null}
      {wells && wells.length ? (
        <SelectField label="Well" value={wellId} onChange={setWellId} emptyLabel="Choose a well" testId="po-well-select" options={wells.map((w) => ({ value: w.id, label: w.name }))} />
      ) : null}
      <ErrorLine error={error} />
      <Button size="sm" disabled={!fieldId || !wellId || busy} onClick={load} data-testid="load-production">
        {busy ? 'Reading rows' : 'Use this well'}
      </Button>
    </div>
  );
};

const UploadSource = () => {
  const { setDataset } = useDataQualityStudio();
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState(null);
  const [sheet, setSheet] = useState('');
  const [table, setTable] = useState(null);
  const [indexCol, setIndexCol] = useState('');
  const [idCol, setIdCol] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [idMode, setIdMode] = useState('distinct');
  const [chosen, setChosen] = useState([]);
  const [nullValue, setNullValue] = useState('');
  const [error, setError] = useState(null);

  const cols = useMemo(() => (table ? describeColumns(table) : []), [table]);

  const adopt = useCallback((t) => {
    setTable(t);
    const c = describeColumns(t);
    const date = c.find((x) => x.kind === 'date');
    const firstNum = c.find((x) => x.kind === 'number');
    const idx = date || firstNum || null;
    setIndexCol(idx ? String(idx.index) : '');
    const text = c.find((x) => x.kind === 'text');
    setIdCol(text ? String(text.index) : '');
    setFilterValue('');
    setChosen(c.filter((x) => x.kind === 'number' && (!idx || x.index !== idx.index)).map((x) => x.index));
  }, []);

  const onFile = async (file) => {
    setError(null);
    setTable(null);
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

  const idValues = useMemo(() => {
    if (!table || idCol === '') return [];
    return [...new Set(table.rows.map((r) => String(r[Number(idCol)] ?? '').trim()).filter(Boolean))];
  }, [table, idCol]);

  const use = () => {
    try {
      const ds = datasetFromTable(table, {
        label: `${fileName}${sheet ? ` [${sheet}]` : ''}${filterValue ? `, ${filterValue}` : ''}`,
        indexColumn: indexCol === '' ? null : Number(indexCol),
        idColumn: idCol === '' ? null : Number(idCol),
        filterValue,
        channelColumns: chosen,
        nullValues: nullValue.trim() ? nullValue.split(',').map((s) => s.trim()).filter(Boolean) : [],
        idMode,
      });
      if (!ds.channels.length) throw new Error('Choose at least one number column to check.');
      setDataset(ds);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-[11px] text-slate-400">
        <span>CSV, TSV, TXT or Excel file</span>
        <input
          type="file"
          accept=".csv,.tsv,.txt,.dat,.prn,.asc,.xlsx,.xlsm,.xls"
          data-testid="upload-input"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="mt-1 block w-full text-xs text-slate-300"
        />
      </label>
      <Note>
        The file stays in your browser. A saved run keeps the columns it checked so it can be re-run. Quoted cells
        may contain the delimiter, quotes written twice and line breaks.
      </Note>
      {sheets && sheets.length > 1 ? (
        <SelectField
          label="Sheet"
          value={sheet}
          onChange={(v) => { setSheet(v); adopt(tableFromRows(sheets.find((s) => s.name === v).rows)); }}
          options={sheets.map((s) => ({ value: s.name, label: s.name }))}
        />
      ) : null}
      {table && !table.rows.length ? <Note tone="warn">The file has no data rows.</Note> : null}
      {table && table.rows.length ? (
        <div className="space-y-2 rounded border border-slate-800 p-2" data-testid="upload-mapping">
          <p className="text-[11px] text-slate-400">{table.rows.length} rows, {cols.length} columns.</p>
          <SelectField label="Index (depth, time or date)" value={indexCol} onChange={setIndexCol} emptyLabel="None (row order)" testId="index-col" options={cols.map((c) => ({ value: String(c.index), label: `${c.name} (${c.kind})` }))} />
          <SelectField label="Identifier column" value={idCol} onChange={(v) => { setIdCol(v); setFilterValue(''); }} emptyLabel="None" testId="id-col" options={cols.map((c) => ({ value: String(c.index), label: `${c.name} (${c.kind})` }))} />
          {idCol !== '' ? (
            <>
              <SelectField label="Rows to check" value={filterValue} onChange={setFilterValue} emptyLabel="All rows" testId="filter-value" options={idValues.map((v) => ({ value: v, label: `Only ${v}` }))} />
              <SelectField
                label="Uniqueness is checked on"
                value={idMode}
                onChange={setIdMode}
                options={[
                  { value: 'distinct', label: 'the distinct values (a well repeats on each of its rows)' },
                  { value: 'rows', label: 'every row (each value should appear once)' },
                ]}
              />
            </>
          ) : null}
          <div className="space-y-1">
            <p className="text-[11px] text-slate-400">Number columns to check</p>
            {cols.filter((c) => c.kind === 'number' && String(c.index) !== indexCol).map((c) => (
              <Toggle key={c.index} label={c.name} checked={chosen.includes(c.index)} onChange={(on) => setChosen((x) => (on ? [...x, c.index] : x.filter((y) => y !== c.index)))} />
            ))}
            {!cols.some((c) => c.kind === 'number') ? <Note tone="warn">No column reads as numbers.</Note> : null}
          </div>
          <TextInput
            label="Extra missing-value codes"
            value={nullValue}
            onChange={setNullValue}
            placeholder="for example -999.25"
            width="w-40"
            source="Blank cells and NA, NaN, null, none and - are always missing. Add codes your file uses, separated by commas."
          />
          <Button size="sm" onClick={use} data-testid="use-upload">Use this table</Button>
        </div>
      ) : null}
      <ErrorLine error={error} />
    </div>
  );
};

const DatasetSummary = () => {
  const { dataset } = useDataQualityStudio();
  if (!dataset) return <Note testId="no-dataset">No data loaded. Choose a source above.</Note>;
  const n = Math.max(0, ...dataset.channels.map((c) => c.values.length));
  return (
    <div className="space-y-1 rounded border border-slate-800 bg-slate-950/60 p-2 text-xs" data-testid="dataset-summary">
      <p className="font-medium text-slate-100">{dataset.label}</p>
      <p className="text-slate-400">
        {n} samples; index {dataset.index ? `${dataset.index.name}${dataset.index.unit ? ` (${dataset.index.unit})` : ''}` : 'row order'};
        {' '}{dataset.channels.length} channel{dataset.channels.length === 1 ? '' : 's'}
        {dataset.identifiers ? `; ${dataset.identifiers.values.length} identifiers (${dataset.identifiers.name})` : ''}.
      </p>
      {dataset.notes.map((t) => <Note key={t}>{t}</Note>)}
      {dataset.channels.flatMap((c) => c.notes.map((t) => <Note key={`${c.key}${t}`} tone="warn">{c.name}: {t}</Note>))}
    </div>
  );
};

const DatasetPanel = () => {
  const { sourceKind, setSourceKind, reloadError, reloading } = useDataQualityStudio();
  return (
    <div className="space-y-3" data-testid="dataset-panel">
      <h2 className="text-sm font-semibold text-slate-100">Data</h2>
      <div className="flex gap-1" role="tablist" aria-label="Data source">
        {SOURCES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={sourceKind === id}
            onClick={() => setSourceKind(id)}
            className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs ${sourceKind === id ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      {sourceKind === 'wells' ? <WellsSource /> : null}
      {sourceKind === 'production' ? <ProductionSource /> : null}
      {sourceKind === 'upload' ? <UploadSource /> : null}
      {reloading ? <Note>Re-reading the saved run&apos;s data.</Note> : null}
      {reloadError ? <Note tone="warn" testId="reload-error">{reloadError}</Note> : null}
      <DatasetSummary />
    </div>
  );
};

export default DatasetPanel;
