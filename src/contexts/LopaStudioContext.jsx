// LOPA & SIL Studio state (Process Safety PS1).
//
// Holds the study (a list of scenarios, each with its SIF) and nothing
// derived. Every result on screen comes from evaluateScenario, which calls
// the vendored engine, so a saved study is its inputs only.
import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  STUDY_SCHEMA, blankScenario, defaultStudy, evaluateScenario, newIpl,
  newProbabilityRow, studyFromPayload,
} from '@/utils/processSafety/lopaStudy';
import {
  LOPA_STUDIES_MIGRATION, LOPA_STUDIES_TABLE, createLopaStudiesService,
} from '@/utils/processSafety/lopaStudiesService';

const Ctx = createContext(null);

export const useLopaStudio = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLopaStudio must be used within a LopaStudioProvider');
  return ctx;
};

const describeError = (e) => missingTableMessage(e, LOPA_STUDIES_TABLE, LOPA_STUDIES_MIGRATION);

/** Replace one item of a list by id with a patch. */
const patchById = (list, id, patch) => list.map((x) => (x.id === id ? { ...x, ...patch } : x));

export const LopaStudioProvider = ({ children }) => {
  const { organization } = useAuth() || {};
  const orgId = organization?.id || null;
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [study, setStudy] = useState(defaultStudy);

  // The service reads the organization through a ref so switching
  // organization does not rebuild it mid-save; the list reloads on switch.
  const orgRef = useRef(orgId);
  orgRef.current = orgId;
  const service = useMemo(() => createLopaStudiesService(() => orgRef.current), [orgId]);

  const active = study.scenarios.find((s) => s.id === study.activeScenarioId) || study.scenarios[0];

  // ---- scenario list
  const selectScenario = useCallback((id) => setStudy((p) => ({ ...p, activeScenarioId: id })), []);

  const addScenario = useCallback(() => {
    setStudy((p) => {
      const s = blankScenario(p.scenarios.length + 1);
      return { scenarios: [...p.scenarios, s], activeScenarioId: s.id };
    });
  }, []);

  const removeScenario = useCallback((id) => {
    setStudy((p) => {
      if (p.scenarios.length <= 1) return p;
      const scenarios = p.scenarios.filter((s) => s.id !== id);
      const activeScenarioId = p.activeScenarioId === id ? scenarios[0].id : p.activeScenarioId;
      return { scenarios, activeScenarioId };
    });
  }, []);

  // ---- the active scenario
  const updateActive = useCallback((fn) => {
    setStudy((p) => ({
      ...p,
      scenarios: p.scenarios.map((s) => (s.id === p.activeScenarioId ? fn(s) : s)),
    }));
  }, []);

  const setScenarioField = useCallback((patch) => updateActive((s) => ({ ...s, ...patch })), [updateActive]);

  const addListRow = useCallback((listKey) => updateActive((s) => ({
    ...s,
    [listKey]: [...(s[listKey] || []), listKey === 'ipls' ? newIpl() : newProbabilityRow()],
  })), [updateActive]);

  const setListRow = useCallback((listKey, rowId, patch) => updateActive((s) => ({
    ...s, [listKey]: patchById(s[listKey] || [], rowId, patch),
  })), [updateActive]);

  const removeListRow = useCallback((listKey, rowId) => updateActive((s) => ({
    ...s, [listKey]: (s[listKey] || []).filter((r) => r.id !== rowId),
  })), [updateActive]);

  const setSif = useCallback((patch) => updateActive((s) => ({ ...s, sif: { ...s.sif, ...patch } })), [updateActive]);

  const setSubsystem = useCallback((subId, patch) => updateActive((s) => ({
    ...s, sif: { ...s.sif, subsystems: patchById(s.sif.subsystems, subId, patch) },
  })), [updateActive]);

  const setSensitivity = useCallback((patch) => updateActive((s) => ({
    ...s, sensitivity: { ...s.sensitivity, ...patch },
  })), [updateActive]);

  // ---- derived, never stored
  const evaluation = useMemo(() => evaluateScenario(active), [active]);
  const summaries = useMemo(() => study.scenarios.map((s) => {
    const e = s.id === active.id ? evaluation : evaluateScenario(s);
    return { id: s.id, name: s.name, lopa: e.lopa, verdict: e.verdict };
  }), [study.scenarios, active.id, evaluation]);

  // ---- persistence
  const serialize = useCallback((name) => ({
    name, schema: STUDY_SCHEMA, study, modified: new Date().toISOString(),
  }), [study]);

  const restore = useCallback((payload) => {
    const s = studyFromPayload(payload);
    if (!s) return false;
    setStudy(s);
    return true;
  }, []);

  const persistence = useSavedProjects({
    service, serialize, restore, addNotification, describeError,
    watch: study, noun: 'Study',
  });

  const value = {
    study, active, evaluation, summaries, orgId,
    selectScenario, addScenario, removeScenario,
    setScenarioField, addListRow, setListRow, removeListRow,
    setSif, setSubsystem, setSensitivity,
    persistence, notifications, addNotification, removeNotification,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
