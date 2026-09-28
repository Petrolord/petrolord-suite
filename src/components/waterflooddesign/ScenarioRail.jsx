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
          className="h-8 text-xs"
        />
        <Button variant="outline" size="sm" onClick={snapshot} className="shrink-0" title="Snapshot the current inputs as a scenario">
          <Camera size={14} />
        </Button>
      </div>

      {!currentProjectId && (
        <p className="text-[11px] text-pl-muted mb-2">Scenarios persist with the project. Create a project to keep them.</p>
      )}

      <div className="space-y-2">
        {scenarios.length === 0 && <p className="text-xs text-pl-muted">No scenarios yet. Snapshot the working case to compare designs.</p>}
        {scenarios.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-md border border-pl-border bg-pl-surface px-2 py-1.5">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-pl-text truncate">{s.name}</div>
              <div className="text-[10px] text-pl-muted flex gap-1 items-center">
                {s.displacementInputs?.polymerOn && <Badge variant="outline" className="h-4 px-1 text-[9px] text-pl-muted">polymer</Badge>}
                {s.displacementInputs?.gravityOn && <Badge variant="outline" className="h-4 px-1 text-[9px] text-pl-muted">dip</Badge>}
                {s.displacementInputs?.krSource === 'table' && <Badge variant="outline" className="h-4 px-1 text-[9px] text-pl-muted">tabular kr</Badge>}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-success-text" title="Apply to working case" onClick={() => applyScenario(s.id)}>
              <Play size={13} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-pl-muted hover:text-pl-danger-text" title="Delete scenario" onClick={() => deleteScenario(s.id)}>
              <Trash2 size={13} />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ScenarioRail;
