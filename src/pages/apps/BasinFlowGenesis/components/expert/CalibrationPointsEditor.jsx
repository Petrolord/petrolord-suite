// Calibration points editor (BF2): the Ro and temperature tables a
// tester compares the model against. Before this the Calibration tab
// had no way to enter a point; Auto-Fit answered "Add calibration
// points" and the Import tab fabricated them.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';

function PointTable({ kind, label, unit, points, onChange, defaults }) {
  const set = (i, patch) => onChange(points.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const add = () => onChange([...points, { id: Date.now(), ...defaults }]);
  const remove = (i) => onChange(points.filter((_, k) => k !== i));
  return (
    <div className="space-y-1" data-testid={`bf-cal-${kind}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <Button variant="ghost" size="sm" className="h-6 text-xs text-indigo-300" data-testid={`bf-cal-${kind}-add`} onClick={add}>
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>
      {points.length === 0 ? (
        <p className="text-[11px] text-slate-500">None yet. Add a point or import a file.</p>
      ) : (
        <table className="w-full text-xs text-slate-200">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="font-normal">Depth (m)</th>
              <th className="font-normal">{unit}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={p.id ?? i} className="border-t border-slate-800">
                <td className="py-0.5 pr-1"><Input type="number" step="any" data-testid={`bf-cal-${kind}-depth-${i}`} value={p.depth} onChange={(e) => set(i, { depth: parseFloat(e.target.value) })} className="h-7 bg-slate-950 text-xs" /></td>
                <td className="py-0.5 pr-1"><Input type="number" step="any" data-testid={`bf-cal-${kind}-value-${i}`} value={p.value} onChange={(e) => set(i, { value: parseFloat(e.target.value) })} className="h-7 bg-slate-950 text-xs" /></td>
                <td className="py-0.5 text-right"><Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-red-400" data-testid={`bf-cal-${kind}-remove-${i}`} onClick={() => remove(i)}><Trash2 className="w-3 h-3" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function CalibrationPointsEditor({ ro, temp, onChange }) {
  return (
    <div className="space-y-3">
      <PointTable kind="ro" label="Vitrinite reflectance" unit="Ro (%)" points={ro} onChange={(pts) => onChange({ ro: pts, temp })} defaults={{ depth: 2000, value: 0.6 }} />
      <PointTable kind="temp" label="Temperature (BHT, DST)" unit="T (°C)" points={temp} onChange={(pts) => onChange({ ro, temp: pts })} defaults={{ depth: 2000, value: 80 }} />
    </div>
  );
}
