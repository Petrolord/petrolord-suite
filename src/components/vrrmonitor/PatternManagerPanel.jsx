// Pattern definitions (V4, left rail on the Patterns tab): create/delete
// patterns and assign the imported ledger's producers to each.
import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';

const PatternManagerPanel = () => {
  const { inputs, isImported, ledgerWells, addPattern, removePattern, togglePatternProducer, setPatternBand, targetBand, patternAnalyses, canWrite } = useVrrMonitor();
  const [name, setName] = useState('');

  if (!isImported) {
    return (
      <p className="text-xs text-pl-muted leading-relaxed">
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
          className="h-8 flex-1"
          aria-label="New pattern name"
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
        <p className="text-xs text-pl-muted leading-relaxed">
          No patterns yet. A pattern is a set of producers; injection reaches it through the
          allocation matrix.
        </p>
      )}

      {inputs.patterns.map((p) => (
        <div key={p.id} className="rounded-md border border-pl-border bg-pl-sunken/60 p-2 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-pl-text mb-0">{p.name}</Label>
            <button onClick={() => removePattern(p.id)} className="rounded text-pl-muted hover:text-pl-danger-text" title={`Delete pattern ${p.name}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* VRR-U2-011: the pattern's own target band; blank follows the field band */}
          <div className="flex items-center gap-1 text-[11px] text-pl-muted" data-testid={`vrr-pattern-band-${p.name}`}>
            <span>Target band</span>
            <Input aria-label={`${p.name} target band min`} className="h-6 w-14 text-[11px] px-1" value={p.band?.min ?? ''} placeholder={String(targetBand.min)} onChange={(e) => setPatternBand(p.id, 'min', e.target.value)} disabled={!canWrite} />
            <span>to</span>
            <Input aria-label={`${p.name} target band max`} className="h-6 w-14 text-[11px] px-1" value={p.band?.max ?? ''} placeholder={String(targetBand.max)} onChange={(e) => setPatternBand(p.id, 'max', e.target.value)} disabled={!canWrite} />
            <span>{(patternAnalyses.find((a) => a.pattern.id === p.id)?.band?.from === 'pattern') ? 'its own' : 'field band'}</span>
          </div>
          {(patternAnalyses.find((a) => a.pattern.id === p.id)?.band?.notes || []).map((n) => <p key={n} className="text-[11px] text-pl-warning-text">{n}</p>)}
          <div className="flex flex-wrap gap-1.5">
            {ledgerWells.producers.map((well) => {
              const on = p.producers.includes(well);
              return (
                <button
                  key={well}
                  onClick={() => togglePatternProducer(p.id, well)}
                  aria-pressed={on}
                  className={`text-[11px] px-2 py-0.5 rounded border font-pl-mono ${on
                    ? 'bg-pl-primary/10 border-pl-primary text-pl-primary-text'
                    : 'bg-pl-surface border-pl-border text-pl-muted hover:text-pl-text hover:border-pl-border-strong'}`}
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
