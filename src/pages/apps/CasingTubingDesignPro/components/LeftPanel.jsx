import React, { useState } from 'react';
import { useCasingTubingDesign } from '../contexts/CasingTubingDesignContext';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  PlusCircle, Copy, Save, Trash2, ChevronLeft, ChevronRight,
  Database, FileText, FolderOpen, MapPin,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import WellboreDetails from '../../TorqueDragStudio/components/WellboreDetails';

const LeftPanel = () => {
  const {
    sites, selectedSite, selectSite,
    wellbores, selectedWellbore, selectWellbore,
    trajectory, caseRows, selectedCase, selectCase,
    createCase, saveCase, duplicateCase, deleteCase,
    dirty, busy, results, draftInfo, discardDraft,
  } = useCasingTubingDesign();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [isNewCaseDialogOpen, setIsNewCaseDialogOpen] = useState(false);

  const handleCreateCase = async () => {
    if (newCaseName) {
      await createCase(newCaseName);
      setNewCaseName('');
      setIsNewCaseDialogOpen(false);
    }
  };

  const handleSave = () => {
    if (!results) { saveCase(null); return; }
    saveCase({
      results: { kpis: results.kpis, warnings: results.warnings },
      summary: {
        overall: results.kpis.overall,
        minBurstSF: results.kpis.minBurst?.value ?? null,
        minCollapseSF: results.kpis.minCollapse?.value ?? null,
        minTriaxialSF: results.kpis.minTriaxial?.value ?? null,
      },
    });
  };

  if (isCollapsed) {
    return (
      <div className="w-14 bg-pl-surface border-r border-pl-border flex flex-col items-center py-4 space-y-6 shrink-0 transition-all duration-300 z-10">
        <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} className="text-pl-muted hover:text-pl-text">
          <ChevronRight className="w-5 h-5" />
        </Button>
        <div className="h-px w-8 bg-pl-border" />
        <Button variant="ghost" size="icon" title="Wellbores">
          <Database className="w-5 h-5 text-pl-muted hover:text-pl-text transition-colors" />
        </Button>
        <Button variant="ghost" size="icon" title="Design cases">
          <FileText className="w-5 h-5 text-pl-muted hover:text-pl-text transition-colors" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-72 bg-pl-surface border-r border-pl-border flex flex-col shrink-0 transition-all duration-300 z-10">
      <div className="p-4 border-b border-pl-border flex justify-between items-center">
        <span className="text-sm font-semibold text-pl-text flex items-center">
          <FolderOpen className="w-4 h-4 mr-2 text-pl-muted" />
          Project Explorer
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCollapsed(true)}>
          <ChevronLeft className="w-4 h-4 text-pl-muted" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <div className="space-y-3">
            <Label className="text-[10px] text-pl-muted uppercase font-bold tracking-wider flex items-center">
              <MapPin className="w-3 h-3 mr-1" /> Site
            </Label>
            <Select
              value={selectedSite?.id || ''}
              onValueChange={(val) => selectSite(val)}
            >
              <SelectTrigger data-testid="ct-site-picker" className="h-9">
                <SelectValue placeholder="Choose a site..." />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id} className="cursor-pointer">
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-[10px] text-pl-muted uppercase font-bold tracking-wider">Wellbore</Label>
            <Select
              value={selectedWellbore?.id || ''}
              onValueChange={(val) => selectWellbore(val)}
              disabled={!selectedSite}
            >
              <SelectTrigger data-testid="ct-wellbore-picker" className="h-9">
                <SelectValue placeholder={selectedSite ? 'Choose a wellbore...' : 'Select site first'} />
              </SelectTrigger>
              <SelectContent>
                {wellbores.map((wb) => (
                  <SelectItem key={wb.id} value={wb.id} className="cursor-pointer">
                    {wb.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedWellbore && trajectory && (
              <WellboreDetails trajectory={trajectory} wellbore={selectedWellbore} testPrefix="ct" />
            )}
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-[10px] text-pl-muted uppercase font-bold tracking-wider">Design Case</Label>
              <Dialog open={isNewCaseDialogOpen} onOpenChange={setIsNewCaseDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    data-testid="ct-new-case"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-[10px] text-pl-primary-text hover:text-pl-primary-text-hover hover:bg-pl-sunken"
                    disabled={!selectedWellbore || !trajectory?.stations?.length}
                  >
                    <PlusCircle className="w-3 h-3 mr-1" /> NEW
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New Design Case</DialogTitle>
                    <DialogDescription className="text-pl-muted">
                      Create a casing and tubing design case for {selectedWellbore?.name}.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Label>Case Name</Label>
                    <Input
                      data-testid="ct-new-case-name"
                      value={newCaseName}
                      onChange={(e) => setNewCaseName(e.target.value)}
                      placeholder="e.g. Production Casing Redesign"
                      className="mt-2"
                    />
                  </div>
                  <DialogFooter>
                    <Button data-testid="ct-new-case-create" onClick={handleCreateCase} disabled={busy}>Create</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Select
              value={selectedCase?.id || ''}
              onValueChange={(val) => selectCase(val)}
              disabled={!selectedWellbore}
            >
              <SelectTrigger data-testid="ct-case-picker" className="h-9">
                <SelectValue placeholder={selectedWellbore ? 'Select case...' : 'Select wellbore first'} />
              </SelectTrigger>
              <SelectContent>
                {caseRows.length === 0 ? (
                  <div className="p-2 text-xs text-pl-muted text-center">No design cases yet</div>
                ) : (
                  caseRows.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="cursor-pointer">
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="h-px w-full bg-pl-border" />

          <div className="space-y-2">
            <Label className="text-[10px] text-pl-muted uppercase font-bold tracking-wider mb-2 block">Actions</Label>
            <Button
              data-testid="ct-save-case"
              className="w-full justify-start"
              disabled={!selectedCase || busy || !dirty}
              onClick={handleSave}
            >
              <Save className="w-4 h-4 mr-2" /> {dirty ? 'Save Design' : 'Saved'}
            </Button>
            {draftInfo && (
              <div className="rounded border border-pl-warning/40 bg-pl-warning-bg p-2 text-[11px] text-pl-warning-text" data-testid="ct-draft-restored">
                Unsaved changes restored from {new Date(draftInfo.savedAt).toLocaleTimeString()}. Save keeps them.
                <button
                  type="button"
                  data-testid="ct-discard-draft"
                  className="ml-2 underline hover:text-pl-text"
                  onClick={discardDraft}
                >
                  Discard
                </button>
              </div>
            )}
            {dirty && !draftInfo && (
              <p className="text-[10px] text-pl-muted" data-testid="ct-draft-note">Unsaved edits are kept in this browser until you save.</p>
            )}
            <Button
              data-testid="ct-duplicate-case"
              variant="outline"
              className="w-full justify-start"
              disabled={!selectedCase || busy}
              onClick={duplicateCase}
            >
              <Copy className="w-4 h-4 mr-2" /> Duplicate Case
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={!selectedCase || busy}
              onClick={() => deleteCase(selectedCase.id)}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete Case
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default LeftPanel;
