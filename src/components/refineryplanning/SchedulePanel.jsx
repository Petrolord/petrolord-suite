// The schedule the plan cascades into (DS3).
import React from 'react';
import { Info } from 'lucide-react';
import { useRefineryPlanning } from '@/contexts/RefineryPlanningContext';

const fmt = (v) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : 'n/a');

const TYPE_LABEL = {
  receipt: 'Crude receipt',
  unit_run: 'Unit run',
  delivery: 'Product lift',
};

const SchedulePanel = () => {
  const { schedule } = useRefineryPlanning();
  const byDate = [...schedule.events].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded border border-slate-800 bg-slate-900/60 p-3">
        <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-400">{schedule.note}</p>
      </div>

      {byDate.length === 0 ? (
        <p className="text-sm text-slate-400">No plan to cascade yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="p-2 text-slate-400 font-medium">Date</th>
                <th className="p-2 text-slate-400 font-medium">Event</th>
                <th className="p-2 text-slate-400 font-medium">Material</th>
                <th className="p-2 text-slate-400 font-medium text-right">Volume (bbl)</th>
                <th className="p-2 text-slate-400 font-medium text-right">Value ($)</th>
              </tr>
            </thead>
            <tbody>
              {byDate.map((e) => (
                <tr key={e.id} className="border-b border-slate-800/60">
                  <td className="p-2 font-mono text-slate-400 text-xs">{e.date}</td>
                  <td className="p-2 text-slate-300">{TYPE_LABEL[e.type] || e.type}</td>
                  <td className="p-2 text-white">{e.materialId}</td>
                  <td className="p-2 text-right font-mono text-white">{fmt(e.quantity)}</td>
                  <td className="p-2 text-right font-mono text-slate-400">{e.cost === null ? '-' : fmt(e.cost)}</td>
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
