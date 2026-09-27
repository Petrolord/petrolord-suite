// Materials & Spares Planner state (Supply Chain SC3).
//
// The page state is the visible controls and nothing else. Every result is
// the vendored inventory engine run on those controls through
// src/utils/supplychain/materialsAdapters.js; nothing is computed here.
import React, {
  createContext, useCallback, useContext, useMemo, useState,
} from 'react';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { useSavedProjects, missingTableMessage } from '@/hooks/useSavedProjects';
import { useStudioNotifications } from '@/components/studio/useStudioNotifications';
import {
  defaultInputs, ekeneDemoInputs, inputsFromPayload, runView, SCHEMA_VERSION, ENGINE_COMMIT,
} from '@/utils/supplychain/materialsAdapters';

const TABLE = 'scm_materials_projects';
export const service = createSavedProjectsService(TABLE, {
  signInMessage: 'Sign in to save materials studies.',
  schemaVersion: SCHEMA_VERSION,
  label: 'materials study',
});
const describeError = (e) => missingTableMessage(e, TABLE, 'sc3_scm_materials_projects');

const Ctx = createContext();

export const useMaterialsSpares = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMaterialsSpares must be used within a MaterialsSparesProvider');
  return ctx;
};

export const MaterialsSparesProvider = ({ children, initialInputs }) => {
  const { notifications, addNotification, removeNotification } = useStudioNotifications();
  const [inputs, setInputs] = useState(() => initialInputs || defaultInputs());

  /** Merge a patch into one section of the inputs. */
  const setSection = useCallback((key, patch) => setInputs((p) => ({ ...p, [key]: { ...p[key], ...patch } })), []);
  const replaceInputs = useCallback((next) => setInputs(next), []);
  const loadEkene = useCallback(() => {
    setInputs(ekeneDemoInputs());
    addNotification('Loaded the Ekene demo: 18 synthetic items, the stated policy and one case per calculation.', 'success');
  }, [addNotification]);
  const importRegister = useCallback((parsed, source) => {
    setInputs((p) => ({
      ...p,
      register: {
        source, title: parsed.title || '', currency: parsed.currency || '', items: parsed.items,
      },
    }));
  }, []);
  const clearAll = useCallback(() => setInputs(defaultInputs()), []);

  const {
    register, criticality, abc, eoq, discount, safety, poisson, spares, leadTime, slow,
  } = inputs;
  const rCriticality = useMemo(() => runView('criticality', { register, criticality }), [register, criticality]);
  const rAbc = useMemo(() => runView('abc', { register, abc }), [register, abc]);
  const rEoq = useMemo(() => runView('eoq', { eoq }), [eoq]);
  const rDiscount = useMemo(() => runView('discount', { discount }), [discount]);
  const rSafety = useMemo(() => runView('safety', { safety }), [safety]);
  const rPoisson = useMemo(() => runView('poisson', { poisson }), [poisson]);
  const rSpares = useMemo(() => runView('spares', { spares }), [spares]);
  const rLeadTime = useMemo(() => runView('leadTime', { leadTime }), [leadTime]);
  const rSlow = useMemo(() => runView('slow', { register, slow }), [register, slow]);
  const results = {
    criticality: rCriticality,
    abc: rAbc,
    eoq: rEoq,
    discount: rDiscount,
    safety: rSafety,
    poisson: rPoisson,
    spares: rSpares,
    leadTime: rLeadTime,
    slow: rSlow,
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

  const items = inputs.register.items;
  const value = {
    inputs, items, results, setSection, replaceInputs, loadEkene, importRegister, clearAll,
    persistence, notifications, addNotification, removeNotification,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
