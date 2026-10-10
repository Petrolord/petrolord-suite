// The booth quiz's calls to Supabase. Every read and write goes through the
// event_quiz_* SECURITY DEFINER functions (migration 20261011090000); the
// tables themselves grant nothing to the browser. A realtime broadcast on one
// channel tells phones and the TV to fetch again the moment the host acts;
// they also poll, so a dropped socket on expo Wi-Fi only costs a second or two.
import { supabase } from '@/lib/customSupabaseClient';

export const QUIZ_CHANNEL = 'event-quiz';

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
};

export const quizApi = {
  state: (token) => rpc('event_quiz_state', { p_token: token || null }),
  join: ({ nickname, phone, consentText, userAgent }) => rpc('event_quiz_join', {
    p_nickname: nickname, p_phone: phone, p_consent: true, p_consent_text: consentText, p_user_agent: userAgent || null,
  }),
  answer: (token, questionId, choice) => rpc('event_quiz_answer', { p_token: token, p_game_question_id: questionId, p_choice: choice }),
};

export const hostApi = {
  isHost: () => rpc('event_quiz_is_host', {}),
  state: (gameId) => rpc('event_quiz_host_state', { p_game: gameId || null }),
  bank: (dayNo) => rpc('event_quiz_host_bank', { p_day_no: dayNo }),
  create: ({ dayNo, title, practice, seconds }) => rpc('event_quiz_host_create', {
    p_day_no: dayNo, p_title: title, p_practice: !!practice, p_seconds: seconds,
  }),
  setPlan: (gameId, ids) => rpc('event_quiz_host_set_plan', { p_game: gameId, p_question_ids: ids }),
  next: (gameId, leadSeconds = 3) => rpc('event_quiz_host_next', { p_game: gameId, p_lead_seconds: leadSeconds }),
  reveal: (gameId) => rpc('event_quiz_host_reveal', { p_game: gameId }),
  tiebreak: (gameId, questionId, eligible, tieGroup, leadSeconds = 3) => rpc('event_quiz_host_tiebreak', {
    p_game: gameId, p_question_id: questionId, p_eligible: eligible, p_tie_group: tieGroup, p_lead_seconds: leadSeconds,
  }),
  finish: (gameId, winnerIds) => rpc('event_quiz_host_finish', { p_game: gameId, p_winner_ids: winnerIds }),
  close: (gameId) => rpc('event_quiz_host_close', { p_game: gameId }),
  kick: (playerId, kicked = true) => rpc('event_quiz_host_kick', { p_player: playerId, p_kicked: kicked }),
  verify: (code, mark = false) => rpc('event_quiz_host_verify', { p_code: code, p_mark: mark }),
  hosts: () => rpc('event_quiz_hosts_list', {}),
  setHost: (email, host) => rpc('event_quiz_hosts_set', { p_email: email, p_host: host }),
};

/** Call `onChange` whenever the host broadcasts a change. Returns an unsubscribe. */
export function subscribeQuiz(onChange) {
  let ch = null;
  try {
    ch = supabase.channel(QUIZ_CHANNEL).on('broadcast', { event: 'changed' }, () => onChange()).subscribe();
  } catch { /* realtime unavailable: polling carries on */ }
  return () => { try { if (ch) supabase.removeChannel(ch); } catch { /* ignore */ } };
}

/** The host's side of the channel: nudge() after every action. */
export function quizNudger() {
  let ch = null;
  try { ch = supabase.channel(QUIZ_CHANNEL).subscribe(); } catch { /* polling carries on */ }
  return {
    nudge: () => { try { ch?.send({ type: 'broadcast', event: 'changed', payload: { at: Date.now() } }); } catch { /* ignore */ } },
    close: () => { try { if (ch) supabase.removeChannel(ch); } catch { /* ignore */ } },
  };
}
