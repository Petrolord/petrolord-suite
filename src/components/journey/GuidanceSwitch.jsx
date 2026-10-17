// Guide me, or I'll call you when I need you (Guided Journey design 6.3).
import React from 'react';
import { useJourney } from '@/contexts/JourneyContext';

export default function GuidanceSwitch({ compact = false }) {
  const { journey, setGuidance } = useJourney();
  const mode = journey?.guidance || 'guide';
  const opt = (value, label, hint) => (
    <label className="flex items-start gap-2 cursor-pointer">
      <input type="radio" name="pl-guidance" checked={mode === value} onChange={() => setGuidance(value)} data-testid={`guidance-${value}`} className="mt-1" />
      <span>
        <span className="text-sm text-pl-text">{label}</span>
        {!compact && <span className="block text-xs text-pl-muted">{hint}</span>}
      </span>
    </label>
  );
  return (
    <fieldset className="space-y-2" data-testid="guidance-switch">
      <legend className="text-xs font-semibold uppercase tracking-wide text-pl-muted mb-1">Guidance</legend>
      {opt('guide', 'Guide me', 'Petrolord suggests your next step and asks what you want to do after you load data.')}
      {opt('quiet', "I'll find my way, I'll call you when I need you", 'No suggestions or prompts. The Guide button brings help back whenever you want it.')}
    </fieldset>
  );
}
