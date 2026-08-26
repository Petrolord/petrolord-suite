import React, { useState } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

const DCAWellSelector = () => {
  const { currentProject, currentWellId, setCurrentWellId, addWell, removeWell } = useDeclineCurve();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newWellName, setNewWellName] = useState('');

  const { wells } = useDeclineCurve();

  // The `wells` dict in context holds exactly the current project's wells
  // (it is replaced wholesale on project open/create). Listing from it is the
  // fix for the old silent add-well bug: addWell wrote into `wells`, but this
  // list used to read `currentProject.wellIds`, which nothing ever populated,
  // so newly added wells never appeared.
  const projectWells = Object.values(wells || {});

  const handleAdd = () => {
    if (newWellName.trim() && currentProject) {
      addWell(newWellName.trim());
      setNewWellName('');
      setIsAddOpen(false);
    }
  };

  if (!currentProject) return (
    <div className="p-4 border border-dashed border-slate-700 rounded text-center text-slate-500 text-sm">
      Select or create a project first
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-xs font-medium text-slate-400 uppercase">Well</label>
        <span className="text-xs text-slate-500">{projectWells.length} wells</span>
      </div>
      
      <div className="flex gap-2">
        <Select value={currentWellId || ''} onValueChange={setCurrentWellId}>
          <SelectTrigger className="flex-1 bg-slate-800 border-slate-700">
            <SelectValue placeholder="Select Well" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            {projectWells.length === 0 ? (
              <SelectItem value="none" disabled>No Wells</SelectItem>
            ) : (
              projectWells.map(w => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" className="bg-slate-800 border-slate-700">
              <Plus size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
            <DialogHeader>
              <DialogTitle>Add New Well</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="Well Name"
                value={newWellName}
                onChange={(e) => setNewWellName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                className="bg-slate-800 border-slate-700"
              />
            </div>
            <DialogFooter>
              <Button onClick={handleAdd} disabled={!newWellName.trim()}>Add Well</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      {currentWellId && (
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full text-red-400 hover:text-red-300 hover:bg-red-900/20 h-6 text-xs"
          onClick={() => {
            if (window.confirm('Remove this well and its production data? You can Undo from the notification for a few seconds.')) {
              removeWell(currentWellId);
            }
          }}
        >
          <Trash2 size={12} className="mr-2" /> Remove Well
        </Button>
      )}
    </div>
  );
};

export default DCAWellSelector;