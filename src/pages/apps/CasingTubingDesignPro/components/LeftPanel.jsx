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

const LeftPanel = () => {
  const {
    sites, selectedSite, selectSite,
    wellbores, selectedWellbore, selectWellbore,
    trajectory, caseRows, selectedCase, selectCase,
    createCase, saveCase, duplicateCase, deleteCase,
    dirty, busy, results,
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
      <div className="w-14 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 space-y-6 shrink-0 transition-all duration-300 z-10">
        <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} className="text-slate-400 hover:text-white">
          <ChevronRight className="w-5 h-5" />
        </Button>
        <div className="h-px w-8 bg-slate-800" />
        <Button variant="ghost" size="icon" title="Wellbores">
          <Database className="w-5 h-5 text-slate-400 hover:text-lime-400 transition-colors" />
        </Button>
        <Button variant="ghost" size="icon" title="Design cases">
          <FileText className="w-5 h-5 text-slate-400 hover:text-lime-400 transition-colors" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-72 bg-slate-950 border-r border-slate-800 flex flex-col shrink-0 transition-all duration-300 z-10">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
        <span className="text-sm font-semibold text-slate-200 flex items-center">
          <FolderOpen className="w-4 h-4 mr-2 text-lime-500" />
          Project Explorer
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCollapsed(true)}>
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <div className="space-y-3">
            <Label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center">
              <MapPin className="w-3 h-3 mr-1" /> Site
            </Label>
            <Select
              value={selectedSite?.id || ''}
              onValueChange={(val) => selectSite(val)}
            >
              <SelectTrigger data-testid="ct-site-picker" className="bg-slate-900 border-slate-700 text-slate-200 h-9">
                <SelectValue placeholder="Choose a site..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id} className="text-slate-300 focus:bg-slate-800 focus:text-white cursor-pointer">
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Wellbore</Label>
            <Select
              value={selectedWellbore?.id || ''}
              onValueChange={(val) => selectWellbore(val)}
              disabled={!selectedSite}
            >
              <SelectTrigger data-testid="ct-wellbore-picker" className="bg-slate-900 border-slate-700 text-slate-200 h-9">
                <SelectValue placeholder={selectedSite ? 'Choose a wellbore...' : 'Select site first'} />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {wellbores.map((wb) => (
                  <SelectItem key={wb.id} value={wb.id} className="text-slate-300 focus:bg-slate-800 focus:text-white cursor-pointer">
                    {wb.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedWellbore && trajectory && !trajectory.stations.length && (
              <p className="text-[10px] text-amber-400">
                No definitive design with saved stations. Save one in Well Design Studio first.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Design Case</Label>
              <Dialog open={isNewCaseDialogOpen} onOpenChange={setIsNewCaseDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    data-testid="ct-new-case"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-[10px] text-lime-400 hover:text-lime-300 hover:bg-slate-800"
                    disabled={!selectedWellbore || !trajectory?.stations?.length}
                  >
                    <PlusCircle className="w-3 h-3 mr-1" /> NEW
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-slate-900 border-slate-700 text-white">
                  <DialogHeader>
                    <DialogTitle>New Design Case</DialogTitle>
                    <DialogDescription className="text-slate-400">
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
                      className="bg-slate-800 border-slate-700 mt-2"
                    />
                  </div>
                  <DialogFooter>
                    <Button data-testid="ct-new-case-create" onClick={handleCreateCase} disabled={busy} className="bg-lime-600 hover:bg-lime-700 text-white">Create</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Select
              value={selectedCase?.id || ''}
              onValueChange={(val) => selectCase(val)}
              disabled={!selectedWellbore}
            >
              <SelectTrigger data-testid="ct-case-picker" className="bg-slate-900 border-slate-700 text-slate-200 h-9">
                <SelectValue placeholder={selectedWellbore ? 'Select case...' : 'Select wellbore first'} />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {caseRows.length === 0 ? (
                  <div className="p-2 text-xs text-slate-500 text-center">No design cases yet</div>
                ) : (
                  caseRows.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-slate-300 focus:bg-slate-800 focus:text-white cursor-pointer">
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="h-px w-full bg-slate-800" />

          <div className="space-y-2">
            <Label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2 block">Actions</Label>
            <Button
              data-testid="ct-save-case"
              className="w-full justify-start bg-lime-600 hover:bg-lime-700 text-white shadow-lg shadow-lime-900/20"
              disabled={!selectedCase || busy || !dirty}
              onClick={handleSave}
            >
              <Save className="w-4 h-4 mr-2" /> {dirty ? 'Save Design' : 'Saved'}
            </Button>
            <Button
              data-testid="ct-duplicate-case"
              variant="outline"
              className="w-full justify-start text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white"
              disabled={!selectedCase || busy}
              onClick={duplicateCase}
            >
              <Copy className="w-4 h-4 mr-2" /> Duplicate Case
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-slate-300 border-slate-700 hover:bg-red-900/30 hover:text-red-200"
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
