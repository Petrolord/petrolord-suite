// Scenario list for the LOPA & SIL Studio (PS1).
import React from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useLopaStudio } from '@/contexts/LopaStudioContext';
import { OutcomeBadge } from './shared';

const verdictText = (v) => {
  if (!v) return null;
  if (v.kind === 'meets') return { text: 'SIF meets the TMEL', tone: 'text-emerald-300' };
  if (v.kind === 'short') return { text: 'SIF falls short', tone: 'text-red-300' };
  if (v.kind === 'not-required') return { text: 'No SIF needed', tone: 'text-emerald-300' };
  return { text: 'Redesign', tone: 'text-fuchsia-300' };
};

const ScenarioRail = () => {
  const {
    study, summaries, selectScenario, addScenario, removeScenario,
  } = useLopaStudio();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Scenarios</h2>
        <Button size="sm" variant="outline" onClick={addScenario} className="h-7 border-slate-700 text-xs">
          <PlusCircle className="mr-1 h-3.5 w-3.5" /> Add scenario
        </Button>
      </div>
      <ul className="space-y-2">
        {summaries.map((s) => {
          const isActive = s.id === study.activeScenarioId;
          const v = verdictText(s.verdict);
          return (
            <li key={s.id}>
              <div
                className={`rounded-lg border p-2 ${isActive ? 'border-lime-500/60 bg-lime-500/5' : 'border-slate-800 bg-slate-900/60'}`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => selectScenario(s.id)}
                    className="flex-1 text-left"
                    aria-pressed={isActive}
                  >
                    <div className="text-sm font-medium text-slate-100">{s.name || 'Unnamed scenario'}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {s.lopa?.error
                        ? <span className="text-[11px] text-red-300">Inputs incomplete</span>
                        : <OutcomeBadge outcome={s.lopa?.outcome} />}
                      {v ? <span className={`text-[11px] ${v.tone}`}>{v.text}</span> : null}
                    </div>
                  </button>
                  {study.scenarios.length > 1 ? (
                    <Button
                      variant="ghost" size="icon" title="Remove this scenario"
                      onClick={() => removeScenario(s.id)}
                      className="h-7 w-7 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ScenarioRail;
