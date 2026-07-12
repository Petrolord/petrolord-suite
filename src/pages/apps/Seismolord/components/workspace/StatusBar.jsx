// Workspace status bar: cursor readout (written imperatively — pointer
// moves never re-render React), active volume/line, slice timing,
// tracking progress, errors and the backend connectivity dot (which
// replaces the old full-width "Backend connectivity" card).

import React, { useEffect, useRef } from 'react';
import { Loader2, XCircle } from 'lucide-react';

const BACKEND_DOT = {
  ok: 'bg-emerald-400',
  error: 'bg-red-500',
  checking: 'bg-amber-400 animate-pulse',
};

/**
 * @param {Object} p
 * @param {?string} p.volumeName active volume (null = none selected)
 * @param {string} p.lineLabel current line, e.g. "IL 2410" / "1240 ms"
 * @param {?number} p.sliceMs last slice assembly time
 * @param {?{tracked: number, total: number}} p.tracking 3D track progress
 * @param {?string} p.error current viewer error, if any
 * @param {{state: string, detail: ?string, check: () => void}} p.backend
 * @param {(sink: ?(info: ?Object) => void) => void} [p.registerCursorSink]
 *   receives a callback that writes {il, xl, ms, z, amp} readouts straight
 *   into the DOM (Phase 6 wiring; optional until then)
 */
export default function StatusBar({
  volumeName, lineLabel, sliceMs, tracking, error, backend, registerCursorSink,
}) {
  const cursorRef = useRef(null);

  useEffect(() => {
    if (!registerCursorSink) return undefined;
    const sink = (info) => {
      const el = cursorRef.current;
      if (!el) return;
      if (!info) { el.textContent = ''; return; }
      const parts = [];
      if (info.il != null) parts.push(`IL ${info.il}`);
      if (info.xl != null) parts.push(`XL ${info.xl}`);
      if (info.ms != null) parts.push(`${info.ms.toFixed(1)} ms`);
      if (info.z != null) parts.push(`${info.z.toFixed(1)} m TVDSS`);
      if (info.amp != null) parts.push(`amp ${info.amp.toPrecision(3)}`);
      el.textContent = parts.join('  ·  ');
    };
    registerCursorSink(sink);
    return () => registerCursorSink(null);
  }, [registerCursorSink]);

  return (
    <div
      className="h-7 shrink-0 flex items-center gap-4 px-3 border-t border-slate-800
        bg-slate-900/80 text-[11px] text-slate-400 whitespace-nowrap overflow-hidden"
    >
      <span
        ref={cursorRef}
        className="tabular-nums text-slate-300 min-w-[260px]"
        data-testid="status-cursor"
      />

      {tracking && (
        <span className="flex items-center gap-1.5 text-cyan-300">
          <Loader2 className="w-3 h-3 animate-spin" />
          Tracking {tracking.tracked.toLocaleString()} / {tracking.total.toLocaleString()}
        </span>
      )}

      {error && (
        <span className="flex items-center gap-1 text-red-400 truncate max-w-[40%]" title={error}>
          <XCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{error}</span>
        </span>
      )}

      <span className="ml-auto flex items-center gap-4">
        {volumeName && (
          <span className="truncate max-w-[240px]" title={volumeName}>{volumeName}</span>
        )}
        {lineLabel && <span className="tabular-nums">{lineLabel}</span>}
        {sliceMs != null && (
          <span
            className="tabular-nums"
            title="Slice assembly time — amplitudes render from stored float32;
              colormap, gain, polarity and balance are shader-only"
          >
            slice {sliceMs.toFixed(0)} ms
          </span>
        )}
        <button
          type="button"
          className="flex items-center gap-1.5 hover:text-slate-200"
          onClick={backend.check}
          title={backend.state === 'checking' ? 'Checking seismolord-engine…'
            : `seismolord-engine: ${backend.detail || backend.state} — click to re-check`}
        >
          <span className={`w-2 h-2 rounded-full ${BACKEND_DOT[backend.state] || BACKEND_DOT.error}`} />
          engine
        </button>
      </span>
    </div>
  );
}
