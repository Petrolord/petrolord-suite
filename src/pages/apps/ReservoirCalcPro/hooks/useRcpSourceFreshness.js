// ReservoirCalc Pro's use of the shared source freshness hook: the
// workspace's registry references (services/rcpSources.js), checked on
// open and on demand; Refresh runs the app's own pull again, Keep records
// the decision with the project (inputs.sourceKept).
import { useCallback, useMemo } from 'react';
import { useSourceFreshness } from '@/lib/sourceFreshness/useSourceFreshness';
import { keepSource } from '@/lib/sourceFreshness/model';
import { rcpSourceRefs, readRcpSources, rcpRefreshPlan, zoneEditor } from '../services/rcpSources';

/**
 * @param {{state: object, backend: object, updateInputs: function, addSurface: function,
 *   replaceSurface: function, addAOI: function, deleteAOI: function, setActiveAOI: function, logEvent: function}} a
 */
export function useRcpSourceFreshness({ state, backend, updateInputs, replaceSurface, addAOI, deleteAOI, setActiveAOI, logEvent }) {
  const refs = useMemo(() => rcpSourceRefs(state), [state.inputs?.registryProvenance, state.surfaces, state.aois, state.activeAoiId, state.inputMethod, state.inputs?.topSurfaceId, state.inputs?.baseSurfaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  const kept = state.inputs?.sourceKept || {};
  const resolve = useCallback((list) => readRcpSources(backend, list), [backend]);
  const names = useMemo(() => (backend?.sharing?.names ? (ids) => backend.sharing.names(ids) : null), [backend]);
  const whoChanged = useCallback((r) => zoneEditor(backend, r), [backend]);
  const f = useSourceFreshness({ refs, resolve, kept, names, whoChanged });

  const refresh = async (item) => {
    const plan = await rcpRefreshPlan(item, { state, backend });
    // a refresh replaces any keep decision for the source
    const nextKept = { ...kept };
    delete nextKept[item.key];
    if (plan.inputs) updateInputs({ ...plan.inputs, sourceKept: nextKept });
    else updateInputs({ sourceKept: nextKept });
    if (plan.surface) replaceSurface(plan.surface);
    if (plan.aois) {
      const wasActive = (state.aois || []).find((a) => a.id === state.activeAoiId) || null;
      for (const id of plan.aois.remove) deleteAOI(id);
      for (const a of plan.aois.add) addAOI(a);
      // the active AOI stays the same polygon (same part of the layer), or stays what it was
      const same = wasActive && plan.aois.remove.includes(wasActive.id)
        ? plan.aois.add.find((a) => a.source?.part === wasActive.source?.part) || plan.aois.add[0]
        : wasActive;
      setActiveAOI(same ? same.id : null);
    }
    logEvent?.(plan.log[0], plan.log[1]);
  };
  const keep = (item) => {
    updateInputs({ sourceKept: keepSource(kept, item) });
    logEvent?.('Source change kept', `${item.ref?.name || item.key}: current values kept`);
  };
  return { ...f, refs, refresh, keep };
}
