// "What next?" after the first piece of work in a discipline (Guided Journey
// design 6.5): a short list with one recommended, asked once, guide mode only.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useJourney } from '@/contexts/JourneyContext';

export default function WhatNextDialog() {
  const { journey, mark } = useJourney();
  const navigate = useNavigate();
  const [closed, setClosed] = useState(null);
  const prompt = journey?.guidance === 'guide' ? (journey.prompts || [])[0] : null;
  if (!prompt || closed === prompt.key) return null;
  const answer = (opt) => {
    setClosed(prompt.key);
    mark('acknowledged', prompt.key).catch(() => {});
    if (opt?.href) navigate(opt.href);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) answer(null); }}>
      <DialogContent className="max-w-lg" data-testid="what-next" data-prompt={prompt.key}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-pl-primary-text" /> {prompt.title}</DialogTitle>
          <DialogDescription>Choose one. You can always come back to the others from the Guide.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {prompt.options.map((o) => (
            <li key={o.key}>
              <button
                type="button"
                onClick={() => answer(o)}
                className={`w-full rounded-md border px-3 py-2 text-left hover:bg-pl-raised ${o.recommended ? 'border-pl-primary bg-pl-primary/10' : 'border-pl-border'}`}
                data-testid={`what-next-${o.key}`}
              >
                <span className="flex items-center justify-between gap-2 text-sm text-pl-text">
                  <span>{o.title}{o.recommended && <span className="ml-2 rounded bg-pl-primary px-1.5 text-[11px] text-pl-primary-fg">Recommended</span>}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-pl-muted" />
                </span>
                {o.detail && <span className="block text-xs text-pl-muted">{o.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => answer(null)} data-testid="what-next-later">Not now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
