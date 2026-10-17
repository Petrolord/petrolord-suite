# Email marketer (AI employee, shadow mode)

Petrolord's second AI employee, approved by the owner on 2026-10-17. It drafts
marketing emails and, once a person has approved each one, schedules it in
Brevo. Register entry: `docs/ai-employees/REGISTER.md`. Brand voice:
`docs/ai-employees/brand-voice.md`. Plan for the newsletter and welcome emails:
`docs/ai-employees/email-marketer-PLAN.md`.

## The shadow-mode rule

**Nothing is sent without an approved task.**

1. `propose.mjs` writes drafts (`kind = email_campaign`, `status = proposed`) to
   `ai_employee_tasks`: subject, preheader, HTML, text, audience, scheduled time,
   reviewer notes and the facts it could not find (`[BOOTH NUMBER]` style
   placeholders).
2. A super admin reviews each at `/admin/ai-employees`: reads the sandboxed
   preview and the text version, fills in the facts, edits the subject,
   preheader or time if needed, then approves or rejects.
3. `execute.mjs` acts only on tasks that are `approved`, have a reviewer on
   record, have every placeholder filled, keep the `{{ unsubscribe }}` link,
   use only the two allowed audiences, and only while the employee is
   `active`. Pausing it in the admin page is the off switch; a running
   `execute.mjs` re-reads the status before every task.

Every step is logged to `ai_employee_actions` (append-only).

## Who it may email

Only these two audiences (owner, 2026-10-17). Anything else is refused by
`propose.mjs` and `execute.mjs`.

| Audience key | Who | Brevo list |
|---|---|---|
| `nape-optins` | People who opted in at the last NAPE exhibition | the id(s) in `config/audiences.json` (owner fills in) |
| `nape-2026-leads` | NAPE 2026 leads from `event_leads` with consent and an email | "NAPE 2026 leads", made by `sync-leads.mjs` |
| `nape-2026-leads:<interest>` | The same leads who chose that product (`suite`, `nextgen`, `hse`, `consulting`, `other`) | "NAPE 2026 leads: <interest>" |

A product-specific email (for example the "what's new" email) uses the
interest lists, because the leads' consent covers the products they chose.
Booth quiz players give no email, so they are never in these lists. Brevo
never emails a contact who unsubscribed, and `sync-leads.mjs` never changes a
contact's unsubscribed state. A lead deleted from `event_leads` (a deletion
request) is taken out of the lists on the next sync.

Sender: **Petrolord <info@lordswayenergy.com>**, reply-to the same. It is fixed
in `lib/templates.mjs` and cannot be changed by a task.

## Setup (once, on the studio box, as root)

1. **Brevo key.** In Brevo, SMTP and API, API keys, create a key named
   "Petrolord AI email marketer". Add it to `/root/.ai-employees.env` (the
   same file as the service-role key; `chmod 600`, the scripts refuse a file
   readable by others):

   ```
   SUPABASE_URL=https://ssyckywijlrkgcwvkwlr.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   BREVO_API_KEY=xkeysib-...
   ```

   The key is never printed or committed.
2. **IP allowlist.** The Brevo account only accepts API calls from authorised
   IPs. Add the worker box, **76.13.39.2**, at Security, Authorised IPs
   (https://app.brevo.com/security/authorised_ips), or use a key without the
   restriction. Without it every call answers 401 and the scripts say so; no
   task is failed and nothing is sent.
3. **Opt-in list id.** Put the Brevo list id(s) of the NAPE opt-in list in
   `config/audiences.json` under `nape-optins.list_ids` (a reviewed PR).
4. **Test addresses.** Brevo sends test emails only to existing contacts, so
   ayoasaolu@lordswayenergy.com and seyiojo@lordswayenergy.com must be Brevo
   contacts (add them by hand; do not add them to the NAPE lists).
5. **Migration.** `supabase/migrations/20261017120000_ai_email_marketer.sql`
   seeds the register row (owner applies; see MIGRATIONS.md).

## Commands

```
node tools/ai-employees/email/propose.mjs --dry                 # JSON + HTML previews in /root/ai-employees/email-preview/, no database
node tools/ai-employees/email/propose.mjs --db                  # queue the four NAPE drafts for review
node tools/ai-employees/email/sync-leads.mjs --dry              # how many consenting leads, masked; no Brevo call
node tools/ai-employees/email/sync-leads.mjs                    # upsert them into the NAPE 2026 lists (idempotent)
node tools/ai-employees/email/test-send.mjs --task <uuid>       # proof to the two managers only (run by hand)
node tools/ai-employees/email/execute.mjs --dry                 # what it would schedule; no Brevo call, no writes
node tools/ai-employees/email/execute.mjs                       # schedule approved campaigns due within 24 h (max 2 a run)
node tools/ai-employees/email/report.mjs                        # opens, clicks, unsubscribes and bounces into each task's result
```

`propose.mjs` skips drafts whose key (`nape2026-1` to `nape2026-4`) already has
a proposed, approved or done task. Each draft is scheduled for 09:00 Lagos
time (08:00 UTC). `execute.mjs` creates the Brevo campaign up to 24 hours
ahead with `scheduledAt` at the slot, so Brevo sends it on time; a slot missed
by less than 48 hours goes out 15 minutes after the run, and an older one is
held until a person edits the time. It never creates a second campaign for a
task: the campaign id is stored in the task result, the campaign name carries
the task id (a rerun adopts a campaign it finds by name), and a create that
started and never finished is held until a person checks Brevo and reruns
with `--force`.

To stop a campaign already scheduled in Brevo, suspend it in Brevo
(Campaigns, the campaign, Suspend). Pausing the employee stops new ones.

Brevo campaigns take HTML only; the text version is for the reviewer and for
the later onboarding emails (transactional sends take both).

## Cron (suggested, not installed)

```
# email marketer: sync leads 07:30 UTC, schedule due campaigns 07:45 UTC, stats 18:00 UTC
30 7 * * * cd /root/ai-employees/runner && node tools/ai-employees/email/sync-leads.mjs >> /root/ai-employees/email.log 2>&1
45 7 * * * cd /root/ai-employees/runner && node tools/ai-employees/email/execute.mjs >> /root/ai-employees/email.log 2>&1
0 18 * * * cd /root/ai-employees/runner && node tools/ai-employees/email/report.mjs >> /root/ai-employees/email.log 2>&1
```

## Files

- `lib/brevo.mjs`: Brevo API v3 client (lists, folders, attributes, contacts,
  campaigns, test sends, stats) with injected fetch and clear errors.
- `lib/templates.mjs`: the 600 px email layout, the text version, UTM tags,
  copy checks.
- `templates/nape2026.mjs`: the NAPE 2026 series copy and its sources.
  `templates/newsletter.mjs`, `templates/onboarding.mjs`: scaffolding only.
- `lib/campaign.mjs`: audiences, the shadow-mode gate, the due window, the
  campaign body. `lib/run-campaign.mjs`: one task. `lib/leads.mjs`,
  `lib/sync.mjs`: leads to Brevo. `lib/test-send.mjs`, `lib/report.mjs`.
- `src/lib/aiEmailDraft.js`: placeholders and the final email, shared with
  the admin page so the preview is what Brevo receives.

No npm dependencies: Node 18+ `fetch` only. Tests run in the repo's jest:
`npx jest tools/ai-employees/email src/lib/__tests__/aiEmail src/pages/__tests__/AiEmployees`.
