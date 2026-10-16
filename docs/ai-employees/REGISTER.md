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
