// The laboratory data door of Fluid Systems Studio (FLUID-U2-001; RL10, PL2).
// A PVT report's tables arrive as plain tables: a CSV or text file, an Excel
// sheet or a pasted block. The door finds the columns by their header, takes
// the unit of each from the header or from the choices here, and reads back
// what it read and what it did not before anything is stored. The rows are
// saved with the project (inputs.labData) in the engine's units.
import React, { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FlaskConical, Trash2, Upload } from 'lucide-react';
import UnitField from '@/components/fluidstudio/UnitField';
import { useFluidUnits } from '@/components/fluidstudio/FluidUnitsContext';
import { readTabularFile } from '@/lib/tabularFile';
import {
  readLabTable, sheetText, labTableOf, labDataOf, labSaturationPressure, LAB_KINDS, LAB_UNITS, DEFAULT_LAB_UNITS,
} from '@/utils/fluidstudio/labData';

const UnitSelect = ({ label, value, onChange, options, testId }) => (
  <div>
    <Label className="text-xs text-pl-muted">{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="mt-1 h-8" data-testid={testId}><SelectValue /></SelectTrigger>
      <SelectContent>
        {Object.entries(options).map(([k, d]) => <SelectItem key={k} value={k}>{d.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

/**
 * @param {{inputs: object, setInputs: function, modelTempF?: ?number}} props
 */
const LabDataDoor = ({ inputs, setInputs, modelTempF = null }) => {
  const u = useFluidUnits();
  const lab = useMemo(() => labDataOf(inputs), [inputs]);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [sheets, setSheets] = useState(null); // workbook sheets, when the file is one
  const [sheet, setSheet] = useState('');
  const [units, setUnits] = useState({ ...DEFAULT_LAB_UNITS });
  const [decimal, setDecimal] = useState('');
  const [tempF, setTempF] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const fromSheet = sheets ? sheets.find((s) => s.name === sheet) : null;
  const source = fromSheet ? sheetText(fromSheet.rows) : text;
  const read = useMemo(
    () => (source.trim() ? readLabTable(source, { units, ...(decimal ? { decimal } : {}), ...(fromSheet ? { delimiter: '\t' } : {}) }) : null),
    [source, units, decimal, fromSheet],
  );

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setDecimal('');
    try {
      const res = await readTabularFile(file);
      setName(file.name);
      if (res.kind === 'workbook') {
        setSheets(res.sheets);
        setSheet(res.sheets[0]?.name || '');
        setText('');
      } else {
        setSheets(null);
        setSheet('');
        setText(res.text);
      }
    } catch (err) {
      setSheets(null);
      setText('');
      setName('');
      setError(err?.message || 'The file could not be read.');
    }
  };

  const patchLab = (patch) => setInputs((prev) => ({ ...prev, labData: { ...labDataOf(prev), ...patch } }));

  const load = () => {
    if (!read?.ok || read.needsAnswer) return;
    const table = labTableOf(read, {
      name: fromSheet ? `${name}, sheet ${sheet}` : (name || 'Pasted table'),
      tempF: tempF ?? modelTempF,
    });
    patchLab({ [read.kind]: table });
    setText('');
    setSheets(null);
    setSheet('');
    setName('');
    setDecimal('');
  };

  const sat = labSaturationPressure(lab);
  const loaded = ['cce', 'dl', 'viscosity'].filter((k) => lab[k]);
  const shownTemp = tempF ?? modelTempF;

  return (
    <div className="space-y-4 p-1" data-testid="lab-door">
      <h3 className="text-lg font-semibold text-pl-text flex items-center"><FlaskConical className="w-5 h-5 mr-2" />Laboratory PVT tables</h3>
      <p className="text-xs text-pl-muted">
        Load the tables of a PVT report: constant composition expansion (pressure and relative volume), differential liberation (pressure with Rsd, Bod and what else the laboratory measured) and viscosity. A CSV or text file, an Excel sheet or a pasted block. The first line of the table names the columns; they can be in any order.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.dat,.prn,.asc,.xlsx,.xlsm,.xls" className="hidden" data-testid="lab-file" onChange={onFile} />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-2" />Choose a file</Button>
        {name && <span className="text-xs text-pl-muted" data-testid="lab-file-name">{name}</span>}
      </div>
      {error && <p className="text-xs text-pl-warning-text" data-testid="lab-file-error">{error}</p>}

      {sheets && (
        <div>
          <Label className="text-xs text-pl-muted">Sheet</Label>
          <Select value={sheet} onValueChange={setSheet}>
            <SelectTrigger className="mt-1 h-8" data-testid="lab-sheet"><SelectValue /></SelectTrigger>
            <SelectContent>
              {sheets.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {!sheets && (
        <div>
          <Label htmlFor="lab-paste" className="text-xs text-pl-muted">Or paste the table</Label>
          <Textarea
            id="lab-paste"
            value={text}
            onChange={(e) => { setText(e.target.value); setName(''); setDecimal(''); }}
            placeholder={'Pressure (psig), Rsd (scf/STB), Bod, Oil viscosity (cP)\n2620, 854, 1.600, 0.373\n2350, 763, 1.554, 0.396'}
            className="h-28 mt-1 font-pl-mono tabular-nums text-sm"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <UnitSelect label="Pressure unit" value={units.pressure} onChange={(v) => setUnits((p) => ({ ...p, pressure: v }))} options={LAB_UNITS.pressure} testId="lab-unit-pressure" />
        <UnitSelect label="GOR unit" value={units.gor} onChange={(v) => setUnits((p) => ({ ...p, gor: v }))} options={LAB_UNITS.gor} testId="lab-unit-gor" />
        <UnitSelect label="Bg unit" value={units.fvfGas} onChange={(v) => setUnits((p) => ({ ...p, fvfGas: v }))} options={LAB_UNITS.fvfGas} testId="lab-unit-bg" />
        <UnitSelect label="Density unit" value={units.density} onChange={(v) => setUnits((p) => ({ ...p, density: v }))} options={LAB_UNITS.density} testId="lab-unit-density" />
      </div>
      <p className="text-xs text-pl-muted -mt-2">A unit named in a column header is used; these apply to a column whose header names none.</p>
      <UnitField label="Temperature of the test" id="lab-temp" kind="temperature" value={shownTemp} onChange={setTempF} hint="As stated on the laboratory table. It is set against the temperature of the model." />

      {read && (
        <div className="rounded-md border border-pl-border bg-pl-sunken px-3 py-2 text-xs text-pl-text space-y-1" data-testid="lab-readback" data-ok={read.ok ? 'yes' : 'no'} data-kind={read.kind || ''} data-rows={read.rows.length}>
          <p className={read.ok ? '' : 'text-pl-warning-text'}>{read.summary}</p>
          {read.skipped.length > 0 && (
            <ul className="space-y-0.5 text-pl-warning-text">
              {read.skipped.slice(0, 8).map((sk) => <li key={`${sk.line}-${sk.reason}`}>Line {sk.line} not read: {sk.reason} ("{sk.text.slice(0, 40)}")</li>)}
              {read.skipped.length > 8 && <li>and {read.skipped.length - 8} more</li>}
            </ul>
          )}
          {read.needsAnswer && (
            <div className="pt-1" data-testid="lab-question">
              {read.questions.map((q) => <p key={q} className="text-pl-warning-text">{q}</p>)}
              <div className="flex gap-2 mt-1">
                <Button size="sm" variant="outline" onClick={() => setDecimal('.')}>The comma separates thousands</Button>
                <Button size="sm" variant="outline" onClick={() => setDecimal(',')}>The comma is the decimal mark</Button>
              </div>
            </div>
          )}
          {read.ok && !read.needsAnswer && (
            <Button size="sm" className="mt-1" onClick={load} data-testid="lab-load">
              {lab[read.kind] ? `Replace the ${LAB_KINDS[read.kind].short} table` : `Load the ${LAB_KINDS[read.kind].short} table`}
            </Button>
          )}
        </div>
      )}

      {loaded.length > 0 && (
        <div className="space-y-2" data-testid="lab-loaded">
          <h4 className="text-sm font-semibold text-pl-text">Loaded with this project</h4>
          {loaded.map((k) => (
            <div key={k} className="rounded-md border border-pl-border px-3 py-2 text-xs text-pl-text" data-testid={`lab-table-${k}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{LAB_KINDS[k].label}: {lab[k].rows.length} rows{lab[k].tempF != null ? ` at ${Number(u.show('temperature', lab[k].tempF).toFixed(1))} ${u.label('temperature')}` : ''}</span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-pl-muted hover:text-pl-text" title={`Remove the ${LAB_KINDS[k].short} table`} onClick={() => patchLab({ [k]: null })}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-pl-muted">{lab[k].source?.name || 'Pasted table'}</p>
              <p className="text-pl-muted">{lab[k].source?.summary}</p>
            </div>
          ))}
          {sat && (
            <p className="text-xs text-pl-text" data-testid="lab-psat">
              Laboratory saturation pressure: {Math.round(u.show('pressure', sat.pressure)).toLocaleString('en-US')} {u.label('pressure')} ({sat.from === 'cce' ? 'the expansion row with relative volume 1' : 'the highest pressure of the differential liberation'}).
            </p>
          )}
        </div>
      )}

      {lab.dl && (
        <div className="space-y-3" data-testid="lab-basis">
          <h4 className="text-sm font-semibold text-pl-text">Basis of the differential liberation</h4>
          <Select value={lab.dlBasis} onValueChange={(v) => patchLab({ dlBasis: v })}>
            <SelectTrigger className="h-8" data-testid="lab-dl-basis"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="differential">As the laboratory reports it (per barrel of residual oil)</SelectItem>
              <SelectItem value="separator">Already adjusted to the separator basis</SelectItem>
            </SelectContent>
          </Select>
          {lab.dlBasis === 'differential' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <UnitField label="Separator test Bofb" id="lab-bofb" kind="fvfOil" value={lab.separatorTest.bofb} onChange={(v) => patchLab({ separatorTest: { ...lab.separatorTest, bofb: v } })} />
                <UnitField label="Separator test Rsfb" id="lab-rsfb" kind="gor" value={lab.separatorTest.rsfb} onChange={(v) => patchLab({ separatorTest: { ...lab.separatorTest, rsfb: v } })} />
              </div>
              <p className="text-xs text-pl-muted">
                The model table is per stock-tank barrel of the separator train. With the oil formation volume factor and the total GOR of the separator test at the bubble point, the differential rows are adjusted to that basis before they are compared or matched. Without them they are drawn as differential, for reference.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LabDataDoor;
