// Suite unit profile provider and hook. Mounted once at the app shell
// (App.jsx) so every app can read the resolved units. Without a provider
// (unit tests, isolated harnesses) useUnitProfile() reports
// available: false and apps keep their own defaults.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { resolveProfile, sourceLabel, BUILT_IN_RESOLUTION } from './profile';
import { loadLayers, readSnapshot, saveUserProfile, saveOrgProfile } from './profileService';

const UnitProfileContext = createContext(null);

const ADMIN_ROLES = ['owner', 'admin', 'org_admin', 'super_admin'];
const EMPTY_LAYERS = { user: null, organization: null, legacyDepthUnit: null, tableAvailable: true, orgMeta: null };

/** The value the hook returns when no provider is mounted. */
export const NO_PROFILE = Object.freeze({
  available: false,
  ready: true,
  units: BUILT_IN_RESOLUTION.units,
  sources: BUILT_IN_RESOLUTION.sources,
  sourceText: (fam) => sourceLabel(BUILT_IN_RESOLUTION.sources[fam]),
  layers: EMPTY_LAYERS,
  tableAvailable: false,
  orgMeta: null,
  orgId: null,
  userId: null,
  isOrgAdmin: false,
  error: null,
  refresh: async () => {},
  saveMine: async () => { throw new Error('Unit settings are not available here.'); },
  saveOrganization: async () => { throw new Error('Unit settings are not available here.'); },
});

/**
 * Pure part of the provider, exported for tests: layers in, context value out.
 */
export function buildProfileValue({ layers, userId, orgId, role, ready, error }) {
  const l = layers || EMPTY_LAYERS;
  const r = resolveProfile({ user: l.user, organization: l.organization, legacyDepthUnit: l.legacyDepthUnit });
  return {
    available: true,
    ready,
    units: r.units,
    sources: r.sources,
    sourceText: (fam) => sourceLabel(r.sources[fam]),
    layers: l,
    tableAvailable: l.tableAvailable !== false,
    orgMeta: l.orgMeta || null,
    orgId: orgId || null,
    userId: userId || null,
    isOrgAdmin: ADMIN_ROLES.includes(String(role || '').toLowerCase()),
    error: error || null,
  };
}

export function UnitProfileProvider({ children }) {
  const { user, organization, role } = useAuth() || {};
  const userId = user?.id || null;
  const orgId = organization?.id || null;
  const [layers, setLayers] = useState(() => readSnapshot(userId));
  const [ready, setReady] = useState(() => !userId || !!readSnapshot(userId));
  const [error, setError] = useState(null);

  const load = useCallback(async (force = false) => {
    if (!userId) { setLayers(null); setReady(true); return; }
    try {
      const next = await loadLayers({ userId, orgId, force });
      setLayers(next);
      setError(null);
    } catch (e) {
      // a failed read leaves the built-in default in place; nothing alarming
      setError(e.message);
    } finally {
      setReady(true);
    }
  }, [userId, orgId]);

  useEffect(() => {
    setLayers(readSnapshot(userId));
    load(false);
  }, [load, userId]);

  const saveMine = useCallback(async (profile) => {
    const res = await saveUserProfile({ userId, profile });
    await load(true);
    return res;
  }, [userId, load]);

  const saveOrganization = useCallback(async (profile) => {
    await saveOrgProfile({ userId, orgId, profile });
    await load(true);
  }, [userId, orgId, load]);

  const value = useMemo(() => ({
    ...buildProfileValue({ layers, userId, orgId, role, ready, error }),
    refresh: () => load(true),
    saveMine,
    saveOrganization,
  }), [layers, userId, orgId, role, ready, error, load, saveMine, saveOrganization]);

  return <UnitProfileContext.Provider value={value}>{children}</UnitProfileContext.Provider>;
}

/** For tests and harnesses: a provider with fixed layers and no I/O. */
export function StaticUnitProfileProvider({ layers = null, role = 'member', children, onSaveMine, onSaveOrganization }) {
  const value = useMemo(() => ({
    ...buildProfileValue({ layers, userId: 'static-user', orgId: 'static-org', role, ready: true, error: null }),
    refresh: async () => {},
    saveMine: onSaveMine || (async () => ({ stored: 'database' })),
    saveOrganization: onSaveOrganization || (async () => {}),
  }), [layers, role, onSaveMine, onSaveOrganization]);
  return <UnitProfileContext.Provider value={value}>{children}</UnitProfileContext.Provider>;
}

/** The resolved Suite unit profile. */
export function useUnitProfile() {
  return useContext(UnitProfileContext) || NO_PROFILE;
}
