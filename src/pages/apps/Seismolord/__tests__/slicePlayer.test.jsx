/**
 * Slice navigation + player (tester feedback 2026-09-22): step size,
 * go-to in survey units, the play loop that waits for each slice, stops
 * at the ends and on errors, and the ribbon controls.
 */
import React from 'react';
import {
  render, screen, fireEvent, renderHook, act,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  surveyValueToIndex, indexToSurveyValue, stepIndex, nextPlayIndex,
  normalizeStep, sanitizePlayer, maxIndexFor, DEFAULT_PLAYER,
} from '@/pages/apps/Seismolord/lib/sliceNav';
import useSlicePlayer, { PLAYER_KEY } from '@/pages/apps/Seismolord/hooks/useSlicePlayer';
import SlicePlayerControls from '@/pages/apps/Seismolord/components/workspace/SlicePlayerControls';
import { LOCAL_KEYS } from '@/pages/apps/Seismolord/lib/sessionSnapshot';

// IL 1000..1398 step 2 (200 lines), XL 5..104 step 1, 751 samples @ 4 ms
const GEO = {
  il: { min: 1000, step: 2, count: 200 },
  xl: { min: 5, step: 1, count: 100 },
  ns: 751,
  dt_us: 4000,
};

describe('sliceNav', () => {
  test('survey values convert to indices in each orientation', () => {
    expect(surveyValueToIndex(GEO, 'inline', 1000)).toBe(0);
    expect(surveyValueToIndex(GEO, 'inline', '1100')).toBe(50);
    expect(surveyValueToIndex(GEO, 'inline', 1101)).toBe(51);      // rounds to nearest line
    expect(surveyValueToIndex(GEO, 'xline', 55)).toBe(50);
    expect(surveyValueToIndex(GEO, 'time', 1200)).toBe(300);       // ms -> sample
    expect(surveyValueToIndex(GEO, 'time', '1202')).toBe(301);     // 300.5 rounds up
  });

  test('go-to entries clamp to the survey and reject non-numbers', () => {
    expect(surveyValueToIndex(GEO, 'inline', 5000)).toBe(199);
    expect(surveyValueToIndex(GEO, 'inline', 10)).toBe(0);
    expect(surveyValueToIndex(GEO, 'time', 99999)).toBe(750);
    expect(surveyValueToIndex(GEO, 'inline', 'abc')).toBeNull();
    expect(surveyValueToIndex(GEO, 'inline', '')).toBeNull();
    expect(surveyValueToIndex(GEO, 'inline', '   ')).toBeNull();
  });

  test('indices convert back to survey values', () => {
    expect(indexToSurveyValue(GEO, 'inline', 50)).toBe(1100);
    expect(indexToSurveyValue(GEO, 'xline', 50)).toBe(55);
    expect(indexToSurveyValue(GEO, 'time', 300)).toBe(1200);
    expect(maxIndexFor(GEO, 'time')).toBe(750);
  });

  test('stepping moves by the step size and clamps at both ends', () => {
    expect(stepIndex(10, 1, 5, 199)).toBe(15);
    expect(stepIndex(10, -1, 5, 199)).toBe(5);
    expect(stepIndex(3, -1, 5, 199)).toBe(0);
    expect(stepIndex(197, 1, 5, 199)).toBe(199);
    expect(stepIndex(10, 1, 0, 199)).toBe(11);          // bad step -> 1
    expect(normalizeStep('7.4')).toBe(7);
    expect(normalizeStep(-3)).toBe(1);
    expect(normalizeStep(500, 199)).toBe(199);
  });

  test('the player lands on the last line once, then reports the end', () => {
    expect(nextPlayIndex(195, 1, 10, 199)).toBe(199);
    expect(nextPlayIndex(199, 1, 10, 199)).toBeNull();
    expect(nextPlayIndex(0, -1, 10, 199)).toBeNull();
  });

  test('persisted settings are sanitized', () => {
    expect(sanitizePlayer(null)).toEqual(DEFAULT_PLAYER);
    expect(sanitizePlayer({ step: { inline: 4, time: 'x' }, speed: 3 }))
      .toEqual({ step: { inline: 4, xline: 1, time: 1 }, speed: DEFAULT_PLAYER.speed });
  });

  test('named sessions carry the player settings', () => {
    expect(LOCAL_KEYS).toContain(PLAYER_KEY);
  });
});

describe('useSlicePlayer', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  // a tiny host: the index moves only through setIndex, and the
  // "displayed" slice follows after a simulated load
  const setup = (init = {}) => {
    const calls = [];
    const props = {
      orientation: 'inline',
      index: 0,
      maxIndex: 20,
      displayedIndex: 0,
      loading: false,
      error: null,
      setIndex: (o, i) => calls.push([o, i]),
      ...init,
    };
    const hook = renderHook((p) => useSlicePlayer(p), { initialProps: props });
    return { hook, calls, props };
  };

  test('play steps by the step size, one slice after each load lands', () => {
    const { hook, calls, props } = setup();
    act(() => hook.result.current.setStep(5));
    act(() => hook.result.current.play());
    expect(hook.result.current.playing).toBe(true);
    act(() => { jest.advanceTimersByTime(600); });      // 2/s default -> 500 ms
    expect(calls).toEqual([['inline', 5]]);
    // requested 5 but still loading: no further step however long we wait
    hook.rerender({ ...props, index: 5, displayedIndex: 0, loading: true });
    act(() => { jest.advanceTimersByTime(5000); });
    expect(calls).toHaveLength(1);
    // the slice lands: the next step follows after the delay
    hook.rerender({ ...props, index: 5, displayedIndex: 5, loading: false });
    act(() => { jest.advanceTimersByTime(600); });
    expect(calls).toEqual([['inline', 5], ['inline', 10]]);
  });

  test('the player stops at the end of the survey', () => {
    const { hook, calls, props } = setup({ index: 18, displayedIndex: 18 });
    act(() => hook.result.current.setStep(5));
    act(() => hook.result.current.play());
    act(() => { jest.advanceTimersByTime(600); });
    expect(calls).toEqual([['inline', 20]]);
    hook.rerender({ ...props, index: 20, displayedIndex: 20 });
    act(() => { jest.advanceTimersByTime(600); });
    expect(hook.result.current.playing).toBe(false);
    expect(calls).toHaveLength(1);
  });

  test('pause stops the loop, and a load error stops it too', () => {
    const { hook, calls, props } = setup();
    act(() => hook.result.current.play());
    act(() => hook.result.current.pause());
    act(() => { jest.advanceTimersByTime(5000); });
    expect(calls).toHaveLength(0);
    act(() => hook.result.current.play());
    hook.rerender({ ...props, error: 'Brick fetch failed' });
    expect(hook.result.current.playing).toBe(false);
  });

  test('speed changes the delay between slices', () => {
    const { hook, calls } = setup();
    act(() => hook.result.current.setSpeed('8'));
    act(() => hook.result.current.play());
    act(() => { jest.advanceTimersByTime(130); });
    expect(calls).toEqual([['inline', 1]]);
  });

  test('step size is kept per orientation and persisted', () => {
    const { hook, props } = setup();
    act(() => hook.result.current.setStep(4));
    hook.rerender({ ...props, orientation: 'time' });
    expect(hook.result.current.step).toBe(1);
    hook.rerender({ ...props, orientation: 'inline' });
    expect(hook.result.current.step).toBe(4);
    expect(JSON.parse(localStorage.getItem(PLAYER_KEY)).step.inline).toBe(4);
  });

  test('an orientation change stops the player', () => {
    const { hook, props } = setup();
    act(() => hook.result.current.play());
    hook.rerender({ ...props, orientation: 'xline' });
    expect(hook.result.current.playing).toBe(false);
  });
});

describe('SlicePlayerControls', () => {
  const player = (over = {}) => ({
    playing: false,
    toggle: jest.fn(),
    step: 1,
    setStep: jest.fn(),
    speed: 2,
    setSpeed: jest.fn(),
    ...over,
  });

  test('typing a line number and pressing Enter jumps to it', () => {
    const onGoTo = jest.fn(() => true);
    render(
      <SlicePlayerControls
        orientation="inline" currentValue={1100} player={player()}
        onStep={jest.fn()} onGoTo={onGoTo}
      />,
    );
    expect(screen.getByText('Go to IL')).toBeInTheDocument();
    const box = screen.getByTestId('sl-goto');
    fireEvent.change(box, { target: { value: '1250' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onGoTo).toHaveBeenCalledWith('1250');
    expect(box).toHaveValue('');
  });

  test('a bad go-to entry is flagged and kept for correction', () => {
    const onGoTo = jest.fn(() => false);
    render(
      <SlicePlayerControls
        orientation="time" currentValue={1200} player={player()}
        onStep={jest.fn()} onGoTo={onGoTo}
      />,
    );
    expect(screen.getByText('Go to ms')).toBeInTheDocument();
    const box = screen.getByTestId('sl-goto');
    fireEvent.change(box, { target: { value: 'abc' } });
    fireEvent.click(screen.getByTestId('sl-goto-btn'));
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveValue('abc');
  });

  test('step size, step buttons, play and speed reach the player', () => {
    const p = player();
    const onStep = jest.fn();
    render(
      <SlicePlayerControls
        orientation="xline" currentValue={55} player={p}
        onStep={onStep} onGoTo={jest.fn()}
      />,
    );
    const step = screen.getByTestId('sl-step');
    fireEvent.change(step, { target: { value: '10' } });
    fireEvent.keyDown(step, { key: 'Enter' });
    expect(p.setStep).toHaveBeenCalledWith('10');
    fireEvent.click(screen.getByTestId('sl-step-next'));
    fireEvent.click(screen.getByTestId('sl-step-prev'));
    expect(onStep.mock.calls).toEqual([[1], [-1]]);
    fireEvent.click(screen.getByTestId('sl-play'));
    expect(p.toggle).toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('sl-speed'), { target: { value: '4' } });
    expect(p.setSpeed).toHaveBeenCalledWith('4');
  });
});
