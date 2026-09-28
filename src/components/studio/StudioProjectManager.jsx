// Studio shell project manager — project Select + create dialog + guarded
// delete. Props-driven (generalized from DCAProjectManager).
import React, { useState } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useStudioTheme } from './studioTheme';

// Design system: inside a <ThemedApp> scope the adapted Select, Button and
// Dialog supply the theme; the legacy slate overrides apply only outside one.

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
  const [newProjectName, setNewProjectName] = useState('');
  const { ds, tc } = useStudioTheme();
  const outlineBtn = tc('bg-slate-800 border-slate-700', '');

  const handleCreate = () => {
    if (newProjectName) {
      onCreate(newProjectName);
      setNewProjectName('');
      setIsCreateOpen(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className={tc('text-xs font-medium text-slate-400 uppercase', 'text-xs font-medium text-pl-muted uppercase')}>{label}</label>
      <div className="flex gap-2">
        <Select value={currentProjectId || ''} onValueChange={onOpen}>
          <SelectTrigger className={tc('flex-1 min-w-0 bg-slate-800 border-slate-700 [&>span]:truncate', 'flex-1 min-w-0 [&>span]:truncate')} aria-label={ds ? label : undefined}>
            <SelectValue placeholder={`Select ${noun}`} />
          </SelectTrigger>
          <SelectContent className={tc('bg-slate-800 border-slate-700 text-slate-100', undefined)}>
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
            className={outlineBtn}
            title={`Create new ${noun}`}
            aria-label={ds ? `Create new ${noun}` : undefined}
            onClick={onRequestCreate}
          >
            <Plus size={16} />
          </Button>
        ) : (
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" className={outlineBtn} title={`Create new ${noun}`} aria-label={ds ? `Create new ${noun}` : undefined}>
              <Plus size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent className={tc('bg-slate-900 border-slate-700 text-slate-100', undefined)}>
            <DialogHeader>
              <DialogTitle>{`Create new ${noun}`}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder={`${noun[0].toUpperCase()}${noun.slice(1)} name`}
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                className={tc('bg-slate-800 border-slate-700', undefined)}
                aria-label={ds ? `${noun[0].toUpperCase()}${noun.slice(1)} name` : undefined}
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
            className={tc('bg-slate-800 border-slate-700 text-slate-500 hover:text-red-400', 'text-pl-muted hover:text-pl-danger-text')}
            title={`Delete current ${noun}`}
            aria-label={ds ? `Delete current ${noun}` : undefined}
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
