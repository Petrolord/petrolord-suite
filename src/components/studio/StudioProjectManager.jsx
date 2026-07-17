// Studio shell project manager — project Select + create dialog + guarded
// delete. Props-driven (generalized from DCAProjectManager).
import React, { useState } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

const StudioProjectManager = ({
  projects = [],
  currentProjectId,
  onCreate,
  onOpen,
  onDelete,
  label = 'Project',
  confirmDeleteMessage = 'Delete this project and its saved data? This cannot be undone.',
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const handleCreate = () => {
    if (newProjectName) {
      onCreate(newProjectName);
      setNewProjectName('');
      setIsCreateOpen(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-slate-400 uppercase">{label}</label>
      <div className="flex gap-2">
        <Select value={currentProjectId || ''} onValueChange={onOpen}>
          <SelectTrigger className="flex-1 bg-slate-800 border-slate-700">
            <SelectValue placeholder="Select Project" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            {projects.length === 0 ? (
              <SelectItem value="none" disabled>No Projects</SelectItem>
            ) : (
              projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" className="bg-slate-800 border-slate-700" title="Create new project">
              <Plus size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="Project Name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                className="bg-slate-800 border-slate-700"
              />
            </div>
            <DialogFooter>
              <Button onClick={handleCreate}>Create Project</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {currentProjectId && (
          <Button
            variant="outline" size="icon"
            className="bg-slate-800 border-slate-700 text-slate-500 hover:text-red-400"
            title="Delete current project"
            onClick={() => {
              if (window.confirm(confirmDeleteMessage)) {
                onDelete(currentProjectId);
              }
            }}
          >
            <Trash2 size={14} />
          </Button>
        )}
      </div>
    </div>
  );
};

export default StudioProjectManager;
