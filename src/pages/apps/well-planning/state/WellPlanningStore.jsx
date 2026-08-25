// Well Design Studio workspace store (WD1): the single context holding
// selection (site > wellbore > design), entity caches, and the design
// lifecycle actions (save, save-as-revision, set-definitive). Fetch on
// select with simple invalidation — the house pattern (no query
// library). Draft state (unsaved segment edits) stays in
// WellPlanningContext keyed by the selected design id.

import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import * as wpApi from '../services/wpApi';

const StoreContext = createContext(null);

export const WellPlanningStoreProvider = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [sites, setSites] = useState([]);
  const [wellbores, setWellbores] = useState([]); // of the selected site
  const [designs, setDesigns] = useState([]);     // of the selected wellbore
  const [targets, setTargets] = useState([]);     // of the selected site
  const [selection, setSelection] = useState({ siteId: null, wellboreId: null, designId: null });
  const [loading, setLoading] = useState(true);

  const fail = useCallback((title, e) => {
    toast({ variant: 'destructive', title, description: e.message });
  }, [toast]);

  const refreshSites = useCallback(async () => {
    try {
      const rows = await wpApi.listSites();
      setSites(rows);
      return rows;
    } catch (e) { fail('Failed to load sites', e); return []; }
  }, [fail]);

  const refreshWellbores = useCallback(async (siteId) => {
    if (!siteId) { setWellbores([]); return []; }
    try {
      const rows = await wpApi.listWellbores(siteId);
      setWellbores(rows);
      return rows;
    } catch (e) { fail('Failed to load wellbores', e); return []; }
  }, [fail]);

  const refreshDesigns = useCallback(async (wellboreId) => {
    if (!wellboreId) { setDesigns([]); return []; }
    try {
      const rows = await wpApi.listDesigns(wellboreId);
      setDesigns(rows);
      return rows;
    } catch (e) { fail('Failed to load designs', e); return []; }
  }, [fail]);

  const refreshTargets = useCallback(async (siteId) => {
    if (!siteId) { setTargets([]); return []; }
    try {
      const rows = await wpApi.listTargets(siteId);
      setTargets(rows);
      return rows;
    } catch (e) { fail('Failed to load targets', e); return []; }
  }, [fail]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      await refreshSites();
      setLoading(false);
    })();
  }, [user, refreshSites]);

  useEffect(() => { refreshWellbores(selection.siteId); refreshTargets(selection.siteId); },
    [selection.siteId, refreshWellbores, refreshTargets]);
  useEffect(() => { refreshDesigns(selection.wellboreId); },
    [selection.wellboreId, refreshDesigns]);

  const selectSite = useCallback((siteId) => {
    setSelection({ siteId, wellboreId: null, designId: null });
  }, []);
  const selectWellbore = useCallback((siteId, wellboreId) => {
    setSelection({ siteId, wellboreId, designId: null });
  }, []);
  const selectDesign = useCallback((siteId, wellboreId, designId) => {
    setSelection({ siteId, wellboreId, designId });
  }, []);

  const site = useMemo(() => sites.find((s) => s.id === selection.siteId) || null, [sites, selection.siteId]);
  const wellbore = useMemo(() => wellbores.find((w) => w.id === selection.wellboreId) || null, [wellbores, selection.wellboreId]);
  const design = useMemo(() => designs.find((d) => d.id === selection.designId) || null, [designs, selection.designId]);

  const value = useMemo(() => ({
    user,
    loading,
    sites, wellbores, designs, targets,
    selection, site, wellbore, design,
    selectSite, selectWellbore, selectDesign,
    refreshSites, refreshWellbores, refreshDesigns, refreshTargets,
    wpApi,
  }), [user, loading, sites, wellbores, designs, targets, selection, site,
    wellbore, design, selectSite, selectWellbore, selectDesign,
    refreshSites, refreshWellbores, refreshDesigns, refreshTargets]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useWellPlanningStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useWellPlanningStore must be used within WellPlanningStoreProvider');
  return ctx;
};
