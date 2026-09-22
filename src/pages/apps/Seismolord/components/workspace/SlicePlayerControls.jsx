// Ribbon · Home · Player: step size, go to a line or time, step
// buttons, and play/pause at an adjustable speed (tester feedback
// 2026-09-22). Presentational; the state lives in useSlicePlayer and the
// index conversion in lib/sliceNav.

import React, { useEffect, useState } from 'react';
import {
  Play, Pause, ChevronLeft, ChevronRight, CornerDownLeft,
} from 'lucide-react';
import { PLAY_SPEEDS, surveyUnitLabel } from '../../lib/sliceNav';

const inputCls = `rounded-md bg-slate-950 border border-slate-700 text-slate-200
  px-1.5 py-1 text-xs disabled:opacity-40`;
const iconBtn = `p-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800
  disabled:opacity-40 disabled:cursor-not-allowed`;

/**
 * @param {Object} p
 * @param {boolean} p.disabled no volume open
 * @param {'inline'|'xline'|'time'} p.orientation
 * @param {?number} p.currentValue current position in survey units
 * @param {Object} p.player useSlicePlayer() result
 * @param {(delta: number) => void} p.onStep one step of the step size
 * @param {(value: string) => boolean} p.onGoTo returns false on a bad entry
 */
export default function SlicePlayerControls({
  disabled, orientation, currentValue, player, onStep, onGoTo,
}) {
  const unit = surveyUnitLabel(orientation);
  const [stepText, setStepText] = useState(String(player.step));
  const [goText, setGoText] = useState('');
  const [goError, setGoError] = useState(false);

  // the step box follows the orientation's saved value
  useEffect(() => { setStepText(String(player.step)); }, [player.step, orientation]);

  const commitStep = () => {
    player.setStep(stepText);
  };

  const goTo = () => {
    if (!goText.trim()) return;
    const ok = onGoTo(goText);
    setGoError(!ok);
    if (ok) setGoText('');
  };

  const stepWord = orientation === 'time' ? 'samples' : 'lines';

  return (
    <div className="flex items-end gap-1.5" data-testid="sl-player">
      <label
        className="flex flex-col gap-0.5 text-[10px] text-slate-500"
        title={`Step size: move every Nth ${orientation === 'time' ? 'sample' : 'line'} with the arrows, Shift+wheel, the step buttons and the player`}
      >
        {`Step (${stepWord})`}
        <input
          type="number"
          min="1"
          step="1"
          data-testid="sl-step"
          value={stepText}
          disabled={disabled}
          onChange={(e) => setStepText(e.target.value)}
          onBlur={commitStep}
          onKeyDown={(e) => { if (e.key === 'Enter') { commitStep(); e.currentTarget.blur(); } }}
          className={`${inputCls} w-14`}
        />
      </label>
      <label
        className="flex flex-col gap-0.5 text-[10px] text-slate-500"
        title={orientation === 'time'
          ? 'Type a time in ms and press Enter to jump to that time slice'
          : `Type an ${unit} number and press Enter to jump straight to it`}
      >
        {`Go to ${unit}`}
        <span className="flex items-center gap-0.5">
          <input
            type="text"
            inputMode="decimal"
            data-testid="sl-goto"
            value={goText}
            placeholder={currentValue != null ? String(currentValue) : ''}
            disabled={disabled}
            onChange={(e) => { setGoText(e.target.value); setGoError(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') goTo(); }}
            aria-invalid={goError}
            className={`${inputCls} w-16 ${goError ? 'border-red-500' : ''}`}
          />
          <button
            type="button"
            className={iconBtn}
            data-testid="sl-goto-btn"
            onClick={goTo}
            disabled={disabled || !goText.trim()}
            title="Jump to this position"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </span>
      </label>
      <div className="flex flex-col gap-0.5 text-[10px] text-slate-500">
        Player
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            className={iconBtn}
            data-testid="sl-step-prev"
            onClick={() => onStep(-1)}
            disabled={disabled}
            title="Step back one increment (Left or Down arrow in the Section and 3D windows)"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className={`${iconBtn} ${player.playing ? 'border-cyan-500 text-cyan-300' : ''}`}
            data-testid="sl-play"
            onClick={player.toggle}
            disabled={disabled}
            aria-pressed={player.playing}
            title={player.playing ? 'Pause' : 'Play through the slices at the chosen speed'}
          >
            {player.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            className={iconBtn}
            data-testid="sl-step-next"
            onClick={() => onStep(1)}
            disabled={disabled}
            title="Step forward one increment (Right or Up arrow in the Section and 3D windows)"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <select
            className={inputCls}
            data-testid="sl-speed"
            value={String(player.speed)}
            onChange={(e) => player.setSpeed(e.target.value)}
            disabled={disabled}
            title="Player speed in slices per second (the player waits for each slice to load)"
          >
            {PLAY_SPEEDS.map((s) => <option key={s} value={String(s)}>{`${s}/s`}</option>)}
          </select>
        </span>
      </div>
    </div>
  );
}
