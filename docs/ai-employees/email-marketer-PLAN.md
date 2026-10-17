# Email marketer: plan for the newsletter and the welcome emails

Owner decisions of 2026-10-17. Job (a), the NAPE 2026 series, is built
(`tools/ai-employees/email/`, register entry in `REGISTER.md`). This note
covers jobs (b) and (c). For both, the task kinds and template scaffolding
exist today (`email_newsletter`, `email_onboarding`;
`tools/ai-employees/email/templates/newsletter.mjs` and `onboarding.mjs`), and
the admin page already previews and reviews them. Nothing proposes or sends
them yet. Each job starts only after the review named below.

Both jobs keep the rules of job (a): shadow mode (a person approves every
email), sender Petrolord <info@lordswayenergy.com>, the brand voice, facts
only from the repo with `[PLACEHOLDERS]` for anything unknown, UTM tags on
every link, the `{{ unsubscribe }}` link, and execute refusing anything
unapproved, unfilled or addressed to an audience it does not know.

## Job (b): the monthly newsletter

**When:** start after the 60-day review (mid-December 2026), first issue in
January 2027. One issue a month, proposed on the 1st working day, sent on a
Tuesday at 09:00 Lagos time.

**Audience:** the same people who agreed to hear from Petrolord: the NAPE
opt-in list and consenting NAPE 2026 leads. A Suite or NextGen account on its
own is not marketing consent, so account holders join only if they opt in
(an opt-in box on sign-up or in Profile is a separate, owner-approved change
to a shared page). The newsletter audience key is added to `isAllowedAudience`
in the same reviewed PR that starts the job.

**Content, drafted from what actually shipped:**
1. Merged work of the month: `git log origin/main --merges --since` with the
   PR titles, filtered to user-facing changes (feat, not chore or test).
2. The STATUS docs updated in the month (`docs/scope/*-STATUS.md`): the "what
   users see" lines become the items; the docs' own figures are the only
   numbers used.
3. The YouTube queue: videos made public in the month
   (`ai_employee_tasks` of the channel manager, status done, with their watch
   URLs).
4. NextGen: courses gone live (`NEXTGEN_LIVE_COURSES` in
   `src/data/suiteCatalog.js` and the NextGen STATUS notes).
5. Events and dates the owner adds as facts.

At most five items, each a heading, two or three sentences and one link. The
proposal lists its sources in the notes so the reviewer can check each claim.
Nothing that is merged but not yet live on petrolord.com is announced; the
drafter checks the live build's commit (Hostinger deploy log) before naming a
feature.

**Steps to build:** a `propose-newsletter.mjs` that collects the four
sources, calls `newsletterDraft()`, and queues one task; execute already
handles `email_campaign`, so either the newsletter is queued as
`email_campaign` with `series: 'newsletter'`, or execute learns
`email_newsletter` with the same gate. Tests as for the NAPE series.

## Job (c): welcome and guidance emails

**When:** design review at the 90-day review (mid-January 2027). The trigger
touches shared tables (organisation membership, users), so it needs the
second engineer's review before any code.

**Who gets one:**
- **Suite:** a person added to an organisation (`organization_members` row
  becomes active) or a new self-serve sign-up.
- **HSE:** a new HSE member of an organisation.
- **NextGen:** a new NextGen Academy sign-up.

**Consent basis:** service emails to account holders about the account they
were given (how to sign in, what to do first, where help is). They carry no
offers or prices. Each still has the unsubscribe link, and a person who
unsubscribed from Petrolord email in Brevo never gets one.

**Content keyed to the person:**
- Suite: the person's discipline (from the Guided Journey record,
  `suite_user_journey.disciplines`, or inferred from their licensed modules
  with `inferDisciplines`) picks the starter steps from `STARTER_PACKS` in
  `src/lib/journey/disciplines.js`, filtered to the apps their organisation
  licenses. Two or three steps, each a deep link (for example Seismolord
  `?do=import`, Well Data Manager `?do=import`), plus the Guide button and
  Projects.
- HSE: sign in, report an observation, find the Help Centre (the HSE guides).
- NextGen: the course they enrolled in, how lessons and tests work, the
  certificate.

**Frequency caps:**
- One welcome email per person per product, ever.
- At most one email from the email marketer per person per week, across all
  jobs. A guidance follow-up (for example "your first wells are in; next, a
  correlation") waits for the next free week and is dropped if the person has
  already done it (the journey record's work per app).
- Never to someone who unsubscribed; never to an address that hard-bounced.

**How it would run:** these are one-to-one emails, so they go through Brevo's
transactional API (`/smtp/email`, which takes HTML and the text version), not
campaigns. While at step 1 the worker proposes a daily batch ("7 welcome
emails for new Suite members") as one task with each email previewable; the
manager approves the batch. Moving welcome emails to step 3 (send and audit)
is the obvious first autonomy step once a month of batches has gone through
without edits.

**What it reads:** only what the email needs: name, email, product, discipline
and licensed apps of new members, through a narrow SECURITY DEFINER view or
function the second engineer reviews. No browsing of user tables.

## Open questions for the owner

1. Newsletter: should Suite and NextGen account holders get an opt-in box?
2. Newsletter day and time: Tuesday 09:00 Lagos as proposed?
3. Welcome emails: send from info@lordswayenergy.com as well, or from a
   petrolord.com address once one is verified in Brevo?
