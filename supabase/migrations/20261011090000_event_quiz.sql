-- NAPE booth quiz, the Petrolord Upstream Challenge (2026-11-09 to 11, one
-- game a day at 2pm). Visitors scan the booth QR code, join with a nickname
-- and phone number, and answer on their phones; a member of staff runs each
-- round from the host page and the booth TV shows the live question and the
-- leaderboard. New tables only (event_quiz_*); the one change to an existing
-- table is widening event_leads.source to accept 'quiz', so every player is
-- also a lead. No shared table is touched.
--
-- Access model:
--   * Every event_quiz_* table has RLS on and NO table grants to anon or
--     authenticated. Players, the TV and the host reach the data only through
--     the SECURITY DEFINER functions below, so the answer key never leaves the
--     database before a question is revealed.
--   * Players have no account. Joining returns a random token (two v4 UUIDs,
--     244 random bits); the database keeps only its SHA-256. The token proves
--     "this phone is that player" on every answer and state call.
--   * Answer times are taken by the database (clock_timestamp()) when the
--     answer arrives. The phone's clock is never used for scoring.
--   * Hosts are platform super admins (public.is_super_admin()) or users a
--     super admin has added to event_quiz_hosts, so booth staff can run the
--     quiz on a tablet signed in to an ordinary account instead of a super
--     admin login. Every host function checks public.event_quiz_is_host().
--
-- Idempotent: tables and indexes use IF NOT EXISTS, functions are CREATE OR
-- REPLACE, policies and constraints are dropped before they are re-created.

-- 1. Players are leads too: event_leads.source accepts 'quiz'.
alter table public.event_leads drop constraint if exists event_leads_source;
alter table public.event_leads add constraint event_leads_source check (source in ('qr', 'tablet', 'quiz'));

-- 2. Tables.
create table if not exists public.event_quiz_questions (
  id text primary key,
  day_no smallint not null,
  kind text not null default 'main',
  difficulty smallint not null,
  module text not null,
  topic text,
  prompt text not null,
  options jsonb not null,
  answer_index smallint not null,
  explanation text,
  source text not null,
  origin text,
  active boolean not null default true,
  constraint event_quiz_questions_id_fmt check (id ~ '^[A-Z0-9-]{3,20}$'),
  constraint event_quiz_questions_day check (day_no between 1 and 3),
  constraint event_quiz_questions_kind check (kind in ('main', 'tiebreak')),
  constraint event_quiz_questions_difficulty check (difficulty between 1 and 5),
  constraint event_quiz_questions_prompt_len check (char_length(prompt) between 5 and 300),
  constraint event_quiz_questions_options check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  constraint event_quiz_questions_answer check (answer_index between 0 and 3),
  constraint event_quiz_questions_source check (source in ('nextgen', 'petrolord'))
);

create table if not exists public.event_quiz_games (
  id uuid primary key default gen_random_uuid(),
  event text not null default 'NAPE 2026',
  title text not null,
  day_no smallint not null,
  practice boolean not null default false,
  status text not null default 'lobby',
  question_seconds smallint not null default 20,
  current_seq integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  closed_at timestamptz,
  constraint event_quiz_games_title_len check (char_length(title) between 1 and 120),
  constraint event_quiz_games_day check (day_no between 1 and 3),
  constraint event_quiz_games_status check (status in ('lobby', 'live', 'tiebreak', 'finished', 'closed')),
  constraint event_quiz_games_seconds check (question_seconds between 10 and 60)
);
-- at most one game is open (not closed) at a time: phones and the TV follow it
create unique index if not exists event_quiz_games_one_open on public.event_quiz_games ((true)) where status <> 'closed';

create table if not exists public.event_quiz_game_questions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.event_quiz_games (id) on delete cascade,
  seq integer not null,
  question_id text not null references public.event_quiz_questions (id),
  kind text not null default 'main',
  eligible uuid[],
  tie_group integer,
  starts_at timestamptz,
  ends_at timestamptz,
  revealed_at timestamptz,
  constraint event_quiz_gq_kind check (kind in ('main', 'tiebreak')),
  constraint event_quiz_gq_seq unique (game_id, seq),
  constraint event_quiz_gq_question unique (game_id, question_id)
);

create table if not exists public.event_quiz_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.event_quiz_games (id) on delete cascade,
  nickname text not null,
  phone text not null,
  token_hash text not null,
  lead_id uuid,
  kicked boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  constraint event_quiz_players_nickname_len check (char_length(nickname) between 2 and 20),
  constraint event_quiz_players_phone_fmt check (phone ~ '^[1-9][0-9]{7,14}$'),
  constraint event_quiz_players_phone unique (game_id, phone)
);
create unique index if not exists event_quiz_players_nickname on public.event_quiz_players (game_id, lower(nickname));
create unique index if not exists event_quiz_players_token on public.event_quiz_players (token_hash);

create table if not exists public.event_quiz_answers (
  game_question_id uuid not null references public.event_quiz_game_questions (id) on delete cascade,
  player_id uuid not null references public.event_quiz_players (id) on delete cascade,
  choice smallint not null,
  received_at timestamptz not null,
  elapsed_ms integer not null,
  correct boolean not null,
  points integer not null,
  primary key (game_question_id, player_id),
  constraint event_quiz_answers_choice check (choice between 0 and 3)
);
create index if not exists event_quiz_answers_player on public.event_quiz_answers (player_id);

create table if not exists public.event_quiz_winners (
  game_id uuid not null references public.event_quiz_games (id) on delete cascade,
  place smallint not null,
  player_id uuid not null references public.event_quiz_players (id) on delete cascade,
  code text not null,
  issued_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid,
  primary key (game_id, place),
  constraint event_quiz_winners_place check (place between 1 and 3),
  constraint event_quiz_winners_player unique (game_id, player_id),
  constraint event_quiz_winners_code unique (code)
);

create table if not exists public.event_quiz_hosts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_by uuid,
  created_at timestamptz not null default now()
);

-- RLS on, no policies, no grants: functions only.
alter table public.event_quiz_questions enable row level security;
alter table public.event_quiz_games enable row level security;
alter table public.event_quiz_game_questions enable row level security;
alter table public.event_quiz_players enable row level security;
alter table public.event_quiz_answers enable row level security;
alter table public.event_quiz_winners enable row level security;
alter table public.event_quiz_hosts enable row level security;
revoke all on public.event_quiz_questions, public.event_quiz_games, public.event_quiz_game_questions,
  public.event_quiz_players, public.event_quiz_answers, public.event_quiz_winners, public.event_quiz_hosts
  from anon, authenticated;

-- 3. Helpers.

-- Points for one answer: nothing for a wrong answer; a correct one earns
-- 500 plus up to 500 more for speed, falling linearly to 500 at the buzzer.
-- src/lib/eventQuiz.js scoreAnswer() is the same rule (eventQuizMigration
-- test checks the two agree).
create or replace function public.event_quiz_points(p_correct boolean, p_elapsed_ms integer, p_duration_ms integer)
returns integer language sql immutable as $$
  select case when not p_correct then 0
    else 500 + round(500 * (1 - least(1, greatest(0, p_elapsed_ms::numeric / greatest(p_duration_ms, 1)))))::integer end
$$;

create or replace function public.event_quiz_token_hash(p_token text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

-- A six character prize code without look-alike characters (no 0/O, 1/I/L).
create or replace function public.event_quiz_new_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid());
  s text := '';
begin
  for i in 0..5 loop
    s := s || substr(alphabet, (get_byte(b, i) % 31) + 1, 1);
  end loop;
  return s;
end $$;

create or replace function public.event_quiz_is_host()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and (public.is_super_admin() or exists (select 1 from public.event_quiz_hosts h where h.user_id = auth.uid()))
$$;

create or replace function public.event_quiz_require_host()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.event_quiz_is_host() then
    raise exception 'Only quiz hosts can do this.' using errcode = '42501';
  end if;
end $$;

create or replace function public.event_quiz_open_game()
returns public.event_quiz_games language sql stable security definer set search_path = public as $$
  select * from public.event_quiz_games where status <> 'closed' order by created_at desc limit 1
$$;

-- Main-question points per player over REVEALED questions only, so the
-- leaderboard never hints at who got an open question right.
create or replace function public.event_quiz_totals(p_game uuid)
returns table (player_id uuid, nickname text, points bigint, correct bigint, answered bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.nickname,
         coalesce(sum(a.points) filter (where gq.revealed_at is not null and gq.kind = 'main'), 0),
         coalesce(count(*) filter (where gq.revealed_at is not null and gq.kind = 'main' and a.correct), 0),
         coalesce(count(a.choice) filter (where gq.revealed_at is not null and gq.kind = 'main'), 0)
    from public.event_quiz_players p
    left join public.event_quiz_answers a on a.player_id = p.id
    left join public.event_quiz_game_questions gq on gq.id = a.game_question_id
   where p.game_id = p_game and not p.kicked
   group by p.id, p.nickname
$$;

-- 4. Player functions (anon and signed in).

create or replace function public.event_quiz_join(
  p_nickname text, p_phone text, p_consent boolean, p_consent_text text, p_user_agent text default null
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  g public.event_quiz_games;
  nick text := btrim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g'));
  ph text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  existing public.event_quiz_players;
  lead uuid;
  pid uuid;
begin
  select * into g from public.event_quiz_open_game();
  if g.id is null or g.status not in ('lobby', 'live') then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;
  if char_length(nick) < 2 or char_length(nick) > 20 then
    return jsonb_build_object('ok', false, 'reason', 'nickname');
  end if;
  if ph !~ '^[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'reason', 'phone');
  end if;
  if not coalesce(p_consent, false) or char_length(coalesce(p_consent_text, '')) not between 1 and 600 then
    return jsonb_build_object('ok', false, 'reason', 'consent');
  end if;

  select * into existing from public.event_quiz_players where game_id = g.id and phone = ph;
  if existing.id is not null then
    -- the same person on a new phone or after clearing the browser: the same
    -- number and nickname get a fresh token (the old one stops working)
    if lower(existing.nickname) <> lower(nick) then
      return jsonb_build_object('ok', false, 'reason', 'phone_taken');
    end if;
    if existing.kicked then
      return jsonb_build_object('ok', false, 'reason', 'removed');
    end if;
    update public.event_quiz_players set token_hash = public.event_quiz_token_hash(tok), last_seen_at = now() where id = existing.id;
    return jsonb_build_object('ok', true, 'player_id', existing.id, 'game_id', g.id, 'nickname', existing.nickname, 'token', tok, 'rejoined', true);
  end if;
  if exists (select 1 from public.event_quiz_players where game_id = g.id and lower(nickname) = lower(nick)) then
    return jsonb_build_object('ok', false, 'reason', 'nickname_taken');
  end if;
  if (select count(*) from public.event_quiz_players where game_id = g.id) >= 1000 then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  insert into public.event_leads (event, name, phone, consent, consent_text, source, note, user_agent)
  values (g.event, nick, ph, true, p_consent_text, 'quiz', left('Quiz player: ' || g.title, 1000), nullif(left(coalesce(p_user_agent, ''), 300), ''))
  returning id into lead;

  insert into public.event_quiz_players (game_id, nickname, phone, token_hash, lead_id, last_seen_at)
  values (g.id, nick, ph, public.event_quiz_token_hash(tok), lead, now())
  returning id into pid;
  return jsonb_build_object('ok', true, 'player_id', pid, 'game_id', g.id, 'nickname', nick, 'token', tok, 'rejoined', false);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'nickname_taken');
end $$;

-- What a phone or the TV needs to draw the screen. With a token, also that
-- player's own answer, points, rank and prize code. The correct option and
-- the answer counts appear only once the question is revealed.
create or replace function public.event_quiz_state(p_token text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  g public.event_quiz_games;
  me public.event_quiz_players;
  gq public.event_quiz_game_questions;
  q public.event_quiz_questions;
  main_total integer;
  cur jsonb := null;
  board jsonb;
  mine jsonb := null;
  my_answer public.event_quiz_answers;
  winners jsonb := '[]'::jsonb;
  tied jsonb := null;
  my_points bigint;
  my_rank bigint;
  players integer;
begin
  select * into g from public.event_quiz_open_game();
  if g.id is null then
    return jsonb_build_object('server_now', clock_timestamp(), 'game', null);
  end if;
  if p_token is not null then
    select * into me from public.event_quiz_players
     where token_hash = public.event_quiz_token_hash(p_token) and game_id = g.id;
    if me.id is not null then
      update public.event_quiz_players set last_seen_at = now() where id = me.id and (last_seen_at is null or last_seen_at < now() - interval '20 seconds');
    end if;
  end if;

  select count(*) into players from public.event_quiz_players where game_id = g.id and not kicked;
  select count(*) into main_total from public.event_quiz_game_questions where game_id = g.id and kind = 'main';

  if g.current_seq is not null then
    select * into gq from public.event_quiz_game_questions where game_id = g.id and seq = g.current_seq;
    select * into q from public.event_quiz_questions where id = gq.question_id;
    cur := jsonb_build_object(
      'id', gq.id, 'seq', gq.seq, 'kind', gq.kind,
      'number', case when gq.kind = 'main' then (select count(*) from public.event_quiz_game_questions x where x.game_id = g.id and x.kind = 'main' and x.seq <= gq.seq) end,
      'of', main_total,
      'module', q.module, 'difficulty', q.difficulty,
      'prompt', q.prompt, 'options', q.options,
      'starts_at', gq.starts_at, 'ends_at', gq.ends_at,
      'revealed', gq.revealed_at is not null,
      'answered', (select count(*) from public.event_quiz_answers a where a.game_question_id = gq.id),
      'eligible_names', case when gq.eligible is null then null else
        (select coalesce(jsonb_agg(p.nickname order by p.nickname), '[]'::jsonb) from public.event_quiz_players p where p.id = any (gq.eligible)) end
    );
    if gq.revealed_at is not null then
      cur := cur || jsonb_build_object(
        'answer_index', q.answer_index,
        'explanation', q.explanation,
        'counts', (select jsonb_build_array(
            count(*) filter (where a.choice = 0), count(*) filter (where a.choice = 1),
            count(*) filter (where a.choice = 2), count(*) filter (where a.choice = 3))
          from public.event_quiz_answers a where a.game_question_id = gq.id));
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('nickname', t.nickname, 'points', t.points, 'correct', t.correct) order by t.points desc, lower(t.nickname)), '[]'::jsonb)
    into board
    from (select * from public.event_quiz_totals(g.id) order by points desc, lower(nickname) limit 10) t;

  if g.status in ('finished') then
    select coalesce(jsonb_agg(jsonb_build_object('place', w.place, 'nickname', p.nickname) order by w.place), '[]'::jsonb)
      into winners
      from public.event_quiz_winners w join public.event_quiz_players p on p.id = w.player_id
     where w.game_id = g.id;
  end if;

  if me.id is not null then
    select t.points into my_points from public.event_quiz_totals(g.id) t where t.player_id = me.id;
    select count(*) + 1 into my_rank from public.event_quiz_totals(g.id) t where t.points > coalesce(my_points, 0);
    if gq.id is not null then
      select * into my_answer from public.event_quiz_answers where game_question_id = gq.id and player_id = me.id;
    end if;
    mine := jsonb_build_object(
      'player_id', me.id, 'nickname', me.nickname, 'kicked', me.kicked,
      'points', coalesce(my_points, 0), 'rank', my_rank, 'players', players,
      'can_answer', gq.id is not null and gq.revealed_at is null and not me.kicked and (gq.eligible is null or me.id = any (gq.eligible)),
      'choice', my_answer.choice,
      'result', case when gq.revealed_at is not null and my_answer.choice is not null
                     then jsonb_build_object('correct', my_answer.correct, 'points', my_answer.points) end,
      'winner', (select jsonb_build_object('place', w.place, 'code', w.code, 'verified', w.verified_at is not null)
                   from public.event_quiz_winners w where w.game_id = g.id and w.player_id = me.id)
    );
  end if;

  return jsonb_build_object(
    'server_now', clock_timestamp(),
    'game', jsonb_build_object('id', g.id, 'title', g.title, 'day_no', g.day_no, 'practice', g.practice,
      'status', g.status, 'question_seconds', g.question_seconds, 'players', players),
    'question', cur,
    'leaderboard', board,
    'winners', winners,
    'me', mine,
    'token_valid', case when p_token is null then null else me.id is not null end
  );
end $$;

create or replace function public.event_quiz_answer(p_token text, p_game_question_id uuid, p_choice integer)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  t timestamptz := clock_timestamp();
  me public.event_quiz_players;
  g public.event_quiz_games;
  gq public.event_quiz_game_questions;
  q public.event_quiz_questions;
  prior public.event_quiz_answers;
  ms integer;
  ok boolean;
  pts integer;
begin
  select * into me from public.event_quiz_players where token_hash = public.event_quiz_token_hash(p_token);
  if me.id is null then return jsonb_build_object('accepted', false, 'reason', 'unknown_player'); end if;
  if me.kicked then return jsonb_build_object('accepted', false, 'reason', 'removed'); end if;
  select * into gq from public.event_quiz_game_questions where id = p_game_question_id and game_id = me.game_id;
  if gq.id is null then return jsonb_build_object('accepted', false, 'reason', 'unknown_question'); end if;
  select * into g from public.event_quiz_games where id = me.game_id;
  if g.status not in ('live', 'tiebreak') or gq.starts_at is null then return jsonb_build_object('accepted', false, 'reason', 'not_open'); end if;
  select * into prior from public.event_quiz_answers where game_question_id = gq.id and player_id = me.id;
  if prior.choice is not null then
    return jsonb_build_object('accepted', true, 'duplicate', true, 'choice', prior.choice);
  end if;
  if gq.eligible is not null and not (me.id = any (gq.eligible)) then return jsonb_build_object('accepted', false, 'reason', 'not_eligible'); end if;
  if p_choice is null or p_choice not between 0 and 3 then return jsonb_build_object('accepted', false, 'reason', 'choice'); end if;
  if t < gq.starts_at then return jsonb_build_object('accepted', false, 'reason', 'too_early'); end if;
  -- one second of grace for the network after the buzzer; it scores the floor
  if gq.revealed_at is not null or t > gq.ends_at + interval '1 second' then
    return jsonb_build_object('accepted', false, 'reason', 'too_late');
  end if;
  select * into q from public.event_quiz_questions where id = gq.question_id;
  ms := greatest(0, floor(extract(epoch from (t - gq.starts_at)) * 1000))::integer;
  ok := p_choice = q.answer_index;
  pts := public.event_quiz_points(ok, ms, (extract(epoch from (gq.ends_at - gq.starts_at)) * 1000)::integer);
  insert into public.event_quiz_answers (game_question_id, player_id, choice, received_at, elapsed_ms, correct, points)
  values (gq.id, me.id, p_choice, t, ms, ok, pts)
  on conflict (game_question_id, player_id) do nothing;
  return jsonb_build_object('accepted', true, 'choice', p_choice, 'received_at', t);
end $$;

-- 5. Host functions (signed in, host only).

create or replace function public.event_quiz_host_create(p_day_no integer, p_title text, p_practice boolean default false, p_seconds integer default 20)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare gid uuid;
begin
  perform public.event_quiz_require_host();
  if exists (select 1 from public.event_quiz_games where status <> 'closed') then
    raise exception 'Close the open game before starting a new one.';
  end if;
  insert into public.event_quiz_games (title, day_no, practice, question_seconds, created_by)
  values (left(btrim(p_title), 120), p_day_no, coalesce(p_practice, false), coalesce(p_seconds, 20), auth.uid())
  returning id into gid;
  return gid;
end $$;

-- The questions for the game, in order (drawn on the host page).
create or replace function public.event_quiz_host_set_plan(p_game uuid, p_question_ids text[])
returns integer language plpgsql volatile security definer set search_path = public as $$
declare g public.event_quiz_games; n integer;
begin
  perform public.event_quiz_require_host();
  select * into g from public.event_quiz_games where id = p_game for update;
  if g.status <> 'lobby' then raise exception 'The questions can only be set before the game starts.'; end if;
  if coalesce(array_length(p_question_ids, 1), 0) not between 1 and 40 then raise exception 'Give between 1 and 40 questions.'; end if;
  if (select count(distinct x) from unnest(p_question_ids) x) <> array_length(p_question_ids, 1) then raise exception 'A question appears twice.'; end if;
  if exists (select 1 from unnest(p_question_ids) x left join public.event_quiz_questions q on q.id = x
             where q.id is null or q.kind <> 'main' or q.day_no <> g.day_no or not q.active) then
    raise exception 'Every question must be an active main question for day %.', g.day_no;
  end if;
  delete from public.event_quiz_game_questions where game_id = g.id;
  insert into public.event_quiz_game_questions (game_id, seq, question_id, kind)
  select g.id, o.n, o.x, 'main' from unnest(p_question_ids) with ordinality as o(x, n);
  get diagnostics n = row_count;
  return n;
end $$;

-- Open the next main question: a short lead-in so every phone has it before
-- the clock starts, then question_seconds to answer.
create or replace function public.event_quiz_host_next(p_game uuid, p_lead_seconds integer default 3)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g public.event_quiz_games; nxt public.event_quiz_game_questions; s timestamptz;
begin
  perform public.event_quiz_require_host();
  select * into g from public.event_quiz_games where id = p_game for update;
  if g.status not in ('lobby', 'live') then raise exception 'This game is not running its main round.'; end if;
  if exists (select 1 from public.event_quiz_game_questions where game_id = g.id and starts_at is not null and revealed_at is null) then
    raise exception 'Reveal the current question first.';
  end if;
  select * into nxt from public.event_quiz_game_questions where game_id = g.id and kind = 'main' and starts_at is null order by seq limit 1;
  if nxt.id is null then raise exception 'There are no more questions.'; end if;
  s := clock_timestamp() + make_interval(secs => least(10, greatest(0, coalesce(p_lead_seconds, 3))));
  update public.event_quiz_game_questions set starts_at = s, ends_at = s + make_interval(secs => g.question_seconds) where id = nxt.id;
  update public.event_quiz_games set status = 'live', current_seq = nxt.seq, started_at = coalesce(started_at, now()) where id = g.id;
  return jsonb_build_object('seq', nxt.seq, 'starts_at', s);
end $$;

-- Reveal the current question; before the buzzer it also closes answers.
create or replace function public.event_quiz_host_reveal(p_game uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare g public.event_quiz_games; t timestamptz := clock_timestamp();
begin
  perform public.event_quiz_require_host();
  select * into g from public.event_quiz_games where id = p_game for update;
  update public.event_quiz_game_questions
     set ends_at = least(ends_at, t), revealed_at = t
   where game_id = g.id and seq = g.current_seq and starts_at is not null and revealed_at is null;
end $$;

-- A tie-breaker question for the tied players only, opened straight away.
create or replace function public.event_quiz_host_tiebreak(p_game uuid, p_question_id text, p_eligible uuid[], p_tie_group integer, p_lead_seconds integer default 3)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g public.event_quiz_games; q public.event_quiz_questions; nseq integer; s timestamptz;
begin
  perform public.event_quiz_require_host();
  select * into g from public.event_quiz_games where id = p_game for update;
  if g.status not in ('live', 'tiebreak') then raise exception 'Tie-breakers come after the main round.'; end if;
  if exists (select 1 from public.event_quiz_game_questions where game_id = g.id and kind = 'main' and revealed_at is null) then
    raise exception 'Finish the main round first.';
  end if;
  if exists (select 1 from public.event_quiz_game_questions where game_id = g.id and starts_at is not null and revealed_at is null) then
    raise exception 'Reveal the current question first.';
  end if;
  select * into q from public.event_quiz_questions where id = p_question_id;
  if q.id is null or q.kind <> 'tiebreak' or q.day_no <> g.day_no or not q.active then raise exception 'That is not a tie-breaker question for day %.', g.day_no; end if;
  if coalesce(array_length(p_eligible, 1), 0) < 2 then raise exception 'A tie-breaker needs at least two players.'; end if;
  if exists (select 1 from unnest(p_eligible) x left join public.event_quiz_players p on p.id = x and p.game_id = g.id and not p.kicked where p.id is null) then
    raise exception 'Every tied player must be in this game.';
  end if;
  select coalesce(max(seq), 0) + 1 into nseq from public.event_quiz_game_questions where game_id = g.id;
  s := clock_timestamp() + make_interval(secs => least(10, greatest(0, coalesce(p_lead_seconds, 3))));
  insert into public.event_quiz_game_questions (game_id, seq, question_id, kind, eligible, tie_group, starts_at, ends_at)
  values (g.id, nseq, q.id, 'tiebreak', p_eligible, p_tie_group, s, s + make_interval(secs => g.question_seconds));
  update public.event_quiz_games set status = 'tiebreak', current_seq = nseq where id = g.id;
  return jsonb_build_object('seq', nseq, 'starts_at', s);
end $$;

-- End the game with the podium the host page worked out; each winner gets
-- a one-time code that staff check before handing over the prize.
create or replace function public.event_quiz_host_finish(p_game uuid, p_winner_ids uuid[])
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g public.event_quiz_games; i integer; c text;
begin
  perform public.event_quiz_require_host();
  select * into g from public.event_quiz_games where id = p_game for update;
  if g.status not in ('live', 'tiebreak') then raise exception 'This game is not running.'; end if;
  if exists (select 1 from public.event_quiz_game_questions where game_id = g.id and starts_at is not null and revealed_at is null) then
    raise exception 'Reveal the current question first.';
  end if;
  if coalesce(array_length(p_winner_ids, 1), 0) > 3 then raise exception 'At most three winners.'; end if;
  if (select count(distinct x) from unnest(coalesce(p_winner_ids, '{}'::uuid[])) x) <> coalesce(array_length(p_winner_ids, 1), 0) then
    raise exception 'A player appears twice on the podium.';
  end if;
  if exists (select 1 from unnest(coalesce(p_winner_ids, '{}'::uuid[])) x left join public.event_quiz_players p on p.id = x and p.game_id = g.id and not p.kicked where p.id is null) then
    raise exception 'Every winner must be a player in this game.';
  end if;
  delete from public.event_quiz_winners where game_id = g.id;
  for i in 1..coalesce(array_length(p_winner_ids, 1), 0) loop
    loop
      c := public.event_quiz_new_code();
      exit when not exists (select 1 from public.event_quiz_winners where code = c);
    end loop;
    insert into public.event_quiz_winners (game_id, place, player_id, code) values (g.id, i, p_winner_ids[i], c);
  end loop;
  update public.event_quiz_games set status = 'finished', current_seq = null, finished_at = now() where id = g.id;
  return jsonb_build_object('winners', coalesce(array_length(p_winner_ids, 1), 0));
end $$;

-- Close the game: the TV goes back to the video loop and a new game can start.
create or replace function public.event_quiz_host_close(p_game uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.event_quiz_require_host();
  update public.event_quiz_games set status = 'closed', closed_at = now(), current_seq = null where id = p_game and status <> 'closed';
end $$;

create or replace function public.event_quiz_host_kick(p_player uuid, p_kicked boolean default true)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.event_quiz_require_host();
  update public.event_quiz_players set kicked = coalesce(p_kicked, true) where id = p_player;
end $$;

-- Everything the host page needs, including the answer key and full standings.
create or replace function public.event_quiz_host_state(p_game uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g public.event_quiz_games;
begin
  perform public.event_quiz_require_host();
  if p_game is null then select * into g from public.event_quiz_open_game();
  else select * into g from public.event_quiz_games where id = p_game; end if;
  if g.id is null then return jsonb_build_object('server_now', clock_timestamp(), 'game', null); end if;
  return jsonb_build_object(
    'server_now', clock_timestamp(),
    'game', to_jsonb(g),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', gq.id, 'seq', gq.seq, 'kind', gq.kind, 'question_id', q.id, 'difficulty', q.difficulty, 'module', q.module,
        'prompt', q.prompt, 'options', q.options, 'answer_index', q.answer_index,
        'eligible', gq.eligible, 'tie_group', gq.tie_group,
        'starts_at', gq.starts_at, 'ends_at', gq.ends_at, 'revealed_at', gq.revealed_at,
        'answered', (select count(*) from public.event_quiz_answers a where a.game_question_id = gq.id),
        'points', (select coalesce(jsonb_object_agg(a.player_id, a.points), '{}'::jsonb) from public.event_quiz_answers a where a.game_question_id = gq.id)
      ) order by gq.seq), '[]'::jsonb)
      from public.event_quiz_game_questions gq join public.event_quiz_questions q on q.id = gq.question_id where gq.game_id = g.id),
    'players', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'nickname', p.nickname, 'phone_tail', right(p.phone, 4), 'kicked', p.kicked, 'joined_at', p.joined_at,
        'last_seen_at', p.last_seen_at,
        'points', coalesce(t.points, 0), 'correct', coalesce(t.correct, 0), 'answered', coalesce(t.answered, 0)
      ) order by coalesce(t.points, 0) desc, lower(p.nickname)), '[]'::jsonb)
      from public.event_quiz_players p left join public.event_quiz_totals(g.id) t on t.player_id = p.id where p.game_id = g.id),
    'winners', (select coalesce(jsonb_agg(jsonb_build_object(
        'place', w.place, 'player_id', w.player_id, 'nickname', p.nickname, 'code', w.code, 'verified_at', w.verified_at
      ) order by w.place), '[]'::jsonb)
      from public.event_quiz_winners w join public.event_quiz_players p on p.id = w.player_id where w.game_id = g.id)
  );
end $$;

-- The bank for one day, with whether each question was already used in a
-- real (not practice) game, so the draw can skip it.
create or replace function public.event_quiz_host_bank(p_day_no integer)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.event_quiz_require_host();
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'kind', q.kind, 'difficulty', q.difficulty, 'module', q.module, 'prompt', q.prompt,
      'used', exists (select 1 from public.event_quiz_game_questions gq join public.event_quiz_games g on g.id = gq.game_id
                       where gq.question_id = q.id and not g.practice and g.started_at is not null)
    ) order by q.id), '[]'::jsonb)
    from public.event_quiz_questions q where q.day_no = p_day_no and q.active);
end $$;

-- Prize check: the code a winner's phone shows.
create or replace function public.event_quiz_host_verify(p_code text, p_mark boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare w public.event_quiz_winners; p public.event_quiz_players; g public.event_quiz_games;
begin
  perform public.event_quiz_require_host();
  select * into w from public.event_quiz_winners where code = upper(btrim(coalesce(p_code, '')));
  if w.game_id is null then return jsonb_build_object('found', false); end if;
  if p_mark and w.verified_at is null then
    update public.event_quiz_winners set verified_at = now(), verified_by = auth.uid() where game_id = w.game_id and place = w.place
    returning * into w;
  end if;
  select * into p from public.event_quiz_players where id = w.player_id;
  select * into g from public.event_quiz_games where id = w.game_id;
  return jsonb_build_object('found', true, 'place', w.place, 'nickname', p.nickname, 'phone_tail', right(p.phone, 4),
    'title', g.title, 'day_no', g.day_no, 'practice', g.practice, 'verified_at', w.verified_at);
end $$;

-- Super admins add booth staff as hosts by the email they sign in with.
create or replace function public.event_quiz_hosts_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Only a super admin can manage quiz hosts.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id', h.user_id, 'email', u.email, 'created_at', h.created_at) order by u.email), '[]'::jsonb)
    from public.event_quiz_hosts h join auth.users u on u.id = h.user_id);
end $$;

create or replace function public.event_quiz_hosts_set(p_email text, p_host boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_super_admin() then raise exception 'Only a super admin can manage quiz hosts.' using errcode = '42501'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'no_account'); end if;
  if p_host then
    insert into public.event_quiz_hosts (user_id, added_by) values (uid, auth.uid()) on conflict (user_id) do nothing;
  else
    delete from public.event_quiz_hosts where user_id = uid;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- 6. Execute grants: functions are not callable by PUBLIC by default here.
revoke all on function public.event_quiz_points(boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.event_quiz_token_hash(text) from public, anon, authenticated;
revoke all on function public.event_quiz_new_code() from public, anon, authenticated;
revoke all on function public.event_quiz_require_host() from public, anon, authenticated;
revoke all on function public.event_quiz_open_game() from public, anon, authenticated;
revoke all on function public.event_quiz_totals(uuid) from public, anon, authenticated;
revoke all on function public.event_quiz_join(text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.event_quiz_state(text) from public, anon, authenticated;
revoke all on function public.event_quiz_answer(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.event_quiz_is_host() from public, anon, authenticated;
revoke all on function public.event_quiz_host_create(integer, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.event_quiz_host_set_plan(uuid, text[]) from public, anon, authenticated;
revoke all on function public.event_quiz_host_next(uuid, integer) from public, anon, authenticated;
revoke all on function public.event_quiz_host_reveal(uuid) from public, anon, authenticated;
revoke all on function public.event_quiz_host_tiebreak(uuid, text, uuid[], integer, integer) from public, anon, authenticated;
revoke all on function public.event_quiz_host_finish(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.event_quiz_host_close(uuid) from public, anon, authenticated;
revoke all on function public.event_quiz_host_kick(uuid, boolean) from public, anon, authenticated;
revoke all on function public.event_quiz_host_state(uuid) from public, anon, authenticated;
revoke all on function public.event_quiz_host_bank(integer) from public, anon, authenticated;
revoke all on function public.event_quiz_host_verify(text, boolean) from public, anon, authenticated;
revoke all on function public.event_quiz_hosts_list() from public, anon, authenticated;
revoke all on function public.event_quiz_hosts_set(text, boolean) from public, anon, authenticated;

grant execute on function public.event_quiz_join(text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.event_quiz_state(text) to anon, authenticated;
grant execute on function public.event_quiz_answer(text, uuid, integer) to anon, authenticated;
grant execute on function public.event_quiz_is_host() to authenticated;
grant execute on function public.event_quiz_host_create(integer, text, boolean, integer) to authenticated;
grant execute on function public.event_quiz_host_set_plan(uuid, text[]) to authenticated;
grant execute on function public.event_quiz_host_next(uuid, integer) to authenticated;
grant execute on function public.event_quiz_host_reveal(uuid) to authenticated;
grant execute on function public.event_quiz_host_tiebreak(uuid, text, uuid[], integer, integer) to authenticated;
grant execute on function public.event_quiz_host_finish(uuid, uuid[]) to authenticated;
grant execute on function public.event_quiz_host_close(uuid) to authenticated;
grant execute on function public.event_quiz_host_kick(uuid, boolean) to authenticated;
grant execute on function public.event_quiz_host_state(uuid) to authenticated;
grant execute on function public.event_quiz_host_bank(integer) to authenticated;
grant execute on function public.event_quiz_host_verify(text, boolean) to authenticated;
grant execute on function public.event_quiz_hosts_list() to authenticated;
grant execute on function public.event_quiz_hosts_set(text, boolean) to authenticated;
