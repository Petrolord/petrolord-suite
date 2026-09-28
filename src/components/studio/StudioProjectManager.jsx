// Studio shell project manager — project Select + create dialog + guarded
// delete. Props-driven (generalized from DCAProjectManager).
import React, { useState } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useDsTheme } from '@/design/themeContext';

// Inside an opted-in <ThemedApp> scope the adapted Select, Button, Dialog and
// Input carry the theme, so the legacy colour overrides are dropped there;
// outside one every class string is exactly as before.
const LEGACY = {
  label: 'text-xs font-medium text-slate-400 uppercase',
  trigger: 'flex-1 min-w-0 bg-slate-800 border-slate-700 [&>span]:truncate',
  content: 'bg-slate-800 border-slate-700 text-slate-100',
  button: 'bg-slate-800 border-slate-700',
  dialog: 'bg-slate-900 border-slate-700 text-slate-100',
  del: 'bg-slate-800 border-slate-700 text-slate-500 hover:text-red-400',
};
const THEMED = {
  label: 'text-xs font-medium text-pl-muted uppercase',
  trigger: 'flex-1 min-w-0 [&>span]:truncate',
  content: undefined,
  button: undefined,
  dialog: undefined,
  del: 'text-pl-muted hover:text-pl-danger-text',
};

const StudioProjectManager = ({
  projects = [],
  currentProjectId,
  onCreate,
  onOpen,
  onDelete,
  label = 'Project',
  // what one item is called in the placeholder and titles ('case' in Material Balance)
  noun = label.toLowerCase(),
  confirmDeleteMessage = 'Delete this project and its saved data? This cannot be undone.',
  // When creation needs more than a name (e.g. Material Balance Studio cases
  // require fluid system and initial conditions), pass onRequestCreate: the +
  // button then delegates to the app's own dialog instead of the built-in
  // name-only one.
  onRequestCreate,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const ds = useDsTheme();
  const k = ds ? THEMED : LEGACY;
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
      <label className={k.label}>{label}</label>
      <div className="flex gap-2">
        <Select value={currentProjectId || ''} onValueChange={onOpen}>
          <SelectTrigger className={k.trigger} {...(ds ? { 'aria-label': label } : {})}>
            <SelectValue placeholder={`Select ${noun}`} />
          </SelectTrigger>
          <SelectContent className={k.content}>
            {projects.length === 0 ? (
              <SelectItem value="none" disabled>{`No ${noun}s yet`}</SelectItem>
            ) : (
              projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {onRequestCreate ? (
          <Button
            variant="outline" size="icon"
            className={k.button}
            title={`Create new ${noun}`}
            onClick={onRequestCreate}
          >
            <Plus size={16} />
          </Button>
        ) : (
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" className={k.button} title={`Create new ${noun}`} {...(ds ? { 'aria-label': `Create new ${noun}` } : {})}>
              <Plus size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent className={k.dialog}>
            <DialogHeader>
              <DialogTitle>{`Create new ${noun}`}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder={`${noun[0].toUpperCase()}${noun.slice(1)} name`}
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                className={k.button}
              />
            </div>
            <DialogFooter>
              <Button onClick={handleCreate}>{`Create ${noun}`}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}

        {currentProjectId && (
          <Button
            variant="outline" size="icon"
            className={k.del}
            title={`Delete current ${noun}`}
            {...(ds ? { 'aria-label': `Delete current ${noun}` } : {})}
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
