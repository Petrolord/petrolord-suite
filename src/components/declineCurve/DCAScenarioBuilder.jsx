import React, { useState } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const DCAScenarioBuilder = () => {
  const { 
    scenarios, 
    createScenario, 
    deleteScenario, 
    selectedScenarios, 
    toggleScenarioSelection, 
    streamState, 
    selectedStream 
  } = useDeclineCurve();

  const [newScenarioName, setNewScenarioName] = useState('');
  const canSave = !!streamState[selectedStream].forecastResults;

  const handleCreate = () => {
    if (newScenarioName && canSave) {
      createScenario(newScenarioName);
      setNewScenarioName('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input 
            placeholder="Scenario Name (e.g., High Case)" 
            value={newScenarioName}
            onChange={(e) => setNewScenarioName(e.target.value)}
            className="h-8 text-xs"
          />
          <Button 
            onClick={handleCreate} 
            disabled={!canSave || !newScenarioName}
            size="sm"
            className="h-8 w-8 p-0"
            aria-label="Save scenario"
          >
            <Plus size={14} />
          </Button>
        </div>
        {!canSave && <p className="text-[10px] text-pl-muted">Run a forecast to save a scenario.</p>}
      </div>

      <ScrollArea className="h-[200px] rounded border border-pl-border bg-pl-sunken p-2">
        <div className="space-y-2">
          {scenarios.filter(s => s.stream === selectedStream).length === 0 ? (
            <div className="text-center text-pl-muted text-xs py-4">No saved scenarios</div>
          ) : (
            scenarios.filter(s => s.stream === selectedStream).map(s => (
              <div key={s.id} className="flex items-center justify-between bg-pl-surface p-2 rounded border border-pl-border hover:border-pl-border-strong transition-colors">
                <div className="flex items-center gap-2 overflow-hidden">
                  <button onClick={() => toggleScenarioSelection(s.id)} className="text-pl-muted hover:text-pl-text" aria-label={selectedScenarios.includes(s.id) ? `Deselect ${s.name}` : `Select ${s.name} to compare`} aria-pressed={selectedScenarios.includes(s.id)}>
                    {selectedScenarios.includes(s.id) ? <CheckCircle2 size={14} className="text-pl-primary-text" /> : <Circle size={14} />}
                  </button>
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate text-pl-text">{s.name}</div>
                    <div className="text-[10px] text-pl-muted flex gap-2">
                      <span>Remaining: {s.forecastResults.eur.toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                      <Badge variant="outline" className="h-3 px-1 text-[8px] border-pl-border-strong text-pl-muted">{s.fitResults.modelType}</Badge>
                    </div>
                  </div>
                </div>
                <button onClick={() => deleteScenario(s.id)} className="text-pl-muted hover:text-pl-danger-text" aria-label={`Delete scenario ${s.name}`}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default DCAScenarioBuilder;