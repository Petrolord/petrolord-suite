// First-run tour overlay: highlights one [data-tour] anchor at a time with
// a short card (Back, Next, Skip). Esc skips. Steps and the seen flag live
// in lib/firstRunTour.js.
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { TOUR_STEPS, markTourSeen, placeCard } from '../../lib/firstRunTour';

const rectOf = (anchor) => {
  const el = typeof document !== 'undefined' ? document.querySelector(`[data-tour="${anchor}"]`) : null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width || r.height ? {
    left: r.left, top: r.top, width: r.width, height: r.height,
  } : null;
};

export default function FirstRunTour({ open, onClose, steps = TOUR_STEPS }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [vp, setVp] = useState({ w: 1280, h: 800 });

  useEffect(() => { if (open) setI(0); }, [open]);

  const step = steps[i];
  useEffect(() => {
    if (!open || !step?.activate) return;
    document.querySelector(`[data-tour="${step.anchor}"]`)?.click();
  }, [open, step]);

  const measure = useCallback(() => {
    if (!step) return;
    setRect(rectOf(step.anchor));
    setVp({ w: window.innerWidth, h: window.innerHeight });
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    measure();
    // the dock animates open on the first visit: measure again once it settles
    const t = setTimeout(measure, 350);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  const finish = useCallback(() => {
    markTourSeen();
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish]);

  if (!open || !step) return null;
  const last = i === steps.length - 1;
  const pos = placeCard(rect, vp);

  return (
    <div className="fixed inset-0 z-[60]" data-testid="sl-tour" role="dialog" aria-label="Seismolord tour">
      {rect ? (
        <div
          className="absolute rounded-md ring-2 ring-cyan-400 pointer-events-none"
          style={{
            left: Math.max(2, rect.left - 4),
            top: Math.max(2, rect.top - 4),
            width: Math.min(vp.w - 4, rect.width + 8),
            height: Math.min(vp.h - 4, rect.height + 8),
            boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.6)',
          }}
        />
      ) : <div className="absolute inset-0 bg-slate-950/60" />}
      <div
        className="absolute w-80 rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl text-sm text-slate-300"
        style={{ left: pos.left, top: pos.top }}
      >
        <p className="text-[11px] text-slate-500">{`${i + 1} of ${steps.length}`}</p>
        <h3 className="font-semibold text-slate-100" data-testid="sl-tour-title">{step.title}</h3>
        <p className="mt-1">{step.body}</p>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={finish} className="text-xs text-slate-400 hover:text-slate-200" data-testid="sl-tour-skip">
            Skip tour
          </button>
          <div className="ml-auto flex gap-2">
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} className="px-2 py-1 rounded border border-slate-700 text-xs hover:bg-slate-800">
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? finish() : setI(i + 1))}
              className="px-2 py-1 rounded bg-cyan-600 text-white text-xs hover:bg-cyan-500"
              data-testid="sl-tour-next"
            >
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
