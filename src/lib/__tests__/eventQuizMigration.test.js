/**
 * @jest-environment node
 */
// The booth quiz migration: tables locked away behind SECURITY DEFINER
// functions, players on tokens, hosts checked on every call, server-side
// timing, and the scoring rule identical to src/lib/eventQuiz.js. The SQL was
// also run end to end on a scratch Postgres 16 (join, answer, reveal,
// tie-breaker, finish, verify, close); these checks keep those properties
// from drifting.
import fs from 'fs';
import path from 'path';
import { SCORE, scoreAnswer } from '@/lib/eventQuiz';

const sql = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20261011090000_event_quiz.sql'), 'utf8');
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const TABLES = ['questions', 'games', 'game_questions', 'players', 'answers', 'winners', 'hosts'].map((t) => `event_quiz_${t}`);
const fnBody = (name) => {
  const start = code.indexOf(`function public.${name}(`);
  if (start < 0) throw new Error(`no function ${name}`);
  return code.slice(start, code.indexOf('$$;', code.indexOf('$$', start) + 2) + 3);
};

test('every quiz table has RLS on and no grants: the browser reaches them only through functions', () => {
  for (const t of TABLES) {
    expect(code).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
    expect(code).toMatch(new RegExp(`revoke all on [^;]*public\\.${t}[,\\s][^;]*from anon, authenticated`));
    expect(code).not.toMatch(new RegExp(`grant [^;]* on (table )?public\\.${t}\\b`));
  }
  expect(code).not.toMatch(/create policy/);
});

test('players, the TV and hosts get exactly their functions', () => {
  for (const f of ['event_quiz_join(text, text, boolean, text, text)', 'event_quiz_state(text)', 'event_quiz_answer(text, uuid, integer)']) {
    expect(code).toContain(`grant execute on function public.${f} to anon, authenticated;`);
  }
  const anonGrants = code.match(/grant execute on function [^;]* to anon/g) || [];
  expect(anonGrants).toHaveLength(3); // negative control: nothing else is open to anon
  // helpers are never callable from the browser
  for (const f of ['event_quiz_totals(uuid)', 'event_quiz_open_game()', 'event_quiz_new_code()', 'event_quiz_token_hash(text)']) {
    expect(code).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
    expect(code).not.toMatch(new RegExp(`grant execute on function public\\.${f.replace(/[()]/g, '\\$&')}`));
  }
});

test('every host function checks the host before doing anything', () => {
  const hostFns = [...code.matchAll(/create or replace function public\.(event_quiz_host_\w+)\(/g)].map((m) => m[1]);
  expect(hostFns.length).toBeGreaterThanOrEqual(10);
  for (const f of hostFns) {
    const body = fnBody(f);
    expect(body).toMatch(/security definer/);
    expect(body.indexOf('perform public.event_quiz_require_host();')).toBeGreaterThan(-1);
  }
  expect(fnBody('event_quiz_is_host')).toMatch(/public\.is_super_admin\(\) or exists \(select 1 from public\.event_quiz_hosts/);
  expect(fnBody('event_quiz_hosts_set')).toMatch(/if not public\.is_super_admin\(\)/);
});

test('answers are timed by the database and accepted once, inside the window', () => {
  const body = fnBody('event_quiz_answer');
  expect(body).toMatch(/t timestamptz := clock_timestamp\(\)/);
  expect(body).not.toMatch(/p_client|client_time|p_elapsed/); // no client clock parameter
  expect(body).toMatch(/if t < gq\.starts_at then/);
  expect(body).toMatch(/t > gq\.ends_at \+ interval '1 second'/);
  expect(body).toMatch(/gq\.eligible is not null and not \(me\.id = any \(gq\.eligible\)\)/);
  expect(code).toMatch(/primary key \(game_question_id, player_id\)/);
});

test('the answer key stays hidden until the question is revealed', () => {
  const body = fnBody('event_quiz_state');
  const keyAt = body.indexOf("'answer_index', q.answer_index");
  const guard = body.lastIndexOf('if gq.revealed_at is not null then', keyAt);
  expect(keyAt).toBeGreaterThan(-1);
  expect(guard).toBeGreaterThan(-1);
  expect(body.slice(guard, keyAt)).not.toMatch(/end if;/);
  // the leaderboard counts revealed questions only
  expect(fnBody('event_quiz_totals')).toMatch(/gq\.revealed_at is not null and gq\.kind = 'main'/);
});

test('player tokens are stored only as a SHA-256 hash', () => {
  expect(fnBody('event_quiz_token_hash')).toMatch(/sha256\(convert_to/);
  expect(fnBody('event_quiz_join')).toMatch(/token_hash, lead_id[\s\S]*public\.event_quiz_token_hash\(tok\)/);
  expect(code).not.toMatch(/\n\s+token text/); // no plain-token column
});

test('the SQL scoring rule is the JavaScript one', () => {
  const body = fnBody('event_quiz_points');
  const m = body.match(/else (\d+) \+ round\((\d+) \* \(1 - least\(1, greatest\(0, p_elapsed_ms::numeric \/ greatest\(p_duration_ms, 1\)\)\)\)\)/);
  expect(m).not.toBeNull();
  expect(Number(m[1])).toBe(SCORE.base);
  expect(Number(m[2])).toBe(SCORE.speed);
  expect(body).toMatch(/case when not p_correct then 0/);
  expect(scoreAnswer(true, 5000, 20000)).toBe(Number(m[1]) + Math.round(Number(m[2]) * 0.75));
});

test('players become leads with source quiz, and no shared table is touched', () => {
  expect(code).toMatch(/alter table public\.event_leads drop constraint if exists event_leads_source;/);
  expect(code).toMatch(/check \(source in \('qr', 'tablet', 'quiz'\)\)/);
  expect(fnBody('event_quiz_join')).toMatch(/insert into public\.event_leads[\s\S]*'quiz'/);
  expect(code).not.toMatch(/alter table public\.(organizations|users|organization_members|invitations|profiles)\b/);
  expect(code).not.toMatch(/^\s*(begin|commit);/m);
});

test('one open game at a time, and the migration can be run twice', () => {
  expect(code).toMatch(/create unique index if not exists event_quiz_games_one_open on public\.event_quiz_games \(\(true\)\) where status <> 'closed'/);
  expect(code).not.toMatch(/create table public\./); // always "if not exists"
  expect(code).not.toMatch(/create function /); // always "or replace"
});
