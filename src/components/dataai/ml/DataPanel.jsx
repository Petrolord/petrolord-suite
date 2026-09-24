// ML Workbench: pick the data (Data & AI D2).
//
// Two sources: several wells from the wells registry (Well Data Manager),
// read through the registry's own service, or a table uploaded in the
// browser with a column naming the well of every row. Empty states say what
// is missing and where it comes from; nothing is filled in.
import React, { useEffect, useMemo, useState } from 'react';
import { Database, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMlWorkbench } from '@/contexts/MlWorkbenchContext';
import { listWells, curveInventory, loadWellsTable } from '@/utils/dataAi/mlSources';
import { tableFromUpload } from '@/utils/dataAi/mlData';
import { describeColumns } from '@/utils/dataAi/qcDatasets';
import {
  readTabularFile, parseDelimitedText, tableFromRows, unsupportedFileMessage, classifyFile,
} from '@/lib/tabularFile';
import {
  Note, SelectField, Toggle, TextInput,
} from '@/components/dataai/quality/shared';

const SOURCES = [
  { id: 'wells', label: 'Well logs', icon: Database },
  { id: 'upload', label: 'Upload', icon: Upload },
];

const ErrorLine = ({ error }) => (error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null);

const WellsSource = () => {
  const { setTable } = useMlWorkbench();
  const [wells, setWells] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [curves, setCurves] = useState(null);
  const [pickedCurves, setPickedCurves] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let off = false;
    listWells().then((w) => { if (!off) setWells(w); }).catch((e) => { if (!off) { setWells([]); setError(e.message); } });
    return () => { off = true; };
  }, []);

  const chosenWells = useMemo(() => (wells || []).filter((w) => chosen.includes(w.id)), [wells, chosen]);

  const readCurves = async () => {
    setBusy(true);
    setError(null);
    try {
      const inv = await curveInventory(chosenWells);
      setCurves(inv);
      setPickedCurves(inv.filter((c) => c.wells.length === chosenWells.length).map((c) => c.name));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const t = await loadWellsTable(chosenWells, pickedCurves);
      setTable(t, { wellIds: chosenWells.map((w) => w.id), wellNames: chosenWells.map((w) => w.name), curves: pickedCurves });
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
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">Wells (choose two or more: validation holds out whole wells)</p>
      <div className="max-h-44 space-y-1 overflow-y-auto rounded border border-slate-800 p-2" data-testid="well-list">
        {wells.map((w) => (
          <Toggle
            key={w.id}
            label={w.name}
            checked={chosen.includes(w.id)}
            onChange={(on) => { setCurves(null); setChosen((c) => (on ? [...c, w.id] : c.filter((x) => x !== w.id))); }}
          />
        ))}
      </div>
      <Button size="sm" variant="secondary" disabled={chosen.length < 1 || busy} onClick={readCurves} data-testid="read-curves">
        {busy && !curves ? 'Reading curve lists' : 'List their curves'}
      </Button>
      {curves ? (
        <div className="space-y-1 rounded border border-slate-800 p-2" data-testid="curve-list">
          <p className="text-[11px] text-slate-400">Curves to read (target, label and features all come from these)</p>
          {curves.map((c) => (
            <Toggle
              key={c.name}
              label={`${c.name}${c.unit ? ` (${c.unit})` : ''}, in ${c.wells.length} of ${chosenWells.length} wells`}
              checked={pickedCurves.includes(c.name)}
              onChange={(on) => setPickedCurves((x) => (on ? [...x, c.name] : x.filter((y) => y !== c.name)))}
            />
          ))}
          {!curves.length ? <Note>These wells have no stored curves yet.</Note> : null}
        </div>
      ) : null}
      <ErrorLine error={error} />
      {curves ? (
        <Button size="sm" disabled={!pickedCurves.length || busy} onClick={load} data-testid="load-wells">
          {busy ? 'Reading curves' : 'Use these wells and curves'}
        </Button>
      ) : null}
    </div>
  );
};

const UploadSource = () => {
  const { setTable } = useMlWorkbench();
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState(null);
  const [sheet, setSheet] = useState('');
  const [parsed, setParsed] = useState(null);
  const [groupCol, setGroupCol] = useState('');
  const [depthCol, setDepthCol] = useState('');
  const [chosen, setChosen] = useState([]);
  const [nullValue, setNullValue] = useState('');
  const [error, setError] = useState(null);

  const cols = useMemo(() => (parsed ? describeColumns(parsed) : []), [parsed]);

  const adopt = (t) => {
    setParsed(t);
    const c = describeColumns(t);
    const text = c.find((x) => x.kind === 'text');
    setGroupCol(text ? String(text.index) : '');
    const depth = c.find((x) => x.kind === 'number' && /^(DEPT|DEPTH|MD)/i.test(x.name));
    setDepthCol(depth ? String(depth.index) : '');
    setChosen(c.filter((x) => x.kind === 'number' && (!depth || x.index !== depth.index)).map((x) => x.index));
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
      const t = tableFromUpload(parsed, {
        label: `${fileName}${sheet ? ` [${sheet}]` : ''}`,
        groupColumn: groupCol === '' ? null : Number(groupCol),
        depthColumn: depthCol === '' ? null : Number(depthCol),
        valueColumns: chosen,
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
        <span>CSV, TSV, TXT or Excel file, one row per sample</span>
        <input
          type="file"
          accept=".csv,.tsv,.txt,.dat,.prn,.asc,.xlsx,.xlsm,.xls"
          data-testid="upload-input"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="mt-1 block w-full text-xs text-slate-300"
        />
      </label>
      <Note>
        The file stays in your browser. It needs a column naming the well of each row, because validation holds out
        whole wells. A label column for classification holds 0 and 1. A saved run keeps the columns so it can be re-run.
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
          <SelectField label="Well (group) column" value={groupCol} onChange={setGroupCol} emptyLabel="Choose" testId="group-col" options={cols.map((c) => ({ value: String(c.index), label: `${c.name} (${c.kind})` }))} />
          <SelectField label="Depth column" value={depthCol} onChange={setDepthCol} emptyLabel="None" testId="depth-col" options={cols.filter((c) => c.kind === 'number').map((c) => ({ value: String(c.index), label: c.name }))} />
          <div className="space-y-1">
            <p className="text-[11px] text-slate-400">Number columns (target, label and features)</p>
            {cols.filter((c) => c.kind === 'number' && String(c.index) !== depthCol && String(c.index) !== groupCol).map((c) => (
              <Toggle key={c.index} label={c.name} checked={chosen.includes(c.index)} onChange={(on) => setChosen((x) => (on ? [...x, c.index] : x.filter((y) => y !== c.index)))} />
            ))}
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

const TableSummary = () => {
  const { table } = useMlWorkbench();
  if (!table) return <Note testId="no-data">No data loaded. Choose a source above.</Note>;
  return (
    <div className="space-y-1 rounded border border-slate-800 bg-slate-950/60 p-2 text-xs" data-testid="table-summary">
      <p className="font-medium text-slate-100">{table.label}</p>
      <p className="text-slate-400">
        {table.group.length.toLocaleString('en-US')} rows from {table.wells.length} well{table.wells.length === 1 ? '' : 's'};
        curves {Object.keys(table.columns).join(', ') || 'none'}{table.depth ? '' : '; no depth'}.
      </p>
      {table.notes.map((t) => <Note key={t}>{t}</Note>)}
    </div>
  );
};

const DataPanel = () => {
  const { sourceKind, setSourceKind, reloadError, reloading } = useMlWorkbench();
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
            className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs ${sourceKind === id ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      {sourceKind === 'wells' ? <WellsSource /> : <UploadSource />}
      {reloading ? <Note>Re-reading the saved run&apos;s data.</Note> : null}
      {reloadError ? <Note tone="warn" testId="reload-error">{reloadError}</Note> : null}
      <TableSummary />
    </div>
  );
};

export default DataPanel;
