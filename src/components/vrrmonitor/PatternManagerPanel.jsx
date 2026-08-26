// Pattern definitions (V4, left rail on the Patterns tab): create/delete
// patterns and assign the imported ledger's producers to each.
import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';

const PatternManagerPanel = () => {
  const { inputs, isImported, ledgerWells, addPattern, removePattern, togglePatternProducer } = useVrrMonitor();
  const [name, setName] = useState('');

  if (!isImported) {
    return (
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Patterns work on an imported per-well ledger. Import well data on the Data tab first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { addPattern(name); setName(''); } }}
          placeholder="New pattern name"
          className="h-8 bg-slate-800 border-slate-700 flex-1"
        />
        <Button
          size="sm" className="h-8"
          disabled={!name.trim()}
          onClick={() => { addPattern(name); setName(''); }}
          title="Add pattern"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {inputs.patterns.length === 0 && (
        <p className="text-[11px] text-slate-500 leading-relaxed">
          No patterns yet. A pattern is a set of producers; injection reaches it through the
          allocation matrix.
        </p>
      )}

      {inputs.patterns.map((p) => (
        <div key={p.id} className="rounded border border-slate-800 bg-slate-900/60 p-2 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-slate-300">{p.name}</Label>
            <button onClick={() => removePattern(p.id)} className="text-slate-500 hover:text-red-400" title={`Delete pattern ${p.name}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ledgerWells.producers.map((well) => {
              const on = p.producers.includes(well);
              return (
                <button
                  key={well}
                  onClick={() => togglePatternProducer(p.id, well)}
                  className={`text-[11px] px-2 py-0.5 rounded border ${on
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                    : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}`}
                >
                  {well}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default PatternManagerPanel;
