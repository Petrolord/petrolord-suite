import React, { useMemo, useState } from 'react';
import { BookOpen, HelpCircle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { ASSURANCE_HELP } from '@/data/assuranceHelp';

/**
 * AS13 — the one help guide for every Assurance app.
 *
 * Before AS13 the module had one guide and two dead buttons. The Risk
 * Register's guide had a search box that searched nothing, a "Keyboard
 * shortcuts guide coming soon!" toast, and scoring help written before
 * residual risk and appetite existed. Management of Change had a
 * "Support Guide" button with no handler. The other seven apps had no
 * help at all.
 *
 * One component, content per app in src/data/assuranceHelp/, written
 * against the engine and the pages rather than from memory, and held to
 * the facts by src/data/assuranceHelp/__tests__/assuranceHelp.test.js.
 * Every section renders expanded: a guide that hides its content behind
 * closed accordions is a guide a search cannot find anything in, and the
 * search here is real.
 */

const sectionText = (s) => [
  s.title, ...(s.paragraphs || []), ...(s.bullets || []), ...(s.steps || []),
].join(' ').toLowerCase();

export function AssuranceHelpContent({ appKey }) {
  const guide = ASSURANCE_HELP[appKey];
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const sections = useMemo(() => (guide ? guide.sections : [])
    .filter((s) => !q || sectionText(s).includes(q)), [guide, q]);
  const glossary = useMemo(() => (guide ? guide.glossary : [])
    .filter((g) => !q || `${g.term} ${g.definition}`.toLowerCase().includes(q)), [guide, q]);

  if (!guide) return <p className="text-sm text-muted-foreground">No guide for this app.</p>;

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label="Search this guide"
          placeholder="Search this guide"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {sections.length === 0 && glossary.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in this guide mentions &quot;{query}&quot;.</p>
      ) : null}

      {sections.map((s) => (
        <section key={s.id} id={`help-${appKey}-${s.id}`} className="space-y-2">
          <h3 className="text-sm font-semibold">{s.title}</h3>
          {(s.paragraphs || []).map((p) => (
            <p key={p.slice(0, 40)} className="text-sm text-muted-foreground leading-relaxed">{p}</p>
          ))}
          {s.steps?.length ? (
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
              {s.steps.map((t) => <li key={t.slice(0, 40)}>{t}</li>)}
            </ol>
          ) : null}
          {s.bullets?.length ? (
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              {s.bullets.map((t) => <li key={t.slice(0, 40)}>{t}</li>)}
            </ul>
          ) : null}
        </section>
      ))}

      {glossary.length ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Glossary</h3>
          <dl className="space-y-2">
            {glossary.map((g) => (
              <div key={g.term}>
                <dt className="text-sm font-medium">{g.term}</dt>
                <dd className="text-sm text-muted-foreground">{g.definition}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

/** The Help button every Assurance app shell carries, and its drawer. */
export default function AssuranceHelp({ appKey, label = 'Help', className, variant = 'outline', size = 'sm' }) {
  const [open, setOpen] = useState(false);
  const guide = ASSURANCE_HELP[appKey];
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <HelpCircle className="w-4 h-4 mr-2" /> {label}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> {guide ? guide.title : 'Help'}
            </SheetTitle>
            {guide ? <SheetDescription>{guide.summary}</SheetDescription> : null}
          </SheetHeader>
          <AssuranceHelpContent appKey={appKey} />
        </SheetContent>
      </Sheet>
    </>
  );
}
