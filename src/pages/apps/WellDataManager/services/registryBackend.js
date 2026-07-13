// The app's backend adapter: everything WellWorkstation touches goes
// through this one object, so the /dev harness can swap in
// inMemoryBackend and the WHOLE app runs without auth or DB (the
// harness philosophy — presentation drivable by Playwright).
//
// This is the real one: geo_wells via the shared registry service
// (src/lib/wellsRegistry.js — Seismolord reads the same registry since
// G1.4), LAS parsing via the worker facade, org resolution via the
// shared three-table resolver (src/lib/orgContext.js — never query a
// membership table directly).

import { supabase } from '@/lib/customSupabaseClient';
import { resolveUserOrgId } from '@/lib/orgContext';
import {
  saveWell, listWells, updateWell, deleteWell,
  shareWell, unshareWell,
  listTops, replaceTops,
  listLogs, saveLogs, deleteLog, downloadCurve,
} from '@/lib/wellsRegistry';
import { parseLasFile } from './lasImportService';

export function makeRegistryBackend() {
  let orgId; // resolved once per session (undefined = not yet)

  const myOrgId = async () => {
    if (orgId !== undefined) return orgId;
    const { data: { user } } = await supabase.auth.getUser();
    orgId = user ? await resolveUserOrgId(user.id) : null;
    return orgId;
  };

  return {
    listWells,
    saveWell,
    updateWell,
    deleteWell,
    listTops,
    replaceTops,
    listLogs,
    saveLogs,
    deleteLog,
    downloadCurve,
    parseLasFile,

    /** null when the user belongs to no organization — the share
     *  toggle renders disabled with an explanation instead of failing. */
    myOrgId,
    shareWell: async (wellId) => {
      const org = await myOrgId();
      if (!org) throw new Error('You belong to no organization — nothing to share with.');
      return shareWell(wellId, org);
    },
    unshareWell: (wellId) => unshareWell(wellId),
  };
}
