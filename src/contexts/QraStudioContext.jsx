// QRA Studio state (Process Safety PS3).
//
// Holds the study inputs (event tree, register, criteria, transect,
// cost-benefit) and nothing derived. Every result on screen comes from
// evaluateStudy, which calls the vendored engine, so a saved study is its
// inputs only.
import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  STUDY_SCHEMA, blankCell, blankLocation, blankScenario, defaultStudy, evaluateStudy, newId, studyFromPayload,
} from '@/utils/processSafety/qraStudy';
import {
  QRA_STUDIES_MIGRATION, QRA_STUDIES_TABLE, createQraStudiesService,
} from '@/utils/processSafety/qraStudiesService';

const Ctx = createContext(null);

export const useQraStudio = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useQraStudio must be used within a QraStudioProvider');
  return ctx;
};

const describeError = (e) => missingTableMessage(e, QRA_STUDIES_TABLE, QRA_STUDIES_MIGRATION);

export const QraStudioProvider = ({ children }) => {
  const { organization } = useAuth() || {};
  const orgId = organization?.id || null;
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [study, setStudy] = useState(defaultStudy);

  // The service reads the organization through a ref so switching
  // organization does not rebuild it mid-save; the list reloads on switch.
  const orgRef = useRef(orgId);
  orgRef.current = orgId;
  // orgId is a deliberate dependency: a new service on switch makes the
  // saved-study list reload for the organization now selected.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const service = useMemo(() => createQraStudiesService(() => orgRef.current), [orgId]);

  /** Patch one top-level section (eventTree, individual, societal, costBenefit, transect). */
  const setSection = useCallback((section, patch) => {
    setStudy((p) => ({ ...p, [section]: { ...p[section], ...patch } }));
  }, []);

  // ---- the register
  const updateScenario = useCallback((id, patch) => {
    setStudy((p) => ({ ...p, scenarios: p.scenarios.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }, []);
  const addScenario = useCallback(() => {
    setStudy((p) => ({ ...p, scenarios: [...p.scenarios, blankScenario(newId('s'))] }));
  }, []);
  const removeScenario = useCallback((id) => {
    setStudy((p) => {
      const cells = { ...p.cells };
      delete cells[id];
      return {
        ...p,
        scenarios: p.scenarios.filter((s) => s.id !== id),
        cells,
        transect: { ...p.transect, rows: p.transect.rows.filter((r) => r.scenarioId !== id) },
      };
    });
  }, []);

  const updateLocation = useCallback((id, patch) => {
    setStudy((p) => ({ ...p, locations: p.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  }, []);
  const addLocation = useCallback(() => {
    setStudy((p) => ({ ...p, locations: [...p.locations, blankLocation(newId('l'))] }));
  }, []);
  const removeLocation = useCallback((id) => {
    setStudy((p) => {
      const cells = {};
      Object.keys(p.cells).forEach((sid) => {
        const row = { ...p.cells[sid] };
        delete row[id];
        cells[sid] = row;
      });
      return { ...p, locations: p.locations.filter((l) => l.id !== id), cells };
    });
  }, []);

  const updateCell = useCallback((sid, lid, patch) => {
    setStudy((p) => {
      const row = p.cells[sid] || {};
      const cell = { ...(row[lid] || blankCell()), ...patch };
      return { ...p, cells: { ...p.cells, [sid]: { ...row, [lid]: cell } } };
    });
  }, []);

  // ---- lists inside sections
  const updateListItem = useCallback((section, list, id, patch) => {
    setStudy((p) => ({
      ...p,
      [section]: { ...p[section], [list]: p[section][list].map((x) => (x.id === id ? { ...x, ...patch } : x)) },
    }));
  }, []);
  const addListItem = useCallback((section, list, item) => {
    setStudy((p) => ({ ...p, [section]: { ...p[section], [list]: [...p[section][list], item] } }));
  }, []);
  const removeListItem = useCallback((section, list, id) => {
    setStudy((p) => ({ ...p, [section]: { ...p[section], [list]: p[section][list].filter((x) => x.id !== id) } }));
  }, []);

  // ---- derived, never stored
  const evaluation = useMemo(() => evaluateStudy(study), [study]);

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
    study, evaluation, orgId,
    setSection,
    updateScenario, addScenario, removeScenario,
    updateLocation, addLocation, removeLocation,
    updateCell,
    updateListItem, addListItem, removeListItem,
    persistence, notifications, addNotification, removeNotification,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
