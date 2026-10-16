# YouTube channel manager (AI employee, shadow mode)

Petrolord's first AI employee. It prepares YouTube listings for finished
videos and, once a person has approved them, uploads them. Register entry:
`docs/ai-employees/REGISTER.md`. Brand voice: `docs/ai-employees/brand-voice.md`.

## The shadow-mode rule

**Nothing goes to YouTube without an approved task.**

1. `propose.mjs` writes proposals (`status = proposed`) to `ai_employee_tasks`.
2. A super admin reviews each one at `/admin/ai-employees`: edits the title
   and description if needed, then approves or rejects with an optional note.
3. `execute.mjs` acts only on tasks that are `approved`, have a reviewer on
   record, are on the public allowlist, and only while the employee's status
   is `active`. Pausing it in the admin page is the off switch; a running
   `execute.mjs` re-reads the status before every task and stops.

Every step is logged to `ai_employee_actions` (append-only).

## What may go public

`config/public-allowlist.json` is the only list of video keys that may ever
be proposed. Everything else is members-only (NextGen Academy and the Suite)
and is refused by `propose.mjs` and `execute.mjs`. Changing it is a reviewed
PR; `__tests__/listing.test.js` pins the current list.

Public as of 2026-10-11: Petrophysics with Petrolord Module A (`lesson-a1`
to `lesson-a4`), QI with Petrolord Module A (`lesson-qi-a1` to
`lesson-qi-a3`), the Petrophysics Studio demos (`petro-01` to `petro-03`),
the QI Studio demos (`qi-01` to `qi-03`) and the Seismolord demos (`seis-01`
to `seis-03`). Well Data Manager is approved but has no finished video yet.
Since 2026-10-16 (owner): the demos and Module A of eight more apps, and
38 Shorts cut from the public demos (series `demo-shorts`).

## Copy rules

- Descriptions end with `Petrolord Suite: https://petrolord.com`.
- Lesson videos carry `Continue in NextGen Academy: https://nextgen.petrolord.com`
  just above it.
- British English, plain and expert, no em dashes. Any dash or angle bracket
  in the source text is flagged in the proposal's `copy_warnings` for the
  reviewer.
- Default privacy is `private`: Google keeps uploads from an unaudited API
  project private anyway. `scheduled_at` is the proposed publish time; until
  the API project passes its audit, a person publishes at that time in
  YouTube Studio.

## Setup (once, on the studio box, as root)

1. **OAuth client.** In Google Cloud Console, enable the YouTube Data API v3,
   create an OAuth client of type *Desktop app*, download its JSON and save it
   as `/root/.youtube-oauth-client.json` (`chmod 600`).
2. **Consent.** Run

   ```
   node tools/ai-employees/youtube/auth.mjs
   ```

   Open the printed URL in a browser signed in as the channel owner and allow
   access. The browser then lands on `http://127.0.0.1:8765/?code=...` and
   shows an error page; that is expected. Copy the whole address from the
   browser bar and paste it into the terminal. The refresh token is saved to
   `/root/.youtube-oauth-token.json` (mode 600) and the authorised channel's
   title and id are printed. Tokens are never printed. Use `--port` to change
   the loopback port.
3. **Database access.** Create `/root/.ai-employees.env` (`chmod 600`; the
   scripts refuse a file readable by others):

   ```
   SUPABASE_URL=https://ssyckywijlrkgcwvkwlr.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

   The key is never printed or committed. Without this file, `propose.mjs`
   writes proposals to `/root/ai-employees/youtube-proposals.json` instead,
   and `execute.mjs` will not run.
4. The `ai_employees` migration must be applied (owner-run).

## Running

A daily cron on the studio box runs `execute.mjs` at 08:00 UTC (log
`/root/ai-employees/execute.log`). It uploads approved tasks whose slot is
within the next 24 hours, at most 3 a run, because YouTube's default API
quota is 10,000 units a day and one upload with captions and a playlist
costs about 2,100.

```
node tools/ai-employees/youtube/propose.mjs                  # local JSON, for a look
node tools/ai-employees/youtube/propose.mjs --db             # queue for review
node tools/ai-employees/youtube/propose.mjs --db --keys qi-01,qi-02 --start 2026-10-20 --every-days 2
node tools/ai-employees/youtube/execute.mjs --dry-run        # what would run, no upload, no writes
node tools/ai-employees/youtube/execute.mjs                  # upload approved tasks whose slot is due (at most 3 a run)
```

`propose.mjs` only reads `/root/demo-videos/<key>/` (`youtube.mp4`,
`youtube-description.txt`, `chapters.txt`, `youtube.srt`, `thumbnail.jpg` or
`thumbnail.png`) and skips keys that
already have a proposed, approved or done listing. If an upload starts and
the process dies, `execute.mjs` will not retry that task until a person has
checked YouTube Studio and reruns with `--force`.

## Thumbnails

`tools/demo-video/thumbs.mjs` writes `thumbnail.jpg` (1280x720, under 2 MB)
into each public video folder, and the proposal names it. After the upload,
`execute.mjs` calls `thumbnails.set` with retries. A refused thumbnail never
fails the upload: the task is marked done with a warning. A task proposed
before thumbnails existed has no `thumbnail_file`; `execute.mjs` then uses the
folder's `thumbnail.jpg` (or `thumbnail.png`) the same way. Shorts never get
one.

## Files freed by housekeeping

`tools/ops/housekeeping.sh` deletes a folder's `youtube.mp4` 30 days after
`r2.json` records its R2 backup, but upload slots run further out than that.
When a due task's video or thumbnail is missing locally, `execute.mjs`
downloads it from R2 (the key in `r2.json`), checks size and MD5 against the
`r2.json` record, and only then uploads it (logged as `master_restored`).
Housekeeping frees it again on a later pass. A download that does not match,
or a file in neither place, fails the task with the reason in its result; a
thumbnail problem is only a warning. `--dry-run` says which files would come
from R2 and fetches nothing.

YouTube only accepts custom thumbnails from a channel with intermediate
features. If `thumbnails.set` answers 403, the owner opens YouTube Studio,
Settings, Channel, Feature eligibility, and verifies the channel's phone
number under Intermediate features. Then, for videos already uploaded:

```
node tools/ai-employees/youtube/set-thumbnails.mjs --dry-run   # what it would set; no API, no writes
node tools/ai-employees/youtube/set-thumbnails.mjs             # every done listing still without a thumbnail
node tools/ai-employees/youtube/set-thumbnails.mjs --video petro-01=_aBSe9V8W3o --video petro-02=eC_UIq_Abec
```

Each success is logged as `thumbnail_set`; `thumbnails.set` costs 50 quota
units.

## Shorts

`tools/demo-video/shorts.mjs` cuts vertical Shorts (1080x1920, 30 to 60 s,
captions burned in) from the demo masters into
`/root/demo-videos/<demo>-short<n>/`. They are listed in the allowlist under
the series of kind `short`, and a Short is public only while its parent is a
public demo there: a Short of a lesson or a members-only video is refused by
`propose.mjs` and `execute.mjs` even if someone lists it.

A Short is a normal `youtube_listing` task with `payload.format = "short"` and
`payload.parent_key`. Its description carries `Full demo: {{parent_url}}`;
`propose.mjs` fills it in when the parent is already uploaded, and otherwise
`execute.mjs` fills it in at upload time and holds the Short until its parent
is on the channel. Shorts are scheduled between the main uploads: at least a
day after the parent's slot and two days after the previous Short, so the
daily run stays within `DAILY_UPLOAD_CAP` and the quota. A Short whose parent
has not been proposed yet waits for a later `propose.mjs` run.

```
node tools/ai-employees/youtube/propose.mjs --db --only shorts      # queue the Shorts once their parents are proposed
node tools/ai-employees/youtube/propose.mjs --db --privacy public   # proposals default to private
node tools/ai-employees/youtube/execute.mjs --dry-run --local <proposals.json>   # a plan from a local file: no DB, no API
```

No npm dependencies: Node 18+ `fetch` only. Tests run in the repo's jest:
`npx jest tools/ai-employees`.
