// Start here dock panel (discoverability programme, 2026-09-23): draws
// lib/startHere.js for the open volume. Each step with an action key gets
// a button; ViewerPanel supplies the callbacks in `actions`.
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  CheckCircle2, Circle, Lock, PlayCircle, HelpCircle,
} from 'lucide-react';

const STATUS_ICON = {
  done: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-label="done" />,
  todo: <Circle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-label="to do" />,
  blocked: <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-label="not available yet" />,
};

/**
 * @param {Object} p
 * @param {ReturnType<import('../../lib/startHere').buildStartHere>} p.model
 * @param {Object<string, Function>} p.actions action key -> callback
 * @param {string} [p.volumeName]
 * @param {Function} [p.onTour] restart the first-run tour
 * @param {string} [p.helpHref]
 */
export default function StartHerePanel({
  model, actions = {}, volumeName = null, onTour, helpHref,
}) {
  const { made, inventory, steps } = model;
  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 space-y-4 text-xs text-slate-300" data-testid="sl-start-here">
      {volumeName ? (
        <section>
          <h3 className="text-sm font-semibold text-slate-100 truncate" title={volumeName}>{volumeName}</h3>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">Made by the upload</p>
          <ul className="mt-1 space-y-1">
            {made.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-slate-300">Open or import a volume to begin.</p>
      )}

      {inventory.length > 0 && (
        <section>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">In this volume</p>
          <table className="mt-1 w-full" data-testid="sl-start-inventory">
            <tbody>
              {inventory.map((r) => (
                <tr key={r.key} className="align-top">
                  <td className="pr-2 py-0.5 text-slate-400 whitespace-nowrap">{r.label}</td>
                  <td className="py-0.5 break-words">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Next steps</p>
        <ol className="mt-1 space-y-2">
          {steps.map((s) => {
            const act = s.action && actions[s.action];
            return (
              <li key={s.key} className="flex gap-2" data-testid={`sl-start-step-${s.key}`} data-status={s.status}>
                {STATUS_ICON[s.status]}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <span className={`font-medium ${s.status === 'blocked' ? 'text-slate-500' : 'text-slate-100'}`}>{s.title}</span>
                    {act && s.status !== 'blocked' && (
                      <button
                        type="button"
                        onClick={act}
                        className="ml-auto shrink-0 px-2 py-0.5 rounded border border-cyan-700 text-cyan-300 hover:bg-cyan-500/10"
                        data-testid={`sl-start-go-${s.key}`}
                      >
                        {s.status === 'done' ? 'Again' : 'Go'}
                      </button>
                    )}
                  </div>
                  <p className="text-slate-400">{s.detail}</p>
                  {s.why && <p className="text-amber-300/90">{s.why}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="flex flex-wrap gap-2 pt-1 border-t border-slate-800">
        {onTour && (
          <button
            type="button"
            onClick={onTour}
            className="flex items-center gap-1 px-2 py-1 rounded text-slate-300 hover:text-slate-100 hover:bg-slate-800"
            data-testid="sl-start-tour"
          >
            <PlayCircle className="w-4 h-4" /> Take the tour
          </button>
        )}
        {helpHref && (
          <RouterLink
            to={helpHref}
            className="flex items-center gap-1 px-2 py-1 rounded text-slate-300 hover:text-slate-100 hover:bg-slate-800"
          >
            <HelpCircle className="w-4 h-4" /> Help guide
          </RouterLink>
        )}
      </section>
    </div>
  );
}
