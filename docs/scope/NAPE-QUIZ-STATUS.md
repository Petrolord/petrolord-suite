# NAPE booth quiz (Petrolord Upstream Challenge): status

2026-10-10. Built on branch `feat/nape-quiz`; the PR is open for the owner to review.

## Owner decisions
| Decision | Answer |
|---|---|
| Joining | Quick join: scan the QR, then nickname, phone and the consent tick. Every player is also a lead (`event_leads`, source `quiz`). |
| Questions | A mix of adapted NextGen bank questions and a new Petrolord and NAPE set. |
| Rounds | Host-run from a staff tablet. |
| Prize checks | A one-time code on the winner's phone, checked by staff on the host page. |
| Booth TV | A laptop on HDMI. It loops the demo videos between rounds and switches to the live game by itself. |
| Title | **Petrolord Upstream Challenge**. The title is one constant (`QUIZ_TITLE` in `src/lib/eventQuiz.js`). |
| Schedule | One game a day at 2pm. |
| Days | Day 1: Exploration (Mon 9 Nov 2026). Day 2: Production (Tue 10 Nov). Day 3: Reservoir Modelling and Field Development (Wed 11 Nov). |
| Winners | Three a day. A tie for a podium place is broken by tie-breaker questions of rising difficulty, played by the tied players only. |

### Prizes, each day
Staff hand the prizes over by hand. The app shows them as text only and grants nothing.
- **1st:** two months of one Petrolord app of the winner's choice from that day's theme. One seat, to be started within 90 days. Plus a certificate of achievement.
- **2nd:** a sponsored NextGen Petrophysics course at Associate level. Professional is also sponsored if the winner passes Associate within 60 days. Plus a certificate.
- **3rd:** a certificate, plus a 50% discount code for a NextGen Associate course.

The certificate wording is "Winner, Day N: Theme", followed by the place, for example "Winner, Day 1: Exploration (1st place)". It comes from `certificateTitle()`.

## What is built
**Phone: `/nape/quiz`** (`src/pages/events/NapeQuiz.jsx`)
- Public, mobile-first and not indexed.
- **Before a game:** it shows the schedule.
- **Joining:** nickname (2 to 20 characters, unique in the game), phone (WhatsApp) and the approved consent text. There is a honeypot field.
- **During a question:**
  - There is a 3-second "Get ready", then the question with four coloured buttons and a countdown.
  - The answer locks after one tap.
  - After the reveal, the player sees right or wrong, the points and a one-line explanation.
  - The player's points and rank sit in the header.
- **Tie-breakers:** only the tied players can answer. Everyone else sees who is playing.
- **At the end:** a winner sees the place, the certificate line, the prize and a 6-character code (no look-alike characters). Everyone else sees their finishing place and a WhatsApp button.
- **Survives reconnects:**
  - The player token and any unconfirmed answer are kept in local storage.
  - An answer tapped while offline is sent again on its own.
  - A reload or a new tab carries on.
  - The same phone number with the same nickname can rejoin from another phone. That gives a new token and the old one stops working.

**Booth TV: `/nape/quiz/tv`** (`NapeQuizTv.jsx`), dark and 1920x1080.
- **No game open:** loops the videos, with the title, "Today at 2pm: Day N: Theme" and the join QR.
- **Lobby:** a large QR code, the URL, the scoring rule, the player count and the nicknames.
- **Question:** the question, the options in a 2x2 grid, a countdown and the number answered.
- **Reveal:** the correct option is highlighted, with the share choosing each option, the explanation and the top 10.
- **Finished:** a podium with the certificate lines and the prizes, until the host closes the game.
- **Videos:** the six 4K NAPE cuts (Petrophysics demos 1 to 3 and QI demos 1 to 3) are staged in `/root/nape-tv-videos/`. Copy them to the laptop, then pick them with "Choose the demo videos on this laptop". The masters are in a private R2 bucket with no public URLs, and expo Wi-Fi should not be trusted to stream 4K, so the TV plays them from local files. `TV_VIDEO_URLS` in `eventQuiz.js` takes public URLs if the videos get a public home later.
- **Full screen:** small button at the top right.

**Host: `/nape/quiz/host`** (`NapeQuizHost.jsx`), signed in and quiz hosts only.
1. **Open the lobby:** pick the day (defaulted from the Lagos date) and set the seconds per question (default 20) and the number of questions (default 12). A practice game does not use up the day's questions.
2. **The draw:** the questions are drawn at random from the day's bank. Each difficulty's share (2/3/3/2/2 from easy to hard) is spread across the modules, played easy to hard, and skips questions already used in a real game. "Draw different questions" redraws in the lobby.
3. **Running the round:** start question 1, then reveal (which also closes answers early), then next question, and so on. The host sees the answer key, the answered count and the time left.
4. **Podium:**
   - The host page works out the top three. Only players who scored can win.
   - Any tie that touches a podium place gets "Run a tie-breaker for these players".
   - Each tie-breaker is harder than the last one those same players played (3, then 4, then 5).
   - When nothing is left tied, "Confirm the winners" issues the codes and the TV shows the podium.
5. **Other controls:**
   - Remove or restore a player (for offensive nicknames).
   - Standings with the last four digits of each phone.
   - Check a prize code and mark the prize as handed over.
   - Abandon or close the game.
6. **Hosts:** super admins can add booth staff by their sign-in email, so a tablet does not need a super admin login.

**Logic** (`src/lib/eventQuiz.js`)
- **Scoring:** a wrong answer scores 0. A correct one scores 500 plus up to 500 for speed, falling linearly to 500 at the buzzer. The database applies the same rule (`event_quiz_points`), and a test checks that the two match.
- **Also here:** the draw, tie-breaker choice, ranking and podium, the clock offset, question phases, the offline answer queue, the title, days and prizes.

**API** (`src/services/eventQuizApi.js`)
- Every call is a database function.
- After each action the host broadcasts "changed" on the realtime channel `event-quiz`, and phones and the TV fetch again at once.
- Phones also poll every 2 s and the TV every 1 s. A dropped socket on booth Wi-Fi only adds a second or two.

**QR code:** `tools/nape/nape-quiz.svg` and `.png` open https://petrolord.com/nape/quiz (decoded to check). A copy is at `public/event/nape-quiz-qr.svg` for the TV and the lobby. The lead page's "Play the Petrolord Upstream Challenge" button (`QUIZ_URL`) now links to the quiz.

## Database (migrations pending; the owner applies them)
1. **`supabase/migrations/20261011090000_event_quiz.sql`**
   - **Tables:** seven new `event_quiz_*` tables: questions, games, game_questions, players, answers, winners and hosts.
   - **Lead source:** `event_leads.source` now accepts `quiz`. No shared table is touched.
   - **Access:**
     - Every quiz table has RLS on and no grants to anon or authenticated. All access goes through SECURITY DEFINER functions, so the answer key never leaves the database before a reveal.
     - Anon can call only `event_quiz_join`, `event_quiz_state` and `event_quiz_answer`.
     - Host functions call `event_quiz_require_host()` first. A host is `is_super_admin()` or a user listed in `event_quiz_hosts`.
   - **Players:** each has a random token. Only its SHA-256 is stored.
   - **Answer timing:**
     - Taken by `clock_timestamp()` when the answer arrives. The phone's clock is never used.
     - Accepted from the opening moment until 1 s after the buzzer (scored at the floor).
     - Each player can answer each question once.
   - **One open game at a time** (a partial unique index).
2. **`supabase/migrations/20261011090100_event_quiz_bank.sql`:** the question bank. It is generated from `tools/nape/quiz-bank.json` by `node tools/nape/build_quiz_seed.mjs`. Questions are upserted by id, and questions taken out of the JSON are switched off.

Both files are idempotent and were run twice on a scratch Postgres 16, with stub `auth.users`, `auth.uid()`, roles and `is_super_admin()`. That scratch run also played a full game:
- **Access and joining:**
  - anon cannot read tables or call host functions;
  - a non-host is refused;
  - a super admin adds a host;
  - duplicate nicknames and phones are refused;
  - a player can rejoin;
  - leads are written with source `quiz`.
- **Questions and scoring:**
  - the answer key is hidden before the reveal;
  - answers are timed by the server (995 and 944 points after 0.2 s and 2.2 s);
  - duplicates are accepted once and late answers refused;
  - the leaderboard counts revealed questions only.
- **Tie-breakers:** only eligible players can answer.
- **Finish and close:** codes are issued; verify and mark work; after closing, the TV state is empty and a new game can open.

## Question bank (`tools/nape/quiz-bank.json`)
156 questions:
- 138 main questions: day 1 has 45, day 2 has 45 and day 3 has 48;
- 18 tie-breakers, 6 per day: two each at difficulty 3, 4 and 5.

28 are adapted from the NextGen banks: shortened for a 20-second phone question, with the course reference in `origin`. 128 are new.

| Day | Main questions by difficulty (1 / 2 / 3 / 4 / 5) | Modules |
|---|---|---|
| 1 Exploration | 8 / 11 / 11 / 9 / 6 | Geoscience, Economics (risking, EMV, PRMS, value of information), Drilling (kicks, pore and fracture pressure), Reservoir, Assurance (PIA regulator) |
| 2 Production | 8 / 10 / 11 / 9 / 7 | Production (lift, nodal, decline, allocation), Facilities (separation, hydrates, wax, TEG), Drilling (barriers, ECD, perforating) |
| 3 Reservoir Modelling and Field Development | 8 / 11 / 12 / 10 / 7 | Reservoir (volumetrics, MBAL, SCAL, well test, simulation), Economics (NPV, IRR, PSC, breakeven), Facilities (FPSO, plateau sizing, tiebacks), Assurance |

Every calculation answer was checked by computing it. The copy-style test bans em and en dashes and "X, not Y". Prompts are kept to 120 characters or fewer, so they can be read in 20 seconds.

## Tests
- `src/lib/__tests__/eventQuiz.test.js` (33) covers:
  - scoring;
  - the draw: the mix, the module spread, used and excluded questions, filling from neighbours, easy-to-hard order, seeded repeats;
  - tie-breaker choice, per tied group;
  - ranking and the podium: ties straddling or inside the podium, ties below it, zero scorers, tie-breakers among tied players only, repeated tie-breakers;
  - the phone: join checks, phases on the server clock, the offset, the offline queue;
  - days, title and prizes.
- `src/lib/__tests__/eventQuizMigration.test.js` (9) covers RLS and grants, host checks, server timing, answer-key hiding, token hashing, SQL against JS scoring, the leads source and idempotence.
- `src/lib/__tests__/eventQuizBank.test.js` (6) covers structure, copy style, per-day counts and modules, rising tie-breakers, a drawable game for each day, and the seed being in sync with the JSON.
- **Negative controls:** every behaviour above was broken on purpose and the tests failed: 14 mutations of the logic and 6 of the SQL.
- `e2e/nape-quiz.spec.js` (3), with the database functions mocked at the network:
  - the phone path from join to the winner code, including a reload;
  - the TV from the video loop to the podium;
  - the host page redirecting a signed-out visitor to the login page.
- `src/pages/__tests__/NapeLeads.test.jsx`: updated for the quiz link.

## Owner items before 9 November
1. **Review and merge the PR.**
2. **Apply both migrations**, in order:
   - `supabase db query --linked -f supabase/migrations/20261011090000_event_quiz.sql`
   - `supabase db query --linked -f supabase/migrations/20261011090100_event_quiz_bank.sql`

   Copies are in `/root/pending-migrations/`.
3. **Ship the Suite zip**, so that `/nape/quiz`, `/nape/quiz/tv` and `/nape/quiz/host` are live.
4. **Add booth staff as hosts** on the host page (they need Petrolord accounts first).
5. **Run a practice game end to end:** a few phones, the tablet as host, and the laptop on the TV.
6. **Set up the booth laptop:** copy `/root/nape-tv-videos/` to it, open `petrolord.com/nape/quiz/tv` in Chrome, choose the videos and press Full screen.
7. **Print the quiz QR code** (`tools/nape/nape-quiz.svg`; sizes in `tools/nape/README.md`).
8. **Optional:** review the question bank. Staff can see the questions on the host page in the lobby, before they start. A practice game shows real questions.

## Limits and notes
- **Fixed by the owner's decisions:** prizes are text only, with no granting logic.
- **Practice games:** they appear on the TV like real games. Hosts should close a practice game before the 2pm real one.
- **Scale:** the open-game limit is 1000 players. Polling costs one small database call per phone every 2 s, which is fine for a booth crowd.
- **No real realtime test:** if the realtime broadcast is blocked on site, polling alone keeps everything within about 2 s.
