// Slice player (tester feedback 2026-09-22): step size per orientation,
// play/pause at an adjustable speed. The loop is a setTimeout chain that
// only schedules the next step once the CURRENT slice is on screen
// (displayedIndex === index and nothing loading), so a slow brick fetch
// slows the player down instead of queueing a backlog of requests. It
// stops at either end of the survey, on a load error, and whenever the
// user moves the slice themselves (callers route user moves through
// pause()).
//
// Settings persist in localStorage under PLAYER_KEY, which is one of the
// session snapshot keys (lib/sessionSnapshot LOCAL_KEYS), so named
// sessions carry them too.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PLAYER, nextPlayIndex, normalizeStep, sanitizePlayer, PLAY_SPEEDS,
} from '../lib/sliceNav';

export const PLAYER_KEY = 'seismolord.player.v1';

const readPlayer = () => {
  try {
    return sanitizePlayer(JSON.parse(localStorage.getItem(PLAYER_KEY) || 'null'));
  } catch {
    return sanitizePlayer(null);
  }
};

/**
 * @param {Object} p
 * @param {'inline'|'xline'|'time'} p.orientation current Section orientation
 * @param {number} p.index requested index of that orientation
 * @param {number} p.maxIndex
 * @param {?number} p.displayedIndex index of the slice actually on screen
 *   (null while none of this orientation is displayed)
 * @param {boolean} p.loading a slice load is in flight
 * @param {?string} p.error last slice load error (stops the player)
 * @param {(orientation: string, index: number) => void} p.setIndex
 * @param {*} [p.resetKey] changes (volume switch) stop the player
 * @param {number} [p.epoch] bump to re-read persisted settings (session restore)
 */
export default function useSlicePlayer({
  orientation, index, maxIndex, displayedIndex, loading, error, setIndex,
  resetKey = null, epoch = 0,
}) {
  const [settings, setSettings] = useState(readPlayer);
  const [playing, setPlaying] = useState(false);
  const directionRef = useRef(1);
  const firstEpochRef = useRef(true);

  useEffect(() => {
    if (firstEpochRef.current) { firstEpochRef.current = false; return; }
    setSettings(readPlayer());
  }, [epoch]);

  useEffect(() => {
    try { localStorage.setItem(PLAYER_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  }, [settings]);

  const step = settings.step[orientation] || 1;

  const setStep = useCallback((value, o = orientation) => {
    setSettings((s) => ({
      ...s,
      step: { ...s.step, [o]: normalizeStep(value, maxIndex || Infinity) },
    }));
  }, [orientation, maxIndex]);

  const setSpeed = useCallback((value) => {
    const v = Number(value);
    setSettings((s) => (PLAY_SPEEDS.includes(v) ? { ...s, speed: v } : s));
  }, []);

  const pause = useCallback(() => setPlaying(false), []);

  const play = useCallback((direction = 1) => {
    directionRef.current = direction < 0 ? -1 : 1;
    // at the end already: start over from the other end
    if (nextPlayIndex(index, directionRef.current, step, maxIndex) === null) {
      setIndex(orientation, directionRef.current > 0 ? 0 : maxIndex);
    }
    setPlaying(true);
  }, [index, step, maxIndex, orientation, setIndex]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play(directionRef.current);
  }, [playing, pause, play]);

  // stop on a volume switch, an orientation change, or a load error
  useEffect(() => { setPlaying(false); }, [resetKey, orientation]);
  useEffect(() => { if (error) setPlaying(false); }, [error]);

  // the loop: wait for the current slice, then one step after the delay
  useEffect(() => {
    if (!playing) return undefined;
    if (loading || displayedIndex !== index) return undefined;
    const next = nextPlayIndex(index, directionRef.current, step, maxIndex);
    if (next === null) {
      setPlaying(false);
      return undefined;
    }
    const delay = Math.round(1000 / (settings.speed || DEFAULT_PLAYER.speed));
    const t = setTimeout(() => setIndex(orientation, next), delay);
    return () => clearTimeout(t);
  }, [playing, loading, displayedIndex, index, step, maxIndex, orientation,
    settings.speed, setIndex]);

  return {
    playing,
    play,
    pause,
    toggle,
    step,
    steps: settings.step,
    setStep,
    speed: settings.speed,
    setSpeed,
  };
}
