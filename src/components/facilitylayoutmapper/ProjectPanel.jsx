import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openStateRow, writeStamped } from '@/lib/stateVersion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Save, FolderOpen, Trash2, Loader2 } from 'lucide-react';

// PP0 state kind (docs/scope/ProjectPortability-PLAN.md §4.3)
const FACILITY_LAYOUT_KIND = 'facility-layout';
registerStateKind(FACILITY_LAYOUT_KIND, { current: 1, label: 'facility layout' });

const ProjectPanel = ({ layers, onLoadLayout }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [projectName, setProjectName] = useState('');
  const [savedProjects, setSavedProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);

  const fetchProjects = async () => {
    if (!user) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('facility_layouts')
      .select('id, project_name, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: 'Error fetching projects', description: error.message });
    } else {
      setSavedProjects(data);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!projectName) {
      toast({ variant: 'destructive', title: 'Project name required' });
      return;
    }
    if (layers.length === 0) {
      toast({ variant: 'destructive', title: 'Layout is empty' });
      return;
    }
    if (!user) {
      toast({ variant: 'destructive', title: 'You must be logged in to save' });
      return;
    }

    const { error } = await writeStamped(FACILITY_LAYOUT_KIND,
      { project_name: projectName, layout_data: layers, user_id: user.id },
      (row) => supabase.from('facility_layouts').insert([row]));

    if (error) {
      toast({ variant: 'destructive', title: 'Error saving project', description: error.message });
    } else {
      toast({ title: 'Project Saved!', description: `"${projectName}" has been saved.` });
      setProjectName('');
    }
  };

  const handleLoad = async (projectId) => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('facility_layouts')
      .select('layout_data, schema_version')
      .eq('id', projectId)
      .single();
    
    if (error) {
        toast({ variant: 'destructive', title: 'Error loading project', description: error.message });
    } else if (data) {
        onLoadLayout(openStateRow(FACILITY_LAYOUT_KIND, data).layout_data);
        setIsLoadDialogOpen(false);
    }
    setIsLoading(false);
  };
  
  const handleDelete = async (projectId) => {
      if (!window.confirm("Are you sure you want to delete this project? This action cannot be undone.")) return;
      
      const { error } = await supabase.from('facility_layouts').delete().eq('id', projectId);
      if (error) {
          toast({ variant: 'destructive', title: 'Error deleting project', description: error.message });
      } else {
          toast({ title: 'Project Deleted' });
          fetchProjects();
      }
  };


  return (
    <div className="space-y-3">
      <Dialog>
        <DialogTrigger asChild>
          <Button className="w-full justify-start bg-slate-800 hover:bg-slate-700 text-white">
            <Save className="w-4 h-4 mr-2" /> Save Project
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Save Layout</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="project-name" className="text-right text-white">Project Name</Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="col-span-3 bg-slate-800 border-slate-600 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button onClick={handleSave} className="bg-teal-600 hover:bg-teal-700 text-white">Save</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isLoadDialogOpen} onOpenChange={setIsLoadDialogOpen}>
        <DialogTrigger asChild>
          <Button onClick={fetchProjects} className="w-full justify-start bg-slate-800 hover:bg-slate-700 text-white">
            <FolderOpen className="w-4 h-4 mr-2" /> Load Project
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Load Layout</DialogTitle>
          </DialogHeader>
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
            </div>
          ) : savedProjects.length > 0 ? (
            <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
                {savedProjects.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-slate-800 hover:bg-slate-700/50">
                        <div className="flex-grow cursor-pointer" onClick={() => handleLoad(p.id)}>
                            <p className="font-semibold text-white">{p.project_name}</p>
                            <p className="text-xs text-slate-400">
                                Saved on: {new Date(p.created_at).toLocaleDateString()}
                            </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} className="text-red-500 hover:bg-red-500/10 hover:text-red-400">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">No saved projects found.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectPanel;