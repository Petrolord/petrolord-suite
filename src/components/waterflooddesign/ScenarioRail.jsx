// Right-rail scenario manager, available on every tab: snapshot the working
// case under a name, apply or delete saved scenarios.
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Camera, Play, Trash2 } from 'lucide-react';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { SectionLabel } from './primitives';

const ScenarioRail = () => {
  const { scenarios, saveScenario, deleteScenario, applyScenario, currentProjectId } = useWaterfloodDesign();
  const [name, setName] = useState('');

  const snapshot = () => {
    const n = name.trim() || `Scenario ${scenarios.length + 1}`;
    saveScenario(n);
    setName('');
  };

  return (
    <section>
      <SectionLabel>Scenarios</SectionLabel>
      <div className="flex gap-2 mb-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') snapshot(); }}
          placeholder={`Scenario ${scenarios.length + 1}`}
          className="h-8 bg-slate-800 border-slate-700 text-xs"
        />
        <Button variant="outline" size="sm" onClick={snapshot} className="bg-slate-800 border-slate-700 shrink-0" title="Snapshot the current inputs as a scenario">
          <Camera size={14} />
        </Button>
      </div>

      {!currentProjectId && (
        <p className="text-[11px] text-slate-500 mb-2">Scenarios persist with the project. Create a project to keep them.</p>
      )}

      <div className="space-y-2">
        {scenarios.length === 0 && <p className="text-xs text-slate-500">No scenarios yet. Snapshot the working case to compare designs.</p>}
        {scenarios.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1.5">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-200 truncate">{s.name}</div>
              <div className="text-[10px] text-slate-500 flex gap-1 items-center">
                {s.displacementInputs?.polymerOn && <Badge variant="outline" className="h-4 px-1 text-[9px] border-violet-500/40 text-violet-300">polymer</Badge>}
                {s.displacementInputs?.gravityOn && <Badge variant="outline" className="h-4 px-1 text-[9px] border-sky-500/40 text-sky-300">dip</Badge>}
                {s.displacementInputs?.krSource === 'table' && <Badge variant="outline" className="h-4 px-1 text-[9px] border-slate-600 text-slate-400">tabular kr</Badge>}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-emerald-400" title="Apply to working case" onClick={() => applyScenario(s.id)}>
              <Play size={13} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-red-400" title="Delete scenario" onClick={() => deleteScenario(s.id)}>
              <Trash2 size={13} />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ScenarioRail;
