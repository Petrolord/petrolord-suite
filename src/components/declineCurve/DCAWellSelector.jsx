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
    <div className="p-4 border border-dashed border-pl-border rounded text-center text-pl-muted text-sm">
      Select or create a project first
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-xs font-medium text-pl-muted uppercase">Well</label>
        <span className="text-xs text-pl-muted">{projectWells.length} wells</span>
      </div>
      
      <div className="flex gap-2">
        <Select value={currentWellId || ''} onValueChange={setCurrentWellId}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select Well" />
          </SelectTrigger>
          <SelectContent>
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
            <Button variant="outline" size="icon" aria-label="Add well" title="Add well">
              <Plus size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Well</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="Well Name"
                value={newWellName}
                onChange={(e) => setNewWellName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
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
          className="w-full text-pl-danger-text hover:bg-pl-danger-bg h-6 text-xs"
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