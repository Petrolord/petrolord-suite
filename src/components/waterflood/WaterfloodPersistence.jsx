import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, FolderOpen } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';

const TABLE = 'saved_waterflood_projects';

// A missing table means the migration hasn't been deployed yet — give a clear,
// actionable message instead of a raw Postgres error. Match the precise
// undefined_table code (42P01) or a message that names THIS table's relation, so
// unrelated errors (e.g. "column x does not exist" from schema drift) still
// surface their real cause instead of a misleading migration hint.
export const friendlyError = (error) => {
  const msg = error?.message || '';
  const missingTable = error?.code === '42P01' || new RegExp(`relation[^\\n]*${TABLE}[^\\n]*does not exist`, 'i').test(msg);
  if (missingTable) {
    return 'Saving isn\'t set up yet — run the create_saved_waterflood_projects migration.';
  }
  return msg || 'Unexpected error.';
};

/** Save the current inputs (and a results snapshot) as a named project. */
export const SaveProjectDialog = ({ open, onOpenChange, inputs, results }) => {
  const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleSave = async () => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Not signed in', description: 'Sign in to save projects.' });
      return;
    }
    if (!projectName.trim()) {
      toast({ variant: 'destructive', title: 'Project name is required.' });
      return;
    }
    if (!inputs) {
      toast({ variant: 'destructive', title: 'Nothing to save', description: 'Run an analysis first.' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from(TABLE).insert([{
      user_id: user.id,
      project_name: projectName.trim(),
      inputs_data: inputs,
      results_data: results,
    }]);
    setSaving(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Save failed', description: friendlyError(error), duration: 8000 });
      return;
    }
    toast({ title: 'Project saved', description: `"${projectName.trim()}" is saved.` });
    setProjectName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-slate-900 text-white border-slate-700">
        <DialogHeader>
          <DialogTitle>Save project</DialogTitle>
          <DialogDescription>Only your data &amp; configuration are restored on load — results recompute automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="wf-project-name">Project name</Label>
          <Input id="wf-project-name" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="bg-slate-800 border-slate-600" placeholder="e.g. Field A waterflood surveillance" />
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving} className="bg-lime-600 hover:bg-lime-700">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Browse and load / delete the signed-in user's saved projects. */
export const LoadProjectsDrawer = ({ open, onOpenChange, onSelect }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (!open || !user) return undefined;
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from(TABLE)
        .select('id, project_name, inputs_data, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (!active) return;
      setLoading(false);
      if (error) {
        toast({ variant: 'destructive', title: 'Could not load projects', description: friendlyError(error), duration: 8000 });
        setProjects([]);
        return;
      }
      setProjects(data || []);
    })();
    return () => { active = false; };
  }, [open, user, toast]);

  const handleDelete = async (id) => {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) {
      toast({ variant: 'destructive', title: 'Delete failed', description: friendlyError(error) });
      return;
    }
    setProjects((prev) => prev.filter((p) => p.id !== id));
    toast({ title: 'Project deleted' });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-slate-900 text-white border-slate-700">
        <DrawerHeader>
          <DrawerTitle>Load project</DrawerTitle>
          <DrawerDescription>Select a saved project to restore its data &amp; configuration.</DrawerDescription>
        </DrawerHeader>
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-lime-400" /></div>
          ) : projects.length ? (
            <div className="space-y-2">
              {projects.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-md bg-slate-800 hover:bg-slate-700/70">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{p.project_name}</p>
                    <p className="text-xs text-lime-300">{new Date(p.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" onClick={() => { onSelect(p); onOpenChange(false); }}><FolderOpen className="w-4 h-4 mr-1" />Load</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-slate-400 py-8">No saved projects yet.</p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};
