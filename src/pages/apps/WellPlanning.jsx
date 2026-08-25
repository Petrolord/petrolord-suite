// Well Design Studio shell (WD1): EDM-style workspace on the wp_* data
// model. Left: Site > Wellbore > Design tree. Right: workspace tabs.
// Anti-Collision and Reports show honest wave placeholders until their
// engines land (WD4 / WD6).

import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Home, ChevronRight, Waypoints, Shield, FileText, Grid3X3, Target, Ruler,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';

import { WellPlanningStoreProvider, useWellPlanningStore } from './well-planning/state/WellPlanningStore';
import { WellPlanningProvider } from './well-planning/contexts/WellPlanningContext';
import SiteTree from './well-planning/tree/SiteTree';
import SiteDialog from './well-planning/components/SiteDialog';
import WellboreDialog from './well-planning/components/WellboreDialog';
import LegacyImportDialog from './well-planning/components/LegacyImportDialog';
import DesignTab from './well-planning/tabs/DesignTab';
import TargetsTab from './well-planning/tabs/TargetsTab';
import AnalysisTab from './well-planning/tabs/AnalysisTab';
import * as wpApi from './well-planning/services/wpApi';

const WavePlaceholder = ({ icon: Icon, title, body }) => (
  <div className="flex h-[50vh] flex-col items-center justify-center gap-3 text-center">
    <Icon className="h-10 w-10 text-slate-700" />
    <h3 className="text-base font-semibold text-slate-300">{title}</h3>
    <p className="max-w-md text-sm text-slate-500">{body}</p>
  </div>
);

const WellPlanningContent = () => {
  const store = useWellPlanningStore();
  const { organization } = useAuth();
  const { toast } = useToast();
  const {
    user, loading, site, wellbore, design, selection,
    refreshSites, refreshWellbores, refreshDesigns, selectSite, selectWellbore, selectDesign,
  } = store;

  const [siteDialog, setSiteDialog] = useState(null);         // {site|null} | null closed
  const [wellboreDialog, setWellboreDialog] = useState(null); // {site, wellbore|null}
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState(null);         // {kind:'newDesign'|'renameDesign', ...}
  const [nameValue, setNameValue] = useState('');
  const [confirm, setConfirm] = useState(null);               // {title, body, action}

  const fail = (title) => (e) => toast({ variant: 'destructive', title, description: e.message });

  // ---- site actions ----
  const handleSaveSite = async (payload) => {
    try {
      if (siteDialog?.site?.id) {
        await wpApi.updateSite(siteDialog.site.id, payload);
      } else {
        const s = await wpApi.saveSite(payload, user.id);
        selectSite(s.id);
      }
      await refreshSites();
      toast({ title: 'Site saved', className: 'bg-green-600 text-white' });
    } catch (e) { fail('Site save failed')(e); throw e; }
  };

  const handleShareSite = async (s) => {
    try {
      if (s.organization_id) {
        await wpApi.unshareSite(s.id);
        toast({ title: 'Sharing stopped', description: `${s.name} is private again.` });
      } else {
        if (!organization?.id) throw new Error('You are not a member of an organization.');
        await wpApi.shareSite(s.id, organization.id);
        toast({ title: 'Site shared', description: `${s.name} is visible to your organization (read-only).`, className: 'bg-green-600 text-white' });
      }
      await refreshSites();
    } catch (e) { fail('Share failed')(e); }
  };

  // ---- wellbore actions ----
  const handleSaveWellbore = async (payload) => {
    try {
      const s = wellboreDialog.site;
      if (wellboreDialog?.wellbore?.id) {
        await wpApi.updateWellbore(wellboreDialog.wellbore.id, payload);
      } else {
        const w = await wpApi.saveWellbore({ ...payload, site_id: s.id }, user.id);
        selectWellbore(s.id, w.id);
      }
      await refreshWellbores(s.id);
      toast({ title: 'Wellbore saved', className: 'bg-green-600 text-white' });
    } catch (e) { fail('Wellbore save failed')(e); throw e; }
  };

  // ---- design actions ----
  const handleNameDialogSave = async () => {
    const name = nameValue.trim();
    if (!name) return;
    try {
      if (nameDialog.kind === 'newDesign') {
        const d = await wpApi.saveDesign({
          wellbore_id: nameDialog.wellbore.id, name, revision: 1, status: 'draft',
        }, user.id);
        await refreshDesigns(nameDialog.wellbore.id);
        selectDesign(nameDialog.wellbore.site_id, nameDialog.wellbore.id, d.id);
      } else if (nameDialog.kind === 'renameDesign') {
        await wpApi.updateDesign(nameDialog.design.id, { name });
        await refreshDesigns(nameDialog.design.wellbore_id);
      }
      setNameDialog(null);
      setNameValue('');
    } catch (e) { fail('Save failed')(e); }
  };

  const handleSaveRevision = async (d) => {
    try {
      const nd = await wpApi.saveDesignRevision(d, user.id);
      await refreshDesigns(d.wellbore_id);
      selectDesign(selection.siteId, d.wellbore_id, nd.id);
      toast({ title: 'Revision created', description: `${nd.name} r${nd.revision} (draft).`, className: 'bg-green-600 text-white' });
    } catch (e) { fail('Revision failed')(e); }
  };

  const handleSetDefinitive = async (d) => {
    try {
      await wpApi.setDefinitiveDesign(d.id, d.wellbore_id);
      await refreshDesigns(d.wellbore_id);
      toast({ title: 'Definitive plan set', description: `${d.name} r${d.revision} is now the definitive design for this wellbore.`, className: 'bg-green-600 text-white' });
    } catch (e) { fail('Could not set definitive')(e); }
  };

  const askDelete = (kind, entity) => {
    const actions = {
      site: async () => { await wpApi.deleteSite(entity.id); await refreshSites(); selectSite(null); },
      wellbore: async () => { await wpApi.deleteWellbore(entity.id); await refreshWellbores(entity.site_id); selectSite(entity.site_id); },
      design: async () => { await wpApi.deleteDesign(entity.id); await refreshDesigns(entity.wellbore_id); },
    };
    const bodies = {
      site: 'Deleting a site removes every wellbore, design, target and survey on it. This cannot be undone.',
      wellbore: 'Deleting a wellbore removes its designs and surveys. This cannot be undone.',
      design: 'Deleting a design removes its plan and history rows. This cannot be undone.',
    };
    setConfirm({
      title: `Delete ${kind} "${entity.name}"?`,
      body: bodies[kind],
      action: async () => {
        try { await actions[kind](); toast({ title: 'Deleted' }); } catch (e) { fail('Delete failed')(e); }
      },
    });
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-[#4CAF50]" />
          <p className="font-medium text-slate-400">Loading Well Design Studio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-white">
      <Helmet><title>Well Design Studio | Petrolord</title></Helmet>

      {/* LEFT: tree */}
      <div className="flex w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
        <div className="flex h-14 items-center gap-2 border-b border-slate-800 px-4">
          <div className="rounded-lg bg-gradient-to-br from-[#FFC107] to-[#FFA000] p-1.5">
            <Waypoints className="h-5 w-5 text-slate-900" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight text-white">Well Design Studio</h1>
            <p className="text-[10px] text-slate-500">Trajectory design and anti-collision</p>
          </div>
        </div>
        <SiteTree
          store={store}
          onNewSite={() => setSiteDialog({ site: null })}
          onEditSite={(s) => setSiteDialog({ site: s })}
          onDeleteSite={(s) => askDelete('site', s)}
          onShareSite={handleShareSite}
          onNewWellbore={(s) => setWellboreDialog({ site: s, wellbore: null })}
          onEditWellbore={(w) => setWellboreDialog({ site, wellbore: w })}
          onDeleteWellbore={(w) => askDelete('wellbore', w)}
          onNewDesign={(w) => { setNameDialog({ kind: 'newDesign', wellbore: w }); setNameValue('Plan A'); }}
          onRenameDesign={(d) => { setNameDialog({ kind: 'renameDesign', design: d }); setNameValue(d.name); }}
          onDeleteDesign={(d) => askDelete('design', d)}
          onSaveRevision={handleSaveRevision}
          onSetDefinitive={handleSetDefinitive}
          onLegacyImport={() => setLegacyOpen(true)}
        />
      </div>

      {/* RIGHT: workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4">
          <nav className="flex items-center text-xs text-slate-500">
            <Link to="/dashboard" className="transition-colors hover:text-white"><Home className="h-3 w-3" /></Link>
            <ChevronRight className="mx-1 h-3 w-3 opacity-50" />
            <Link to="/dashboard/drilling" className="transition-colors hover:text-white">Drilling</Link>
            <ChevronRight className="mx-1 h-3 w-3 opacity-50" />
            <span className="font-medium text-[#4CAF50]">Well Design Studio</span>
            {site && (<><ChevronRight className="mx-1 h-3 w-3 opacity-50" /><span className="text-slate-300">{site.name}</span></>)}
            {wellbore && (<><ChevronRight className="mx-1 h-3 w-3 opacity-50" /><span className="text-slate-300">{wellbore.name}</span></>)}
            {design && (<><ChevronRight className="mx-1 h-3 w-3 opacity-50" /><span className="text-slate-200">{design.name} r{design.revision}</span></>)}
          </nav>
          {site?.crs && (
            <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
              {site.crs}
            </span>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <Tabs defaultValue="design" className="h-full">
            <TabsList className="bg-slate-900 border border-slate-800">
              <TabsTrigger value="design" className="text-xs"><Ruler className="mr-1 h-3.5 w-3.5" /> Design</TabsTrigger>
              <TabsTrigger value="targets" className="text-xs"><Target className="mr-1 h-3.5 w-3.5" /> Targets</TabsTrigger>
              <TabsTrigger value="anticollision" className="text-xs"><Shield className="mr-1 h-3.5 w-3.5" /> Anti-Collision</TabsTrigger>
              <TabsTrigger value="reports" className="text-xs"><FileText className="mr-1 h-3.5 w-3.5" /> Reports</TabsTrigger>
              <TabsTrigger value="apps" className="text-xs"><Grid3X3 className="mr-1 h-3.5 w-3.5" /> Apps</TabsTrigger>
            </TabsList>

            <TabsContent value="design" className="mt-4"><DesignTab /></TabsContent>
            <TabsContent value="targets" className="mt-4"><TargetsTab /></TabsContent>
            <TabsContent value="anticollision" className="mt-4">
              <WavePlaceholder
                icon={Shield}
                title="Anti-collision is being rebuilt"
                body="Separation-factor scans against offset wells with ISCWSA instrument error models, ladder and traveling-cylinder plots arrive in a coming update of this program. The previous version could not produce results and has been removed rather than pretend." />
            </TabsContent>
            <TabsContent value="reports" className="mt-4">
              <WavePlaceholder
                icon={FileText}
                title="Report pack is being rebuilt"
                body="Wall plot, survey listing and anti-collision reports on the Petrolord brand arrive later in this program. Use Export CSV on the Design tab for survey listings today." />
            </TabsContent>
            <TabsContent value="apps" className="mt-4"><AnalysisTab wellId={wellbore?.id} /></TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialogs */}
      {siteDialog !== null && (
        <SiteDialog open onOpenChange={(o) => { if (!o) setSiteDialog(null); }} site={siteDialog.site} onSave={handleSaveSite} />
      )}
      {wellboreDialog !== null && (
        <WellboreDialog
          open
          onOpenChange={(o) => { if (!o) setWellboreDialog(null); }}
          site={wellboreDialog.site}
          wellbore={wellboreDialog.wellbore}
          siblings={store.wellbores}
          onSave={handleSaveWellbore}
        />
      )}
      <LegacyImportDialog open={legacyOpen} onOpenChange={setLegacyOpen} userId={user?.id} onImported={async (s) => { await refreshSites(); selectSite(s.id); }} />

      {nameDialog && (
        <Dialog open onOpenChange={(o) => { if (!o) setNameDialog(null); }}>
          <DialogContent className="bg-slate-900 border-slate-700 text-white">
            <DialogHeader>
              <DialogTitle>{nameDialog.kind === 'newDesign' ? 'New design' : 'Rename design'}</DialogTitle>
              {nameDialog.kind === 'newDesign' && (
                <DialogDescription className="text-slate-400">A design is one versioned trajectory plan for {nameDialog.wellbore?.name}.</DialogDescription>
              )}
            </DialogHeader>
            <div>
              <Label className="text-xs">Design name</Label>
              <Input value={nameValue} onChange={(e) => setNameValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleNameDialogSave(); }} className="bg-slate-800 border-slate-700 h-9" autoFocus />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNameDialog(null)} className="border-slate-600 text-slate-300">Cancel</Button>
              <Button onClick={handleNameDialogSave} disabled={!nameValue.trim()} className="bg-[#4CAF50] hover:bg-[#43a047] text-white">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {confirm && (
        <AlertDialog open onOpenChange={(o) => { if (!o) setConfirm(null); }}>
          <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">{confirm.body}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-600 bg-transparent text-slate-300">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { confirm.action(); setConfirm(null); }} className="bg-red-600 text-white hover:bg-red-700">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};

const WellPlanningWithDraft = () => {
  const { selection } = useWellPlanningStore();
  return (
    <WellPlanningProvider wellId={selection.designId}>
      <WellPlanningContent />
    </WellPlanningProvider>
  );
};

const WellPlanning = () => (
  <WellPlanningStoreProvider>
    <WellPlanningWithDraft />
  </WellPlanningStoreProvider>
);

export default WellPlanning;
