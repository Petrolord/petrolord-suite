// Production & injection period grid (VRR Monitor main area, Data tab).
// Manual entry in the display units (stored in oilfield units), the grid's
// own file through the shared typed reader (VRR-U1-005), optional
// per-period PVT override columns, and cells that are not numbers named.
import React, { useRef, useState } from 'react';
import { Plus, Trash2, Upload, Download, RotateCcw, Beaker, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { parsePeriodGridCSV } from '@/utils/vrr/csvImport';
import { buildGridCsv } from '@/utils/vrr/ledgerCsv';
import { statusAgainstBand } from './vrrBand';
import { THEMED_TONE, THEMED_TONE_TEXT } from '@/components/studio/studioTheme';
import { downloadText } from './download';
import UnitInput from './UnitInput';

export const COLS = [
  { key: 'label', label: 'Period', kind: null },
  { key: 'Np', label: 'Oil Prod', kind: 'oil' },
  { key: 'Wp', label: 'Water Prod', kind: 'water' },
  { key: 'Gp', label: 'Gas Prod', kind: 'gas' },
  { key: 'Wi', label: 'Water Inj', kind: 'water' },
  { key: 'Gi', label: 'Gas Inj', kind: 'gas' },
];

// Optional per-period PVT overrides; a blank cell falls back to the
// global FVF set (engine resolveFvf semantics).
const PVT_COLS = [
  { key: 'Bo', label: 'Bo', kind: 'bo' },
  { key: 'Bw', label: 'Bw', kind: 'bw' },
  { key: 'Bg', label: 'Bg', kind: 'bg' },
  { key: 'Rs', label: 'Rs', kind: 'rs' },
];

const fmt = (v, d = 0) =>
  v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

const PeriodGridPanel = () => {
  const {
    inputs, series, updatePeriodCell, addPeriod, removePeriod, setPeriods,
    loadSample, clearAll, addNotification, targetBand, u, withheld, periodIssues, canWrite,
  } = useVrrMonitor();
  const fileRef = useRef(null);
  const [showPvt, setShowPvt] = useState(false);
  const cols = showPvt ? [...COLS, ...PVT_COLS] : COLS;

  const importCsv = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = parsePeriodGridCSV(String(reader.result), { system: u.system });
      if (r.refusal) { addNotification(r.refusal, 'error'); return; }
      setPeriods(r.periods, { file: file.name, at: new Date().toISOString(), units: r.units, warnings: r.warnings });
      addNotification(`Imported ${r.periods.length} periods${r.warnings.length ? `; ${r.warnings.join(' ')}` : ''}${r.skipped.length ? `; ${r.skipped.length} lines left out` : ''}`, r.warnings.length ? 'info' : 'success');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base">Production &amp; injection by period</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadSample} disabled={!canWrite}><Beaker className="w-4 h-4 mr-1" /> Sample</Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={!canWrite} title="Read a grid file: label, Np, Wp, Gp, Wi, Gi with units in the headers"><Upload className="w-4 h-4 mr-1" /> Import</Button>
          <Button variant="outline" size="sm" onClick={() => downloadText(buildGridCsv(inputs.periods, u.system), 'vrr_data.csv')} title="The grid in the display units, readable by Import"><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button variant="outline" size="sm" onClick={clearAll} disabled={!canWrite}><RotateCcw className="w-4 h-4 mr-1" /> Clear</Button>
          <Button
            variant="outline" size="sm"
            className={showPvt ? 'bg-pl-primary/10 border-pl-primary text-pl-primary-text hover:bg-pl-primary/15' : ''}
            aria-pressed={showPvt}
            onClick={() => setShowPvt((v) => !v)}
            title="Show per-period Bo/Bw/Bg/Rs override columns"
          >
            <FlaskConical className="w-4 h-4 mr-1" /> PVT overrides
          </Button>
          <Button size="sm" onClick={addPeriod} disabled={!canWrite}><Plus className="w-4 h-4 mr-1" /> Add period</Button>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={importCsv} data-testid="vrr-grid-file" />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {cols.map((c) => (
                <TableHead key={c.key} className="whitespace-nowrap">
                  {c.label}{c.kind ? <span className="ml-1 normal-case font-normal">({u.label(c.kind)})</span> : null}
                </TableHead>
              ))}
              <TableHead className="text-right whitespace-nowrap">Inst. VRR</TableHead>
              <TableHead className="text-right whitespace-nowrap">Cum. VRR</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {series.map((row, i) => {
              // Coloured against the user's target band, as the flags are.
              const band = statusAgainstBand(withheld ? null : row.instantaneousVRR, targetBand);
              return (
                <TableRow key={i}>
                  {cols.map((c) => (
                    <TableCell key={c.key} className="p-1">
                      {c.kind ? (
                        <UnitInput
                          kind={c.kind}
                          value={inputs.periods[i]?.[c.key] ?? ''}
                          onChange={(v) => updatePeriodCell(i, c.key, v)}
                          placeholder={PVT_COLS.some((pc) => pc.key === c.key) ? 'constant' : '0'}
                          className="h-8 font-pl-mono tabular-nums w-24 text-right"
                          aria-label={`${c.label} ${row.label || `P${i + 1}`}`}
                          aria-invalid={periodIssues.some((x) => x.row === i && x.key === c.key) || undefined}
                        />
                      ) : (
                      <Input
                        value={inputs.periods[i]?.[c.key] ?? ''}
                        onChange={(e) => updatePeriodCell(i, c.key, e.target.value)}
                        placeholder={c.key === 'label' ? 'YYYY-MM' : PVT_COLS.some((pc) => pc.key === c.key) ? 'constant' : '0'}
                        className={`h-8 font-pl-mono tabular-nums ${c.key === 'label' ? 'w-24' : 'w-24 text-right'}`}
                        aria-label={`${c.label} ${row.label || `P${i + 1}`}`}
                        aria-invalid={periodIssues.some((x) => x.row === i && x.key === c.key) || undefined}
                      />
                      )}
                    </TableCell>
                  ))}
                  <TableCell className={`text-right font-pl-mono tabular-nums font-semibold ${THEMED_TONE_TEXT[band.tone] || THEMED_TONE_TEXT.neutral}`} title={band.label}>
                    {withheld ? EMPTY_VALUE : fmt(row.instantaneousVRR, 2)}
                  </TableCell>
                  <TableCell className="text-right font-pl-mono tabular-nums">{withheld ? EMPTY_VALUE : fmt(row.cumulativeVRR, 2)}</TableCell>
                  <TableCell className="p-1">
                    <button onClick={() => removePeriod(i)} className="rounded text-pl-muted hover:text-pl-danger-text" title="Remove period" disabled={!canWrite}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {periodIssues.length > 0 && (
          <div className={`mt-2 text-xs border rounded px-2 py-1.5 space-y-0.5 ${THEMED_TONE.warn}`} data-testid="vrr-period-issues">
            {periodIssues.slice(0, 6).map((x, i) => <div key={i}>{x.text}</div>)}
            {periodIssues.length > 6 && <div>...and {periodIssues.length - 6} more.</div>}
          </div>
        )}
        <p className="text-xs text-pl-muted mt-3">
          Voidage is computed in reservoir volume. Only free (excess) produced gas adds voidage; solution
          gas (Rs x oil) is already in B<sub>o</sub>. The constant fluid-property set applies to every period
          unless a PVT override cell is filled (toggle the PVT overrides columns) or a pressure track is on.
          Label periods YYYY-MM to give them a date: pressure surveys and the calendar figures need it.
        </p>
      </CardContent>
    </Card>
  );
};

export default PeriodGridPanel;
