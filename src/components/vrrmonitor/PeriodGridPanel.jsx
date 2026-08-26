// Production & injection period grid (VRR Monitor main area, Data tab).
// Manual entry plus the legacy exact-header CSV round-trip (the per-well
// importer lives in ImportPanel). V3 adds optional per-period PVT override
// columns — the engine's resolveFvf has honored them all along.
import React, { useRef, useState } from 'react';
import { Plus, Trash2, Upload, Download, RotateCcw, Beaker, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useVrrMonitor, emptyPeriod } from '@/contexts/VrrMonitorContext';
import { classifyVRR } from '@/utils/vrrCalculations';

export const COLS = [
  { key: 'label', label: 'Period', unit: '' },
  { key: 'Np', label: 'Oil Prod', unit: 'STB' },
  { key: 'Wp', label: 'Water Prod', unit: 'STB' },
  { key: 'Gp', label: 'Gas Prod', unit: 'Mscf' },
  { key: 'Wi', label: 'Water Inj', unit: 'bbl' },
  { key: 'Gi', label: 'Gas Inj', unit: 'Mscf' },
];

// Optional per-period PVT overrides; a blank cell falls back to the
// global FVF set (engine resolveFvf semantics).
const PVT_COLS = [
  { key: 'Bo', label: 'Bo', unit: 'RB/STB' },
  { key: 'Bw', label: 'Bw', unit: 'RB/STB' },
  { key: 'Bg', label: 'Bg', unit: 'RB/Mscf' },
  { key: 'Rs', label: 'Rs', unit: 'scf/STB' },
];

const fmt = (v, d = 0) =>
  v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

const PeriodGridPanel = () => {
  const {
    inputs, series, updatePeriodCell, addPeriod, removePeriod, setPeriods,
    loadSample, clearAll, addNotification,
  } = useVrrMonitor();
  const fileRef = useRef(null);
  const [showPvt, setShowPvt] = useState(false);
  const cols = showPvt ? [...COLS, ...PVT_COLS] : COLS;

  const exportCsv = () => {
    const header = COLS.map((c) => c.key).join(',');
    const rows = inputs.periods.map((p) => COLS.map((c) => p[c.key] ?? '').join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vrr_data.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lines = String(reader.result).trim().split(/\r?\n/);
        const header = lines[0].split(',').map((h) => h.trim());
        const parsed = lines.slice(1).map((line) => {
          const cells = line.split(',');
          const row = emptyPeriod();
          header.forEach((h, idx) => {
            if (h in row) row[h] = (cells[idx] ?? '').trim();
          });
          return row;
        });
        if (parsed.length) {
          setPeriods(parsed);
          addNotification(`Imported ${parsed.length} periods`, 'success');
        }
      } catch (err) {
        addNotification('Import failed. Expected columns: label,Np,Wp,Gp,Wi,Gi', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base">Production &amp; injection by period</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadSample}><Beaker className="w-4 h-4 mr-1" /> Sample</Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-1" /> Import</Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button variant="outline" size="sm" onClick={clearAll}><RotateCcw className="w-4 h-4 mr-1" /> Clear</Button>
          <Button
            variant="outline" size="sm"
            className={showPvt ? 'bg-sky-500/10 border-sky-500/40 text-sky-300' : ''}
            onClick={() => setShowPvt((v) => !v)}
            title="Show per-period Bo/Bw/Bg/Rs override columns"
          >
            <FlaskConical className="w-4 h-4 mr-1" /> PVT overrides
          </Button>
          <Button size="sm" onClick={addPeriod}><Plus className="w-4 h-4 mr-1" /> Add period</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              {cols.map((c) => (
                <TableHead key={c.key} className="text-slate-400 whitespace-nowrap">
                  {c.label}{c.unit ? <span className="text-slate-600 ml-1">({c.unit})</span> : null}
                </TableHead>
              ))}
              <TableHead className="text-slate-400 text-right whitespace-nowrap">Inst. VRR</TableHead>
              <TableHead className="text-slate-400 text-right whitespace-nowrap">Cum. VRR</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {series.map((row, i) => {
              const band = classifyVRR(row.instantaneousVRR);
              return (
                <TableRow key={i} className="border-slate-800">
                  {cols.map((c) => (
                    <TableCell key={c.key} className="p-1">
                      <Input
                        value={inputs.periods[i]?.[c.key] ?? ''}
                        onChange={(e) => updatePeriodCell(i, c.key, e.target.value)}
                        placeholder={c.key === 'label' ? `P${i + 1}` : PVT_COLS.some((pc) => pc.key === c.key) ? 'global' : '0'}
                        className={`h-8 bg-slate-800 border-slate-700 ${c.key === 'label' ? 'w-24' : 'w-24 text-right'}`}
                      />
                    </TableCell>
                  ))}
                  <TableCell className={`text-right font-mono ${band.tone === 'warn' ? 'text-amber-400' : band.tone === 'info' ? 'text-sky-400' : band.tone === 'good' ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {fmt(row.instantaneousVRR, 2)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-slate-300">{fmt(row.cumulativeVRR, 2)}</TableCell>
                  <TableCell className="p-1">
                    <button onClick={() => removePeriod(i)} className="text-slate-500 hover:text-red-400" title="Remove period">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="text-xs text-slate-500 mt-3">
          Voidage is computed in reservoir barrels. Only free (excess) produced gas adds voidage; solution
          gas (Rs x oil) is already in B<sub>o</sub>. The global fluid-property set applies to every period
          unless a PVT override cell is filled (toggle the PVT overrides columns) or the pressure track is on.
        </p>
      </CardContent>
    </Card>
  );
};

export default PeriodGridPanel;
