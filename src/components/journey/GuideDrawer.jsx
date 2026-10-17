// The Guide button and drawer (Guided Journey design 6.3): always available,
// in guide and quiet mode. Greeting, where you are, the path per discipline,
// the disciplines and the guidance switch.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, CheckCircle2, Circle } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useJourney } from '@/contexts/JourneyContext';
import { disciplineLabel } from '@/lib/journey/disciplines';
import { useProject } from '@/contexts/ProjectContext';
import GuidanceSwitch from './GuidanceSwitch';
import DisciplinePicker from './DisciplinePicker';
import { stepHref } from './GuideCard';

export function GuideDrawer({ open, onOpenChange }) {
  const { journey, state, greeting } = useJourney();
  const { label: projectLabel } = useProject();
  const navigate = useNavigate();
  const [picker, setPicker] = useState(false);
  const go = (s) => {
    if (s.action === 'choose-disciplines') { setPicker(true); return; }
    const href = stepHref(s);
    if (href) { onOpenChange(false); navigate(href); }
  };
  const org = state?.org;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[22rem] max-w-[92vw] overflow-y-auto" data-testid="guide-drawer">
        <SheetTitle className="flex items-center gap-2"><Compass className="h-5 w-5 text-pl-primary-text" /> Guide</SheetTitle>
        {greeting && <p className="mt-3 text-base text-pl-text" data-testid="guide-greeting">{greeting.line}</p>}
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {org && (<><dt className="text-pl-muted">Organisation</dt><dd className="text-pl-text">{org.name} ({org.role})</dd></>)}
          {projectLabel && (<><dt className="text-pl-muted">Project</dt><dd className="text-pl-text">{projectLabel}</dd></>)}
          <dt className="text-pl-muted">Your work</dt>
          <dd className="text-pl-text">
            {journey?.disciplines?.length ? journey.disciplines.map(disciplineLabel).join(', ') : 'Not chosen yet'}
            {' '}<button type="button" className="text-pl-primary-text underline" onClick={() => setPicker(true)} data-testid="guide-change-disciplines">Change</button>
          </dd>
        </dl>
        {journey?.path?.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-pl-muted">Your path</h3>
            <ol className="mt-2 space-y-2" data-testid="guide-path">
              {journey.path.map((s) => (
                <li key={s.key} className="flex items-start gap-2 text-sm">
                  {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-pl-success-text" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-pl-muted" />}
                  {s.done || (!s.href && !s.action) ? <span className={s.done ? 'text-pl-muted' : 'text-pl-text'}>{s.title}</span>
                    : <button type="button" className="text-left text-pl-text underline" onClick={() => go(s)}>{s.title}</button>}
                </li>
              ))}
            </ol>
          </>
        )}
        <div className="mt-6"><GuidanceSwitch /></div>
        <DisciplinePicker open={picker} onOpenChange={setPicker} />
      </SheetContent>
    </Sheet>
  );
}

/** The button: sidebar footer, phone bar, or floating inside full-screen apps. */
export default function GuideButton({ variant = 'sidebar' }) {
  const [open, setOpen] = useState(false);
  const { journey } = useJourney();
  const cls = variant === 'floating'
    ? 'flex items-center gap-1.5 rounded-full border border-pl-border bg-pl-surface px-3 py-1.5 text-xs text-pl-text shadow-lg hover:bg-pl-raised'
    : variant === 'bar'
      ? 'inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-pl-muted hover:bg-pl-raised hover:text-pl-text'
      : 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-pl-muted hover:bg-pl-raised hover:text-pl-text';
  const hasNext = journey?.guidance === 'guide' && journey?.next;
  return (
    <>
      <button type="button" className={cls} onClick={() => setOpen(true)} data-testid={`guide-button-${variant}`} title="Your next step, your path, and how much guidance you want">
        <Compass className="h-4 w-4" />
        <span>Guide</span>
        {hasNext && variant === 'sidebar' && <span className="ml-auto h-2 w-2 rounded-full bg-pl-primary" aria-label="A next step is waiting" />}
      </button>
      <GuideDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
