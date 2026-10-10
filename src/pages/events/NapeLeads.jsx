import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { PublicPage, PublicBrandBar } from '@/components/public/PublicPage';
import {
  EVENT, INTERESTS, CONSENT_TEXT, QUIZ_URL, validateLead, toRow, whatsappUrl, saveLead, flushQueue,
} from '@/lib/eventLeads';

// NAPE booth lead form (2026-10): a visitor scans the booth QR code, leaves
// a few details, and is handed over to the Petrolord WhatsApp Business line
// with a greeting that names them. Built for phones on expo Wi-Fi: one small
// page, no account, and a lead that cannot be saved is kept on the phone and
// sent on the next visit. Before the event_leads migration is applied the
// save fails quietly and the WhatsApp hand-over still works.

const field = 'w-full rounded-lg border border-pl-border bg-pl-surface px-3 py-3 text-base text-pl-text placeholder:text-pl-muted focus:outline-none focus:ring-2 focus:ring-pl-accent';
const label = 'block text-sm font-medium text-pl-text mb-1';
const err = 'mt-1 text-sm text-pl-danger-text';
const BLANK = { name: '', phone: '+234 ', email: '', company: '', role: '', interests: [], note: '', consent: false, website: '' };
const insert = (row) => supabase.from('event_leads').insert(row);
const store = () => {
  try { return window.localStorage; } catch { return null; }
};
const NO_STORE = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

export default function NapeLeads() {
  const [params] = useSearchParams();
  const source = params.get('src') === 'tablet' ? 'tablet' : 'qr';
  const [f, setF] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggle = (k) => setF((x) => ({ ...x, interests: x.interests.includes(k) ? x.interests.filter((y) => y !== k) : [...x.interests, k] }));

  // send anything left on this phone from an earlier visit
  useEffect(() => { flushQueue(store() || NO_STORE, insert).catch(() => {}); }, []);

  const wa = useMemo(() => whatsappUrl(f), [f]);

  const submit = async (e) => {
    e.preventDefault();
    if (f.website) return; // honeypot: people never see this field
    const problems = validateLead(f);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    const row = toRow(f, { source, userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '' });
    const res = await saveLead(store() || NO_STORE, insert, row);
    setBusy(false);
    setDone(res);
    // a visitor's own phone goes straight on to WhatsApp; a booth tablet
    // stays on the page for the next visitor
    if (source === 'qr') {
      try { window.location.assign(wa); } catch { /* the button below still works */ }
    }
  };

  const firstName = f.name.trim().split(/\s+/)[0];

  return (
    <PublicPage testId="nape-leads" header={<PublicBrandBar />} mainClassName="px-4 py-6">
      <Helmet>
        <title>{`Petrolord at ${EVENT}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="mx-auto w-full max-w-md space-y-5">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-pl-accent-text">{EVENT}</p>
          <h1 className="text-2xl font-semibold text-pl-text">Thanks for visiting the Petrolord booth</h1>
          <p className="text-sm text-pl-muted">Leave your details and we will continue the conversation on WhatsApp.</p>
        </header>

        {done ? (
          <section className="space-y-4 rounded-xl border border-pl-border bg-pl-surface p-5" data-testid="nape-done">
            <p className="text-base text-pl-text">
              {done.saved
                ? `Thank you, ${firstName}. Your details are saved.`
                : 'Thank you. Your details are kept on this phone and will be sent the next time this page opens.'}
            </p>
            <a href={wa} className="flex w-full items-center justify-center rounded-lg bg-pl-success px-4 py-4 text-lg font-semibold text-white" data-testid="nape-whatsapp">
              Continue on WhatsApp
            </a>
            {QUIZ_URL && (
              <a href={QUIZ_URL} className="flex w-full items-center justify-center rounded-lg border border-pl-border px-4 py-3 text-base font-medium text-pl-text" data-testid="nape-quiz">
                Join the quiz
              </a>
            )}
            {source === 'tablet' && (
              <button type="button" onClick={() => { setF(BLANK); setErrors({}); setDone(null); }} className="w-full rounded-lg border border-pl-border px-4 py-3 text-base text-pl-text" data-testid="nape-next">
                Next visitor
              </button>
            )}
          </section>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4" data-testid="nape-form">
            <div>
              <label className={label} htmlFor="nape-name">Your name</label>
              <input id="nape-name" className={field} autoComplete="name" value={f.name} onChange={set('name')} maxLength={120} />
              {errors.name && <p className={err}>{errors.name}</p>}
            </div>
            <div>
              <label className={label} htmlFor="nape-phone">Phone (WhatsApp)</label>
              <input id="nape-phone" className={field} type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} maxLength={24} />
              {errors.phone && <p className={err}>{errors.phone}</p>}
            </div>
            <div>
              <label className={label} htmlFor="nape-email">Email (optional)</label>
              <input id="nape-email" className={field} type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set('email')} maxLength={200} />
              {errors.email && <p className={err}>{errors.email}</p>}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="nape-company">Company</label>
                <input id="nape-company" className={field} autoComplete="organization" value={f.company} onChange={set('company')} maxLength={160} />
              </div>
              <div>
                <label className={label} htmlFor="nape-role">Role</label>
                <input id="nape-role" className={field} autoComplete="organization-title" value={f.role} onChange={set('role')} maxLength={120} />
              </div>
            </div>
            <fieldset>
              <legend className={label}>What would you like to talk about?</legend>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((i) => {
                  const on = f.interests.includes(i.key);
                  return (
                    <button
                      key={i.key}
                      type="button"
                      onClick={() => toggle(i.key)}
                      aria-pressed={on}
                      data-testid={`nape-interest-${i.key}`}
                      className={`rounded-full border px-4 py-2 text-sm ${on ? 'border-pl-accent bg-pl-accent/15 text-pl-text' : 'border-pl-border text-pl-muted'}`}
                    >
                      {i.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div>
              <label className={label} htmlFor="nape-note">Anything else (optional)</label>
              <textarea id="nape-note" className={`${field} h-20`} value={f.note} onChange={set('note')} maxLength={1000} />
            </div>
            <div className="hidden" aria-hidden="true">
              <label htmlFor="nape-website">Website</label>
              <input id="nape-website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
            </div>
            <label className="flex items-start gap-3 text-sm text-pl-text">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={f.consent} onChange={set('consent')} data-testid="nape-consent" />
              <span>{CONSENT_TEXT}</span>
            </label>
            {errors.consent && <p className={err}>{errors.consent}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-pl-primary px-4 py-4 text-lg font-semibold text-pl-primary-fg disabled:opacity-60" data-testid="nape-submit">
              {busy ? 'Saving' : 'Send and open WhatsApp'}
            </button>
            <p className="text-xs text-pl-muted">
              How we handle your details: <a className="underline" href="/legal/privacy-policy">privacy policy</a>.
            </p>
          </form>
        )}
      </div>
    </PublicPage>
  );
}
