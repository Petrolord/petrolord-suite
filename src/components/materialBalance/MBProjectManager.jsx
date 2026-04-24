import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMaterialBalance } from '@/contexts/MaterialBalanceContext';
import { Trash2, Search, Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const MBProjectManager = ({ isOpen, onClose }) => {
  const { projectList, loadProjectAction, createProject, deleteProject, currentProject } = useMaterialBalance();
  const [searchTerm, setSearchTerm] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const filteredProjects = projectList?.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleLoad = async (id) => {
    if (loadProjectAction) {
      await loadProjectAction(id);
    }
    onClose();
  };

  const handleCreate = async () => {
    if (!newProjectName) return;
    if (createProject) {
      await createProject(newProjectName);
    }
    setNewProjectName('');
    setIsCreating(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Project Manager</DialogTitle>
        </DialogHeader>
        
        {!isCreating ? (
          <>
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                <Input 
                  placeholder="Search projects..." 
                  className="pl-8 bg-slate-900 border-slate-800 text-slate-100 placeholder:text-slate-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button onClick={() => setIsCreating(true)} className="bg-blue-600 hover:bg-blue-500 text-white">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {filteredProjects.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No projects found.</p>
                ) : (
                  filteredProjects.map(p => (
                    <div key={p.id} className={`flex items-center justify-between p-3 rounded-lg border ${currentProject?.id === p.id ? 'bg-blue-900/20 border-blue-800' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}>
                      <div className="flex-1 cursor-pointer" onClick={() => handleLoad(p.id)}>
                        <div className="font-medium text-sm text-slate-200">{p.name}</div>
                        <div className="text-xs text-slate-500">Last modified: {new Date(p.lastModifiedDate).toLocaleDateString()}</div>
                      </div>
                      <Button variant="ghost" size="icon" className="text-slate-500 hover:text-red-400" onClick={(e) => { 
                        e.stopPropagation(); 
                        if (deleteProject) deleteProject(p.id); 
                      }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Project Name</Label>
              <Input 
                value={newProjectName} 
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Enter project name"
                className="bg-slate-900 border-slate-800 text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsCreating(false)} className="text-slate-300 hover:text-white hover:bg-slate-800">Cancel</Button>
              <Button onClick={handleCreate} disabled={!newProjectName} className="bg-green-600 hover:bg-green-500 text-white">Create Project</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MBProjectManager;