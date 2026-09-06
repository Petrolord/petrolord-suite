// Expert-mode erosion editor (BF1): the events the engine models as
// phantom sections deposited at the surface and removed at the event
// age (age in Ma, amount removed in metres). Replaces "Erosion event
// manager coming in Phase 2".

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { erosionProblems } from '../../services/history';
import { depthToDisplay, depthFromDisplay, tidy } from '../../services/units';

export default function ErosionEventsEditor({ events, maxAge, onChange, depthUnit = 'm' }) {
  const list = Array.isArray(events) ? events : [];
  const setEvent = (i, patch) => onChange(list.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const add = () => onChange([...list, { age: 10, amount: 500 }]);
  const remove = (i) => onChange(list.filter((_, k) => k !== i));
  const problems = erosionProblems(list, maxAge);

  return (
    <div className="space-y-2" data-testid="bf-erosion-editor">
      {list.length === 0 && (
        <p className="text-xs text-slate-500" data-testid="bf-erosion-empty">No erosion events. The section is modelled as continuously preserved.</p>
      )}
      {list.length > 0 && (
        <table className="w-full text-xs text-slate-200" data-testid="bf-erosion-table">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="font-normal">Age (Ma)</th>
              <th className="font-normal">Removed ({depthUnit})</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((e, i) => (
              <tr key={i} className="border-t border-slate-800">
                <td className="py-1 pr-2">
                  <Input type="number" step="any" data-testid={`bf-erosion-age-${i}`} value={e.age} onChange={(ev) => setEvent(i, { age: parseFloat(ev.target.value) })} className="h-7 bg-slate-950 text-xs" />
                </td>
                <td className="py-1 pr-2">
                  <Input type="number" step="any" data-testid={`bf-erosion-amount-${i}`} value={tidy(depthToDisplay(e.amount, depthUnit))} onChange={(ev) => setEvent(i, { amount: depthFromDisplay(parseFloat(ev.target.value), depthUnit) })} className="h-7 bg-slate-950 text-xs" />
                </td>
                <td className="py-1 text-right">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-red-400" data-testid={`bf-erosion-remove-${i}`} onClick={() => remove(i)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="bf-erosion-add" onClick={add}>
        <Plus className="w-3 h-3 mr-1" /> Add erosion event
      </Button>
      {problems.map((p) => (
        <p key={p} className="text-[11px] text-amber-400" data-testid="bf-erosion-problem">{p}</p>
      ))}
      <p className="text-[11px] text-slate-500">
        Each event is a shale section of the given thickness deposited at the surface and removed at that age, so the
        rocks below it were buried deeper and hotter before the uplift. Ages count back from present.
      </p>
    </div>
  );
}
