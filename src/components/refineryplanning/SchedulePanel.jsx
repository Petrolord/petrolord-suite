// The schedule the plan cascades into (DS3).
import React from 'react';
import { Info } from 'lucide-react';
import { useRefineryPlanning, materialName } from '@/contexts/RefineryPlanningContext';

const fmt = (v) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : 'n/a');

const TYPE_LABEL = {
  receipt: 'Crude receipt',
  unit_run: 'Unit run',
  delivery: 'Product lift',
};

const SchedulePanel = () => {
  const { schedule, inputs } = useRefineryPlanning();
  const byDate = [...schedule.events].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded border border-pl-border bg-pl-surface p-3">
        <Info className="w-4 h-4 text-pl-muted mt-0.5 shrink-0" />
        <p className="text-xs text-pl-muted">{schedule.note}</p>
      </div>

      {byDate.length === 0 ? (
        <p className="text-sm text-pl-muted">No plan to cascade yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-pl-border text-left">
                <th className="p-2 text-pl-muted font-medium">Date</th>
                <th className="p-2 text-pl-muted font-medium">Event</th>
                <th className="p-2 text-pl-muted font-medium">Material</th>
                <th className="p-2 text-pl-muted font-medium text-right">Volume (bbl)</th>
                <th className="p-2 text-pl-muted font-medium text-right">Value ($)</th>
              </tr>
            </thead>
            <tbody>
              {byDate.map((e) => (
                <tr key={e.id} className="border-b border-pl-border">
                  <td className="p-2 font-mono text-pl-muted text-xs">{e.date}</td>
                  <td className="p-2 text-pl-text">{TYPE_LABEL[e.type] || e.type}</td>
                  <td className="p-2 text-pl-text">{materialName(inputs, e.materialId)}</td>
                  <td className="p-2 text-right font-mono text-pl-text">{fmt(e.quantity)}</td>
                  <td className="p-2 text-right font-mono text-pl-muted">{e.cost === null ? '-' : fmt(e.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SchedulePanel;
