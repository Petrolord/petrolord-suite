// The guide card (Guided Journey design 6.3): one next step, chosen for the
// person's own disciplines, with up to three alternatives. Guide mode only;
// "Not now" hides it for the session, "I'll find my way" turns guidance off.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, CheckCircle2, Circle, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useJourney } from '@/contexts/JourneyContext';
import DisciplinePicker from './DisciplinePicker';

const NOT_NOW = 'petrolord.guide.notNow';
const notNowSet = () => { try { return sessionStorage.getItem(NOT_NOW) === '1'; } catch { return false; } };

/** Where a step goes: its page, with the dialog opened when the app supports it. */
export const stepHref = (s) => (s?.doImport ? `${s.href}?do=import` : s?.href || null);

export default function GuideCard() {
  const { journey, state, mark, setGuidance } = useJourney();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [hidden, setHidden] = useState(notNowSet);
  const [picker, setPicker] = useState(false);
  if (!journey || journey.guidance !== 'guide' || hidden) return null;
  const welcome = journey.stage === 'welcome';
  if (!welcome && !journey.next && !journey.askDisciplines && journey.stage !== 'running') return null;

  const go = (s) => {
    if (!s) return;
    if (s.action === 'choose-disciplines') { setPicker(true); return; }
    const href = stepHref(s);
    if (href) navigate(href);
  };
  const notNow = () => { try { sessionStorage.setItem(NOT_NOW, '1'); } catch { /* private window */ } setHidden(true); };
  const quiet = async () => {
    await setGuidance('quiet');
    toast({ title: 'Guidance is off', description: 'The Guide button in the sidebar brings it back whenever you want.' });
  };

  return (
    <section className="mx-4 md:mx-8 mt-4 rounded-lg border border-pl-primary/40 bg-pl-primary/5 p-4" data-testid="guide-card" data-stage={journey.stage}>
      <div className="flex items-start gap-3">
        <Compass className="mt-0.5 h-5 w-5 shrink-0 text-pl-primary-text" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-pl-text" data-testid="guide-headline">{welcome ? journey.headline : journey.next?.title || journey.headline}</h2>
          {welcome && journey.detail && <p className="text-sm text-pl-muted">{journey.detail}</p>}
          {!welcome && journey.next?.detail && <p className="text-sm text-pl-muted">{journey.next.detail}</p>}
          {!welcome && journey.next?.app && <p className="text-xs text-pl-muted">In {journey.next.app}</p>}

          {welcome && (
            <ol className="mt-2 space-y-1 text-sm" data-testid="guide-welcome-steps">
              {journey.askDisciplines && (
                <li className="flex items-center gap-2"><Circle className="h-4 w-4 text-pl-muted" />
                  <button type="button" className="underline text-pl-text" onClick={() => setPicker(true)}>Tell us what you work on</button>
                </li>
              )}
              {(journey.welcomeSteps || []).map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  {s.done ? <CheckCircle2 className="h-4 w-4 text-pl-success-text" /> : <Circle className="h-4 w-4 text-pl-muted" />}
                  {s.done ? <span className="text-pl-muted line-through">{s.title}</span>
                    : <button type="button" className="underline text-pl-text text-left" onClick={() => go(s)}>{s.title}</button>}
                </li>
              ))}
            </ol>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!welcome && journey.next && (
              <Button size="sm" onClick={() => go(journey.next)} data-testid="guide-go">
                {journey.next.action === 'choose-disciplines' ? 'Choose' : 'Go'} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
            {welcome && (
              <Button size="sm" variant="outline" onClick={() => mark('welcomed_org', state?.org?.id)} data-testid="guide-welcome-done">Got it</Button>
            )}
            {!welcome && journey.askDisciplines && journey.next?.action !== 'choose-disciplines' && (
              <Button size="sm" variant="outline" onClick={() => setPicker(true)} data-testid="guide-ask-disciplines">Tell us what you work on</Button>
            )}
            {(journey.also || []).map((s) => (
              <button key={s.key} type="button" className="text-sm text-pl-primary-text underline" onClick={() => go(s)} data-testid="guide-also">{s.title}</button>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
          <button type="button" className="inline-flex items-center gap-1 text-pl-muted hover:text-pl-text" onClick={notNow} data-testid="guide-not-now"><X className="h-3.5 w-3.5" /> Not now</button>
          <button type="button" className="text-pl-muted underline hover:text-pl-text" onClick={quiet} data-testid="guide-quiet">I&apos;ll find my way</button>
        </div>
      </div>
      <DisciplinePicker open={picker} onOpenChange={setPicker} />
    </section>
  );
}
