// Studio shell project manager — project Select + create dialog + guarded
// delete. Props-driven (generalized from DCAProjectManager).
import React, { useState } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

// Design system: the adapted Select, Button and Dialog supply the theme.

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
  const outlineBtn = '';

  const handleCreate = () => {
    if (newProjectName) {
      onCreate(newProjectName);
      setNewProjectName('');
      setIsCreateOpen(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-pl-muted uppercase">{label}</label>
      <div className="flex gap-2">
        <Select value={currentProjectId || ''} onValueChange={onOpen}>
          <SelectTrigger className="flex-1 min-w-0 [&>span]:truncate" aria-label={label}>
            <SelectValue placeholder={`Select ${noun}`} />
          </SelectTrigger>
          <SelectContent className={undefined}>
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
            aria-label={`Create new ${noun}`}
            onClick={onRequestCreate}
          >
            <Plus size={16} />
          </Button>
        ) : (
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" className={outlineBtn} title={`Create new ${noun}`} aria-label={`Create new ${noun}`}>
              <Plus size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent className={undefined}>
            <DialogHeader>
              <DialogTitle>{`Create new ${noun}`}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder={`${noun[0].toUpperCase()}${noun.slice(1)} name`}
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                className={undefined}
                aria-label={`${noun[0].toUpperCase()}${noun.slice(1)} name`}
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
            className="text-pl-muted hover:text-pl-danger-text"
            title={`Delete current ${noun}`}
            aria-label={`Delete current ${noun}`}
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
