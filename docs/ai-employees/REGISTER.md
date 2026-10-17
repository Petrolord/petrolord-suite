# AI employee register

The human-readable register. The live record is the `ai_employees` table,
shown at `/admin/ai-employees` (super admins only). Keep the two in step.

Autonomy steps: 1 shadow (proposes only), 2 draft and approve, 3 act and
audit, 4 autonomous within limits. Status `paused` is the off switch.

---

## YouTube channel manager

| | |
|---|---|
| Slug | `youtube-channel-manager` |
| Role | Runs the Petrolord YouTube channel: listings (title, description, chapters, tags, playlist, privacy, scheduled time), uploads, playlists, comment replies and a weekly report. |
| Approved | 2026-10-11, by the owner |
| Manager | ayoasaolu@lordswayenergy.com |
| Next manager | seyiojo@lordswayenergy.com |
| Autonomy | Step 1, shadow. It proposes; a person approves every item before anything is published. |
| Status | Active from the day the migration is applied |
| Code | `tools/ai-employees/youtube/` (worker), `src/pages/admin/AiEmployees.jsx` (admin page), `supabase/migrations/20261011120000_ai_employees.sql` |
| Voice | `docs/ai-employees/brand-voice.md` |

### Access

- **YouTube:** Data API v3 through an OAuth refresh token for the channel
  owner's account, stored root-only at `/root/.youtube-oauth-token.json`
  (scopes: youtube.upload, youtube, youtube.force-ssl). Revoke at
  myaccount.google.com/permissions.
- **Videos:** read-only on `/root/demo-videos/<key>/`.
- **Database:** the service-role key in `/root/.ai-employees.env`
  (root-only), used only for the three `ai_*` tables.
- **Public content:** only the keys in
  `tools/ai-employees/youtube/config/public-allowlist.json`. Everything else
  is members-only and is refused.
- **No access** to customer data, payments, the Suite's other tables, email
  or social accounts.

### Measures

| Measure | Target at the 90-day review | Source |
|---|---|---|
| Uploads on schedule | Every approved upload live within a day of its proposed time | task `scheduled_at` against the upload result |
| Watch time | Rising month on month | YouTube Analytics |
| Subscribers | Rising month on month | YouTube Analytics |
| NextGen sign-ups from YouTube | Counted and rising | UTM or referrer on NextGen sign-up |
| Policy strikes | Zero | YouTube Studio |
| Errors caught in review | Falling; recorded as rejections and reviewer edits | `ai_employee_tasks` (rejected, `edited_by_reviewer`) |
| Manager review time | Under 15 minutes a week | manager's estimate, then queue timestamps |
| Running cost | Known and reported monthly | API quota (free), box time, model usage |

The weekly scorecard on the admin page shows tasks proposed, approved,
rejected and done this week, and the rejection rate. Watch time,
subscribers and sign-ups join it once the channel reports are wired in.

### Reviews

- **30 days** (the `next_review_at` seeded by the migration): is the queue
  usable, are proposals accurate, how much does the manager edit? Decide
  whether it stays at step 1.
- **60 days:** first channel numbers. Consider step 2 (it drafts comment
  replies and weekly reports for approval as well as listings) if
  rejections are rare and there have been no policy problems.
- **90 days:** full measures review with the next manager. Consider step 3
  for routine uploads from the allowlist only, if the API project has passed
  Google's audit and nothing has been caught in review for a month.

Each review is logged here with the date, the decision and who made it.

### Review log

| Date | Reviewer | Decision |
|---|---|---|
| 2026-10-11 | Owner | Approved at step 1 (shadow). Public: Petrophysics Module A, QI Module A, and the Petrophysics, QI and Seismolord demos. |
| 2026-10-16 | Owner | Round 2 public (demos and Module A of eight more apps). Custom thumbnails and Shorts added to the pipeline; Shorts are cut from public demos only and go through the same approval queue. |

### Status (2026-10-16)

- Google's API compliance review passed (2026-10-14), so approved uploads
  can be public.
- Thumbnails (`tools/demo-video/thumbs.mjs`) and Shorts
  (`tools/demo-video/shorts.mjs`) are made beside the masters; proposals
  name the thumbnail, and Shorts are proposed like other listings with a
  link to their parent demo. Custom thumbnails need the channel's
  intermediate features (phone verification in YouTube Studio).

### Status (2026-10-11)

- Foundation built: tables, admin page, worker (auth, propose, execute) and
  tests. The migration is pending the owner's apply.
- Waiting on: the OAuth client JSON and consent (`auth.mjs`), and a
  service-role key in `/root/.ai-employees.env` so proposals go to the
  queue instead of a local file.
- Well Data Manager is approved for public but has no finished video yet.

---

## Email marketer

| | |
|---|---|
| Slug | `email-marketer` |
| Role | Drafts and schedules Petrolord's marketing emails. Jobs in order: (a) the NAPE 2026 series building up to the exhibition (Lagos, 9 to 11 November 2026); (b) a monthly newsletter; (c) welcome and guidance emails for people newly added to or subscribed to the Suite, HSE or NextGen. (a) is built; (b) and (c) have task kinds, templates and a plan only (`docs/ai-employees/email-marketer-PLAN.md`). |
| Approved | 2026-10-17, by the owner |
| Manager | ayoasaolu@lordswayenergy.com |
| Next manager | seyiojo@lordswayenergy.com |
| Autonomy | Step 1, shadow. It drafts each email (subject, preheader, HTML and text, audience, scheduled time) as a task; a person approves every email before anything is sent. |
| Status | Active from the day the migration is applied |
| Sender | Petrolord <info@lordswayenergy.com>, reply-to the same (a verified Brevo sender) |
| Code | `tools/ai-employees/email/` (worker), `src/lib/aiEmailDraft.js` and `src/pages/admin/AiEmployees.jsx` (admin preview and review), `supabase/migrations/20261017120000_ai_email_marketer.sql` |
| Voice | `docs/ai-employees/brand-voice.md`; British English, no em dashes, no "X, not Y", no prices, no unlaunched features, facts only from the repo; unknown facts are `[PLACEHOLDERS]` the reviewer fills in |

### Access

- **Brevo:** an API key held root-only in `/root/.ai-employees.env`
  (`BREVO_API_KEY`, chmod 600). The account's authorised-IP list must include
  the worker box, 76.13.39.2. Revoke the key in Brevo, SMTP and API.
- **Audiences, and nothing else:** the Brevo list of people who opted in at the
  last NAPE exhibition, and NAPE 2026 leads (`event_leads`) who gave consent
  and an email. Product-specific emails go only to leads who chose that
  product. Unsubscribed contacts are never emailed.
- **Database:** the service-role key in `/root/.ai-employees.env`, used only
  for the three `ai_*` tables and to read consenting `event_leads` rows with
  an email. No other customer data: no Suite, HSE or NextGen user tables,
  payments or organisations.
- **Test sends:** only to the two managers' addresses.
- **No access** to the YouTube channel, social accounts or the Suite's other
  tables.

### Measures

| Measure | Target at the 90-day review | Source |
|---|---|---|
| Sent on schedule | Every approved email scheduled before its slot | task `scheduled_at` against the Brevo campaign |
| Opens | Unique open rate tracked per email; rising over the series | `report.mjs`, task `result.stats` |
| Clicks | Unique click rate tracked per email | `report.mjs` |
| Unsubscribes | Under 0.5% of delivered per email; above it the manager is told (`unsubscribe_alert`) | `report.mjs` |
| Bounces | Under 2% of sent; hard bounces cleaned by Brevo | `report.mjs` |
| Booth visits and leads attributed | Counted: NAPE 2026 leads during 9 to 11 November, and /nape visits with `utm_source=email` | `event_leads`, site analytics |
| NextGen sign-ups from email | Counted and rising | `utm_campaign=nape2026-<n>` on NextGen sign-up |
| Errors caught in review | Falling; recorded as rejections and reviewer edits | `ai_employee_tasks` (rejected, `edited_by_reviewer`) |
| Manager review time | Under 15 minutes per email | manager's estimate, then queue timestamps |
| Running cost | Known and reported monthly | Brevo plan, box time, model usage |

### Reviews

- **30 days** (the `next_review_at` seeded by the migration): did the NAPE
  series go out on time, how much did the manager edit, were facts right?
  Decide whether it stays at step 1.
- **60 days:** NAPE results (opens, clicks, unsubscribes, leads attributed).
  Decide whether to build job (b), the monthly newsletter, and whether
  routine newsletters may move to step 2.
- **90 days:** full measures review with the next manager. Decide on job (c),
  the welcome emails, which need their own consent and trigger review first.

Each review is logged here with the date, the decision and who made it.

### Review log

| Date | Reviewer | Decision |
|---|---|---|
| 2026-10-17 | Owner | Approved at step 1 (shadow). Jobs: NAPE 2026 series first, then the monthly newsletter, then welcome emails. Audience: NAPE opt-ins and consenting NAPE 2026 leads only. Sender Petrolord <info@lordswayenergy.com>. |

### Status (2026-10-17)

- Foundation built: Brevo client, email layout, NAPE series drafts, lead
  sync, execute, test send, report, admin preview, tests. The migration is
  pending the owner's apply.
- Waiting on: `BREVO_API_KEY` in `/root/.ai-employees.env`, 76.13.39.2 on the
  Brevo IP allowlist, the NAPE opt-in list id in
  `tools/ai-employees/email/config/audiences.json`, and the booth number,
  venue and opening hours for the drafts.
