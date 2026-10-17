// Guided Journey context (docs/scope/GuidedJourney-DESIGN.md, section 7):
// loads the journey state after sign-in and keeps it fresh (window focus at
// most once a minute, project switches, Activity changes), and builds the
// journey from it. The UI (greeting, guide card, drawer) reads only this.
// Impersonating sessions read but never write.

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { usePurchasedModules } from '@/hooks/usePurchasedModules';
import { fetchJourneyState, setJourney, markJourney } from '@/lib/journey/journeyService';
import { buildJourney, baselineAcknowledgements } from '@/lib/journey/buildJourney';
import { greeting } from '@/lib/journey/greeting';
import { useActivity, buildActivity } from '@/lib/activity/activity';

const JourneyContext = createContext(null);
const FOCUS_REFRESH_MS = 60 * 1000;

export function JourneyProvider({
  children, activityRunning: runningProp, service = null, auth: authOverride = null, entitlements: entOverride = null,
}) {
  // J4 reads the Suite-wide Activity list unless a caller says otherwise (tests)
  const activityItems = useActivity();
  const activityRunning = runningProp ?? buildActivity(activityItems).running;
  // harnesses pass a signed-in person and their entitlements; the app uses the real ones
  const realAuth = useAuth();
  const { user, isImpersonating } = authOverride || realAuth;
  const { current } = useProject();
  const realEnt = usePurchasedModules();
  const { isAllowed, isModuleActive, loading: entLoading } = entOverride || realEnt;
  const svc = useMemo(() => service || { fetchJourneyState, setJourney, markJourney }, [service]);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const lastLoad = useRef(0);
  const baselined = useRef(false);
  const projectId = current?.id || null;

  const refresh = useCallback(async () => {
    if (!user) { setState(null); return null; }
    try {
      lastLoad.current = Date.now();
      const s = await svc.fetchJourneyState({ projectId });
      setState(s);
      setError(null);
      // a person's first journey record: work they already had never asks "what next"
      if (s?.journey?.missing && !isImpersonating && !baselined.current) {
        baselined.current = true;
        for (const key of baselineAcknowledgements(s)) await svc.markJourney('acknowledged', key).catch(() => {});
      }
      return s;
    } catch (e) {
      setError(e);
      return null;
    }
  }, [user, projectId, svc, isImpersonating]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const onFocus = () => { if (Date.now() - lastLoad.current > FOCUS_REFRESH_MS) refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  // a run finishing (Activity going quiet) can mean first work: refresh
  const wasRunning = useRef(activityRunning);
  useEffect(() => {
    if (wasRunning.current && !activityRunning) refresh();
    wasRunning.current = activityRunning;
  }, [activityRunning, refresh]);

  const write = useCallback(async (fn) => {
    if (isImpersonating) return null;   // looking at someone else's account never changes their journey
    const row = await fn();
    setState((s) => (s ? { ...s, journey: { ...s.journey, ...row, missing: false } } : s));
    return row;
  }, [isImpersonating]);

  const setGuidance = useCallback((mode) => write(() => svc.setJourney({ guidance: mode })), [write, svc]);
  const setDisciplines = useCallback(async (list, source = 'chosen') => {
    const row = await write(() => svc.setJourney({ disciplines: list, source }));
    refresh();   // the work probes follow the disciplines
    return row;
  }, [write, svc, refresh]);
  const mark = useCallback((kind, key) => write(() => svc.markJourney(kind, key)), [write, svc]);

  const journey = useMemo(() => {
    if (!state || entLoading) return null;
    return buildJourney(state, {
      canOpen: (appId, module) => isAllowed(appId) || (module ? isModuleActive(module) : false),
      moduleOpen: (module) => isModuleActive(module),
      activityRunning,
    });
  }, [state, entLoading, isAllowed, isModuleActive, activityRunning]);

  const hello = useMemo(() => (state ? greeting({
    user: state.user || {},
    lastGreetedAt: state.journey?.last_greeted_at || null,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }) : null), [state]);

  const value = useMemo(() => ({
    state, journey, greeting: hello, error, loading: !state && !error,
    refresh, setGuidance, setDisciplines, mark,
  }), [state, journey, hello, error, refresh, setGuidance, setDisciplines, mark]);

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

const OFF = Object.freeze({ state: null, journey: null, greeting: null, error: null, loading: false, refresh: async () => null, setGuidance: async () => null, setDisciplines: async () => null, mark: async () => null });

/** The journey; outside a JourneyProvider (harnesses, tests) guidance is off. */
export function useJourney() {
  return useContext(JourneyContext) || OFF;
}
