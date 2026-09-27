// Marine Logistics Planner state (Supply Chain SC4).
//
// The page state is the visible controls and nothing else. Every result is
// the vendored marine logistics engine run on those controls through
// src/utils/supplychain/marineAdapters.js; nothing is computed here.
import React, {
  createContext, useCallback, useContext, useMemo, useState,
} from 'react';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  applyDataSet, berthCurve, defaultInputs, ekeneDemoInputs, inputsFromPayload, isRefusal, runView, SCHEMA_VERSION, ENGINE_COMMIT,
} from '@/utils/supplychain/marineAdapters';

const TABLE = 'scm_marine_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save marine logistics studies.',
  schemaVersion: SCHEMA_VERSION,
  label: 'marine logistics study',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'sc4_scm_marine_projects');

const Ctx = createContext();

export const useMarineLogistics = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMarineLogistics must be used within a MarineLogisticsProvider');
  return ctx;
};

export const MarineLogisticsProvider = ({ children, initialInputs }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [inputs, setInputs] = useState(() => initialInputs || defaultInputs());

  /** Merge a patch into one section of the inputs. */
  const setSection = useCallback((key, patch) => setInputs((p) => ({ ...p, [key]: { ...p[key], ...patch } })), []);
  /** Replace the cluster through an updater of the current cluster. */
  const updateCluster = useCallback((fn) => setInputs((p) => ({ ...p, cluster: fn(p.cluster) })), []);
  const replaceInputs = useCallback((next) => setInputs(next), []);
  const loadEkene = useCallback(() => {
    setInputs(ekeneDemoInputs());
    addNotification('Loaded the Ekene demo: four synthetic installations, a PSV and an AHTS, one voyage of deck cargo and the supply base.', 'success');
  }, [addNotification]);
  const importDataSet = useCallback((dataSet) => setInputs((p) => applyDataSet(dataSet, p, 'paste')), []);
  const importInstallations = useCallback((installations) => setInputs((p) => ({
    ...p, cluster: { ...p.cluster, source: 'paste', installations },
  })), []);
  const clearAll = useCallback(() => setInputs(defaultInputs()), []);

  const {
    cluster, voyage, fleet, variability, deck, shore,
  } = inputs;
  const rVoyage = useMemo(() => runView('voyage', { cluster, voyage }), [cluster, voyage]);
  const rFleet = useMemo(() => runView('fleet', { cluster, fleet }), [cluster, fleet]);
  const rVariability = useMemo(() => runView('variability', { cluster, variability }), [cluster, variability]);
  const rDeckFfd = useMemo(() => runView('deckFfd', { deck }), [deck]);
  const rDeckFf = useMemo(() => runView('deckFf', { deck }), [deck]);
  const rShore = useMemo(() => runView('shore', { shore }), [shore]);
  const curve = useMemo(() => (isRefusal(rShore) ? [] : berthCurve({ shore }, rShore.offeredLoad)), [shore, rShore]);
  const results = {
    voyage: rVoyage,
    fleet: rFleet,
    variability: rVariability,
    deckFfd: rDeckFfd,
    deckFf: rDeckFf,
    shore: rShore,
    berthCurve: curve,
  };

  const serialize = useCallback((name) => ({
    name, schema: SCHEMA_VERSION, engine: ENGINE_COMMIT, inputs, modified: new Date().toISOString(),
  }), [inputs]);
  const restore = useCallback((payload) => {
    const restored = inputsFromPayload(payload);
    if (!restored) return false;
    setInputs(restored);
    return true;
  }, []);
  const persistence = useSavedProjects({
    service, serialize, restore, addNotification, describeError, watch: inputs, noun: 'Study',
  });

  const value = {
    inputs, results, setSection, updateCluster, replaceInputs, loadEkene, importDataSet, importInstallations, clearAll,
    persistence, notifications, addNotification, removeNotification,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
