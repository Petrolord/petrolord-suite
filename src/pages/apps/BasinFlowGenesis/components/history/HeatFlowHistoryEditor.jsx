// Expert-mode heat-flow editor (BF1): constant or a piecewise-linear
// history in age (the engine interpolates between points and holds
// the end values), edited as a table with the chart under it. Replaces
// the "future updates will allow time-variant heat flow" note.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import HeatFlowChart from './HeatFlowChart';
import { normalizeHistory, heatFlowProblems } from '../../services/history';

export default function HeatFlowHistoryEditor({ heatFlow, maxAge, onChange }) {
  const history = Array.isArray(heatFlow.history) && heatFlow.history.length
    ? heatFlow.history
    : [{ age: Math.max(1, maxAge || 100), value: heatFlow.value || 60 }, { age: 0, value: heatFlow.value || 60 }];
  const setType = (type) => onChange({ type, ...(type === 'variable' ? { history } : {}) });
  const setPoint = (i, patch) => {
    const next = history.map((p, k) => (k === i ? { ...p, ...patch } : p));
    onChange({ history: next });
  };
  const addPoint = () => onChange({ history: [...history, { age: 0, value: history[history.length - 1]?.value || 60 }] });
  const removePoint = (i) => onChange({ history: history.filter((_, k) => k !== i) });
  const sortPoints = () => onChange({ history: normalizeHistory(history) });
  const problems = heatFlowProblems(heatFlow, maxAge);

  return (
    <div className="space-y-3" data-testid="bf-heatflow-editor">
      <div className="flex items-center gap-1">
        {['constant', 'variable'].map((t) => (
          <button
            key={t}
            type="button"
            data-testid={`bf-heatflow-type-${t}`}
            className={`px-2 py-1 text-xs rounded border capitalize
              ${(heatFlow.type || 'constant') === t ? 'border-purple-500/60 text-purple-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
            onClick={() => setType(t)}
          >
            {t === 'constant' ? 'Constant' : 'History'}
          </button>
        ))}
      </div>

      {(heatFlow.type || 'constant') === 'constant' ? (
        <div>
          <Label className="text-xs text-slate-400">Basal heat flow (mW/m²)</Label>
          <Input
            type="number"
            step="any"
            data-testid="bf-heatflow-value"
            value={heatFlow.value ?? ''}
            onChange={(e) => onChange({ value: parseFloat(e.target.value) })}
            className="mt-1 bg-slate-950 h-8"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <table className="w-full text-xs text-slate-200" data-testid="bf-heatflow-table">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="font-normal">Age (Ma)</th>
                <th className="font-normal">Heat flow (mW/m²)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.map((p, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="py-1 pr-2">
                    <Input type="number" step="any" data-testid={`bf-heatflow-age-${i}`} value={p.age} onChange={(e) => setPoint(i, { age: parseFloat(e.target.value) })} onBlur={sortPoints} className="h-7 bg-slate-950 text-xs" />
                  </td>
                  <td className="py-1 pr-2">
                    <Input type="number" step="any" data-testid={`bf-heatflow-q-${i}`} value={p.value} onChange={(e) => setPoint(i, { value: parseFloat(e.target.value) })} className="h-7 bg-slate-950 text-xs" />
                  </td>
                  <td className="py-1 text-right">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-red-400" data-testid={`bf-heatflow-remove-${i}`} onClick={() => removePoint(i)} disabled={history.length <= 2}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="bf-heatflow-add" onClick={addPoint}>
            <Plus className="w-3 h-3 mr-1" /> Add point
          </Button>
          <p className="text-[11px] text-slate-500">Linear between points; the oldest and youngest values are held outside them.</p>
        </div>
      )}

      {problems.map((p) => (
        <p key={p} className="text-[11px] text-amber-400" data-testid="bf-heatflow-problem">{p}</p>
      ))}
      <HeatFlowChart heatFlow={heatFlow} maxAge={maxAge} />
    </div>
  );
}
