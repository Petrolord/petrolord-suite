// Scenario list for the LOPA & SIL Studio (PS1).
import React from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useLopaStudio } from '@/contexts/LopaStudioContext';
import { OutcomeBadge } from './shared';

const verdictText = (v) => {
  if (!v) return null;
  if (v.kind === 'meets') return { text: 'SIF meets the TMEL', tone: 'text-pl-success-text' };
  if (v.kind === 'short') return { text: 'SIF falls short', tone: 'text-pl-danger-text' };
  if (v.kind === 'not-required') return { text: 'No SIF needed', tone: 'text-pl-success-text' };
  return { text: 'Redesign', tone: 'text-pl-danger-text' };
};

const ScenarioRail = () => {
  const {
    study, summaries, selectScenario, addScenario, removeScenario,
  } = useLopaStudio();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-pl-text">Scenarios</h2>
        <Button size="sm" variant="outline" onClick={addScenario} className="h-7 text-xs">
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
                className={`rounded-lg border p-2 ${isActive ? 'border-pl-primary bg-pl-primary/10' : 'border-pl-border bg-pl-surface'}`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => selectScenario(s.id)}
                    className="flex-1 text-left"
                    aria-pressed={isActive}
                  >
                    <div className="text-sm font-medium text-pl-text">{s.name || 'Unnamed scenario'}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {s.lopa?.error
                        ? <span className="text-[11px] text-pl-danger-text">Inputs incomplete</span>
                        : <OutcomeBadge outcome={s.lopa?.outcome} />}
                      {v ? <span className={`text-[11px] ${v.tone}`}>{v.text}</span> : null}
                    </div>
                  </button>
                  {study.scenarios.length > 1 ? (
                    <Button
                      variant="ghost" size="icon" title="Remove this scenario"
                      onClick={() => removeScenario(s.id)}
                      className="h-7 w-7 text-pl-muted hover:text-pl-danger-text"
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
