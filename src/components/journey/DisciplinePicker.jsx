// "What do you mainly work on?" (Guided Journey design 4.1). Asked once,
// pre-ticked from the apps the person can open, skippable, changeable.
import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DISCIPLINES } from '@/lib/journey/disciplines';
import { useJourney } from '@/contexts/JourneyContext';

export function DisciplineChoices({ value, onChange }) {
  const toggle = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid="discipline-choices">
      {DISCIPLINES.map((d) => (
        <label key={d.key} className={`flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer ${value.includes(d.key) ? 'border-pl-primary bg-pl-primary/10' : 'border-pl-border'}`}>
          <input type="checkbox" checked={value.includes(d.key)} onChange={() => toggle(d.key)} className="mt-1" data-testid={`discipline-${d.key}`} />
          <span>
            <span className="text-sm text-pl-text">{d.label}</span>
            <span className="block text-xs text-pl-muted">{d.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export default function DisciplinePicker({ open, onOpenChange }) {
  const { journey, setDisciplines } = useJourney();
  const [value, setValue] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setValue(journey?.disciplines || []); }, [open, journey]);
  const save = async (list, source) => {
    setBusy(true);
    try { await setDisciplines(list, source); onOpenChange(false); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="discipline-picker">
        <DialogHeader>
          <DialogTitle>What do you mainly work on?</DialogTitle>
          <DialogDescription>Choose one or more. Petrolord then points you to the apps of your work, and nothing else. You can change this any time.</DialogDescription>
        </DialogHeader>
        <DisciplineChoices value={value} onChange={setValue} />
        <DialogFooter className="gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => save(journey?.disciplinesSource === 'inferred' ? journey.disciplines : [], 'inferred')} data-testid="discipline-skip">Skip</Button>
          <Button disabled={busy || !value.length} onClick={() => save(value, 'chosen')} data-testid="discipline-save">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
