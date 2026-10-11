// The NAPE booth quiz (Petrolord Upstream Challenge): the phone and the TV,
// with the event_quiz_* database functions mocked at the network so the run
// needs no game in the shared database. The functions themselves are covered
// by src/lib/__tests__/eventQuizMigration.test.js.
import { test, expect } from '@playwright/test';

const GAME = { id: 'g1', title: 'Petrolord Upstream Challenge', day_no: 1, practice: false, question_seconds: 20 };

function question({ revealed = false } = {}) {
  const now = Date.now();
  return {
    id: 'gq1', seq: 1, kind: 'main', number: 1, of: 12, module: 'Geoscience', difficulty: 2,
    prompt: 'In the Niger Delta, which formation holds most of the oil and gas reservoirs?',
    options: ['Benin Formation', 'Agbada Formation', 'Akata Formation', 'Bima Formation'],
    starts_at: new Date(now - 1000).toISOString(), ends_at: new Date(now + 19000).toISOString(),
    revealed, answered: 3, eligible_names: null,
    ...(revealed ? { answer_index: 1, explanation: 'The paralic Agbada sands are the main reservoirs.', counts: [0, 3, 1, 0] } : {}),
  };
}

// a tiny stand-in for the database: tests move `world.phase` along
function mockQuiz(page, world) {
  const calls = { join: [], answer: [] };
  page.route('**/rest/v1/rpc/event_quiz_state', async (route) => {
    const body = route.request().postDataJSON() || {};
    const joined = body.p_token === 'tok-ada';
    const base = { server_now: new Date().toISOString(), leaderboard: [{ nickname: 'Ada', points: world.points, correct: 1 }, { nickname: 'Bola', points: 0, correct: 0 }], winners: [] };
    let state;
    if (world.phase === 'none') state = { ...base, game: null };
    else {
      const status = world.phase === 'finished' ? 'finished' : world.phase === 'lobby' ? 'lobby' : 'live';
      const q = world.phase === 'open' ? question() : world.phase === 'revealed' ? question({ revealed: true }) : null;
      state = {
        ...base,
        game: { ...GAME, status, players: 2 },
        question: q,
        winners: status === 'finished' ? [{ place: 1, nickname: 'Ada' }, { place: 2, nickname: 'Bola' }] : [],
        token_valid: body.p_token ? joined : null,
        me: joined ? {
          player_id: 'p1', nickname: 'Ada', kicked: false, points: world.points, rank: 1, players: 2,
          can_answer: world.phase === 'open' && world.choice == null,
          choice: world.choice ?? null,
          result: world.phase === 'revealed' && world.choice != null ? { correct: world.choice === 1, points: world.choice === 1 ? 950 : 0 } : null,
          winner: status === 'finished' ? { place: 1, code: 'K7P2QX', verified: false } : null,
        } : null,
      };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state) });
  });
  page.route('**/rest/v1/rpc/event_quiz_join', async (route) => {
    calls.join.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, player_id: 'p1', game_id: 'g1', nickname: 'Ada', token: 'tok-ada', rejoined: false }) });
  });
  page.route('**/rest/v1/rpc/event_quiz_answer', async (route) => {
    const b = route.request().postDataJSON();
    calls.answer.push(b);
    world.choice = b.p_choice;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accepted: true, choice: b.p_choice }) });
  });
  return calls;
}

test.describe('NAPE quiz', () => {
  test('a phone joins, answers, sees the result and its prize code', async ({ page }) => {
    const world = { phase: 'none', points: 0, choice: null };
    const calls = mockQuiz(page, world);

    await page.goto('/nape/quiz');
    await expect(page.getByRole('heading', { name: 'Petrolord Upstream Challenge' })).toBeVisible();
    await expect(page.getByTestId('quiz-closed')).toBeVisible();
    await expect(page.getByTestId('quiz-schedule')).toContainText('Day 3: Reservoir Modelling and Field Development');

    world.phase = 'lobby';
    await expect(page.getByTestId('quiz-join-form')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('quiz-join').click();
    await expect(page.getByText('Please tick the box to play.')).toBeVisible();
    expect(calls.join).toHaveLength(0);
    await page.fill('#quiz-nickname', 'Ada');
    await page.fill('#quiz-phone', '0803 123 4567');
    await page.getByTestId('quiz-consent').check();
    await page.getByTestId('quiz-join').click();
    await expect(page.getByTestId('quiz-lobby')).toContainText('You are in, Ada.');
    expect(calls.join[0]).toMatchObject({ p_nickname: 'Ada', p_phone: '2348031234567', p_consent: true });
    expect(calls.join[0].p_consent_text).toMatch(/Petrolord and Lordsway Energy may contact me/);

    world.phase = 'open';
    await expect(page.getByTestId('quiz-question')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Question 1 of 12')).toBeVisible();
    await page.getByTestId('quiz-option-1').click();
    await expect(page.getByTestId('quiz-locked')).toContainText('Answer locked in: B');
    expect(calls.answer[0]).toMatchObject({ p_token: 'tok-ada', p_game_question_id: 'gq1', p_choice: 1 });

    world.phase = 'revealed';
    world.points = 950;
    await expect(page.getByTestId('quiz-result')).toContainText('Correct. +950 points', { timeout: 10000 });
    await expect(page.getByTestId('quiz-me')).toContainText('950 points');

    // a reload keeps the player (token in local storage)
    await page.reload();
    await expect(page.getByTestId('quiz-result')).toContainText('Correct', { timeout: 10000 });

    world.phase = 'finished';
    await expect(page.getByTestId('quiz-winner')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('quiz-winner-code')).toHaveText('K7P2QX');
    await expect(page.getByTestId('quiz-winner')).toContainText('Winner, Day 1: Exploration (1st place)');
    await expect(page.getByTestId('quiz-winner')).toContainText('Two months of one Petrolord app');
  });

  test('the TV follows the game from the video loop to the podium', async ({ page }) => {
    const world = { phase: 'none', points: 950, choice: null };
    mockQuiz(page, world);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/nape/quiz/tv');
    await expect(page.getByTestId('quiz-tv-videos')).toBeVisible();
    await expect(page.getByTestId('quiz-tv-choose')).toBeVisible();

    world.phase = 'lobby';
    await expect(page.getByTestId('quiz-tv-lobby')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('quiz-tv-players')).toHaveText('2 players');
    await expect(page.getByAltText('Join the challenge')).toBeVisible();

    world.phase = 'open';
    await expect(page.getByTestId('quiz-tv-question')).toContainText('which formation holds most', { timeout: 10000 });
    await expect(page.getByTestId('quiz-tv-option-1')).toContainText('Agbada Formation');

    world.phase = 'revealed';
    await expect(page.getByTestId('quiz-leaderboard')).toContainText('Ada', { timeout: 10000 });
    await expect(page.getByTestId('quiz-tv-option-1')).toContainText('75%');

    world.phase = 'finished';
    await expect(page.getByTestId('quiz-podium')).toContainText('Winner, Day 1: Exploration (1st place)', { timeout: 10000 });
    await expect(page.getByTestId('quiz-podium')).toContainText('sponsored NextGen Petrophysics course');
  });

  test('the host page is for signed-in quiz hosts only', async ({ page }) => {
    await page.goto('/nape/quiz/host');
    await expect(page).toHaveURL(/\/login|\/auth|\/signin/i, { timeout: 15000 });
  });
});
