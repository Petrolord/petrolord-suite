// "Re-run prospect" (Risked Reserves Valuation U2-006, 2026-10-02). Opened
// with ?rerunProspect=<rcp_prospects id>&returnTo=<valuation path>: the
// prospect's own source block names the project, the reservoir and the run
// behind its volumes, so this bar opens that project and reservoir, sets the
// recorded seed and realizations in the Probabilistic panel, fills in
// Prospect Risking, and links back to the valuation, which takes the re-run.
// A colleague's shared prospect opens read-only with the reason; anything
// that cannot be opened says why (services/prospectRerun.js).

import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RotateCcw, X } from 'lucide-react';
import { useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { rerunPlan, safeReturnPath, returnHref } from '../services/prospectRerun';

const btn = 'inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken';

export default function RerunProspectBar({ onOpenRisking }) {
  const { backend, state, loadProject, switchReservoir, setCalcMethod, setRerun } = useReservoirCalc();
  const [params, setParams] = useSearchParams();
  const id = params.get('rerunProspect');
  const returnTo = safeReturnPath(params.get('returnTo'));
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [closed, setClosed] = useState(false);
  const opened = useRef({ reservoir: false, method: false });

  useEffect(() => {
    if (!id || !backend?.prospects) return undefined;
    let live = true;
    (async () => {
      try {
        const own = await backend.prospects.listProspects();
        const shared = backend.prospects.listSharedProspects ? await backend.prospects.listSharedProspects() : [];
        const mine = own.find((p) => p.id === id) || null;
        const prospect = mine || shared.find((p) => p.id === id) || null;
        const projects = backend.projects ? await backend.projects.getProjects() : [];
        let userId = backend.devUser?.id || null;
        if (!userId && backend.sharing?.context) { try { userId = (await backend.sharing.context())?.userId || null; } catch { userId = null; } }
        if (!live) return;
        const next = rerunPlan({ prospect, own: !!mine, projects, userId });
        setPlan(next);
        if (next.state === 'ready') loadProject(next.project);
        if (prospect) setRerun({ prospect, own: !!mine, seed: next.seed ?? null, iterations: next.iterations ?? null, returnTo });
      } catch (e) { if (live) setError(e.message); }
    })();
    return () => { live = false; };
  }, [id, backend]); // eslint-disable-line react-hooks/exhaustive-deps

  // once the project is open: its reservoir, and the probabilistic method (each once, so the user can move on)
  useEffect(() => {
    if (plan?.state !== 'ready' || state.project?.id !== plan.project.id) return;
    if (!opened.current.reservoir && plan.reservoirId && (state.reservoirs || []).some((r) => r.id === plan.reservoirId)) {
      opened.current.reservoir = true;
      if (state.activeReservoirId !== plan.reservoirId) switchReservoir(plan.reservoirId);
    }
    if (!opened.current.method) {
      opened.current.method = true;
      if (state.calcMethod !== 'probabilistic' && plan.seed !== null) setCalcMethod('probabilistic');
    }
  }, [plan, state.project?.id, state.reservoirs, state.activeReservoirId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!id || closed) return null;
  const close = () => {
    setClosed(true);
    setRerun(null);
    const next = new URLSearchParams(params);
    next.delete('rerunProspect'); next.delete('returnTo');
    setParams(next, { replace: true });
  };
  const name = plan?.prospect?.name;
  return (
    <div className="mx-2 mt-2 rounded border border-pl-primary bg-pl-surface px-3 py-2 text-xs" data-testid="rcp-rerun" data-state={error ? 'error' : plan?.state || 'loading'} data-read-only={plan?.readOnly ? 'true' : 'false'}>
      <div className="flex items-start gap-2">
        <RotateCcw className="w-4 h-4 text-pl-primary-text shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="font-semibold text-pl-text">Re-run prospect{name ? ` "${name}"` : ''}, from Risked Reserves Valuation</div>
          {!plan && !error && <p className="text-pl-muted">Reading the prospect and its project.</p>}
          {error && <p className="text-pl-warning-text" data-testid="rcp-rerun-message">The prospect could not be read: {error}</p>}
          {plan && <p className={plan.state === 'ready' ? 'text-pl-text' : 'text-pl-warning-text'} data-testid="rcp-rerun-message">{plan.message}</p>}
          {plan?.readOnly && plan.readOnlyReason && <p className="text-pl-warning-text" data-testid="rcp-rerun-readonly">{plan.readOnlyReason}</p>}
          {plan?.prospect && (
            <ol className="list-decimal pl-4 text-pl-muted" data-testid="rcp-rerun-steps">
              {plan.state === 'ready' && <li>Run the Monte Carlo in the Probabilistic panel{plan.seed !== null ? ` (seed ${plan.seed} is set)` : ''}.</li>}
              <li>Open Prospect Risking: the name and chance factors of &quot;{name}&quot; are filled in. {plan.readOnly ? 'Add your own version.' : 'Add to inventory saves the re-run and retires the old record.'}</li>
              <li>Return to the valuation, which takes the new record and says what moved.</li>
            </ol>
          )}
          {plan?.prospect && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className={btn} data-testid="rcp-rerun-open-risking" onClick={onOpenRisking}>Open Prospect Risking</button>
              <a className={btn} href={returnHref(returnTo, plan.prospect.id)} data-testid="rcp-rerun-return">Return to the valuation</a>
            </div>
          )}
        </div>
        <button type="button" className="text-pl-muted hover:text-pl-text" aria-label="Close the re-run bar" data-testid="rcp-rerun-close" onClick={close}><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
