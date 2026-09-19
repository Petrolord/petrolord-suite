// Consequence Modelling Studio state (Process Safety PS2).
//
// Holds the study inputs (source term, dispersion, fire, explosion, harm) and
// nothing derived. Every result on screen comes from evaluateStudy, which
// calls the vendored engine, so a saved study is its inputs only.
import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  STUDY_SCHEMA, defaultStudy, evaluateStudy, studyFromPayload,
} from '@/utils/processSafety/consequenceStudy';
import {
  CONSEQUENCE_STUDIES_MIGRATION, CONSEQUENCE_STUDIES_TABLE, createConsequenceStudiesService,
} from '@/utils/processSafety/consequenceStudiesService';

const Ctx = createContext(null);

export const useConsequenceStudio = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConsequenceStudio must be used within a ConsequenceStudioProvider');
  return ctx;
};

const describeError = (e) => missingTableMessage(e, CONSEQUENCE_STUDIES_TABLE, CONSEQUENCE_STUDIES_MIGRATION);

export const ConsequenceStudioProvider = ({ children }) => {
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
  const service = useMemo(() => createConsequenceStudiesService(() => orgRef.current), [orgId]);

  /** Patch one top-level section (dispersion, fire, explosion). */
  const setSection = useCallback((section, patch) => {
    setStudy((p) => ({ ...p, [section]: { ...p[section], ...patch } }));
  }, []);

  /** Patch one part of a section (source.liquid, harm.toxic, ...). */
  const setPart = useCallback((section, part, patch) => {
    setStudy((p) => ({
      ...p,
      [section]: { ...p[section], [part]: { ...p[section][part], ...patch } },
    }));
  }, []);

  const replaceSection = useCallback((section, value) => {
    setStudy((p) => ({ ...p, [section]: value }));
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
    setSection, setPart, replaceSection,
    persistence, notifications, addNotification, removeNotification,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
