import { useCallback, useEffect, useRef, useState } from 'react';
import { quizApi, subscribeQuiz } from '@/services/eventQuizApi';
import { clockOffset } from '@/lib/eventQuiz';

// The public quiz state for a phone (with its token) or the TV (without):
// polled every `intervalMs`, fetched again at once when the host broadcasts
// a change, and again the moment the current question opens or closes. Also
// tracks how far the server clock is from this device's, so countdowns agree
// with the server's buzzer.
export default function useQuizState({ token = null, intervalMs = 2000, enabled = true } = {}) {
  const [state, setState] = useState(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(null);
  const [online, setOnline] = useState(true);
  const busy = useRef(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const sent = Date.now();
    try {
      const s = await quizApi.state(tokenRef.current);
      const got = Date.now();
      setState(s);
      if (s?.server_now) setOffset(clockOffset(s.server_now, sent, got));
      setError(null);
      setOnline(true);
    } catch (e) {
      setError(e);
      setOnline(false);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const t = setInterval(refresh, intervalMs);
    const off = subscribeQuiz(refresh);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(t);
      off();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refresh);
    };
  }, [enabled, intervalMs, refresh, token]);

  // fetch again just as the question opens and just after the buzzer
  const q = state?.question;
  useEffect(() => {
    if (!q || q.revealed) return undefined;
    const now = Date.now() + offset;
    const timers = [Date.parse(q.starts_at), Date.parse(q.ends_at) + 300]
      .map((t) => t - now)
      .filter((ms) => ms > 0 && ms < 120000)
      .map((ms) => setTimeout(refresh, ms + 50));
    return () => timers.forEach(clearTimeout);
  }, [q?.id, q?.starts_at, q?.ends_at, q?.revealed, offset, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, offset, error, online, refresh, setState };
}

/** Re-render every `ms` while `active`, for countdowns. */
export function useTicker(active, ms = 200) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [active, ms]);
}
