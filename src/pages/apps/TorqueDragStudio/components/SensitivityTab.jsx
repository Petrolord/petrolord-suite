// Friction-factor sensitivity: sweep cased x open friction factors for one
// operation, matrix of hookload/torque.

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Grid3X3 } from 'lucide-react';
import { runSensitivity, forceOut, torqueOut, forceLabel, torqueLabel } from '../services/tdRun';
import { OP_LABELS } from '../charts/TdCharts';
import { OPERATIONS } from '../engine/torqueDrag';

const SWEEP = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4];

export default function SensitivityTab({ stations, caseDraft, geometryRow, depthUnit }) {
  const [operation, setOperation] = useState('trip_out');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sweep = () => {
    setBusy(true);
    setError(null);
    try {
      setRows(runSensitivity({
        stations, caseRow: caseDraft, geometryRow, operation,
        casedValues: SWEEP, openValues: SWEEP, stepM: 10,
      }));
    } catch (e) {
      setError(e.message);
      setRows(null);
    } finally {
      setBusy(false);
    }
  };

  const showTorque = operation.includes('rotate') || operation === 'backream';
  const cellValue = (r) => (showTorque
    ? torqueOut(r.surfaceTorqueNm, depthUnit).toFixed(1)
    : forceOut(r.hookloadN, depthUnit).toFixed(0));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center gap-2">
        <Select value={operation} onValueChange={setOperation}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPERATIONS.map((op) => <SelectItem key={op} value={op}>{OP_LABELS[op] || op}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8" onClick={sweep} disabled={busy} data-testid="td-sweep">
          <Grid3X3 className="mr-1 h-3.5 w-3.5" /> {busy ? 'Sweeping…' : 'Sweep friction factors'}
        </Button>
        {error && <span className="text-xs text-pl-danger-text">{error}</span>}
      </div>
      {rows && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-pl-muted">
            {showTorque ? `Surface torque (${torqueLabel(depthUnit)})` : `Hookload (${forceLabel(depthUnit)})`}. Rows: FF cased, columns: FF open
          </div>
          <table className="font-pl-mono text-xs tabular-nums text-pl-text" data-testid="td-sweep-table">
            <thead>
              <tr>
                <th className="p-1 pr-3 text-left text-[10px] text-pl-muted">cased \ open</th>
                {SWEEP.map((o) => <th key={o} className="p-1 px-3 text-right text-[10px] text-pl-muted">{o.toFixed(2)}</th>)}
              </tr>
            </thead>
            <tbody>
              {SWEEP.map((c) => (
                <tr key={c} className="border-t border-pl-border">
                  <td className="p-1 pr-3 text-[10px] text-pl-muted">{c.toFixed(2)}</td>
                  {SWEEP.map((o) => {
                    const r = rows.find((x) => x.cased === c && x.open === o);
                    return <td key={o} className="p-1 px-3 text-right">{r ? cellValue(r) : '--'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
