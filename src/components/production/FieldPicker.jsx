// Field picker + lifecycle for the production studios (left rail).
// Fields are po_fields spine rows — shared data, not project payload —
// so every production app picks one the same way. Sharing follows the
// geo_wells model: the owner stamps the org for read-only visibility.
//
// Pure props: each studio's context supplies the handlers.
import React, { useState } from 'react';
import { Plus, Trash2, Share2, Lock, Users } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';

const FieldPicker = ({
  fields = [],
  fieldId = null,
  currentField = null,
  canEditField = false,
  onSelect,
  onCreate,
  onDelete,
  onShare,
  onUnshare,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName('');
    setIsCreateOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={fieldId || ''} onValueChange={onSelect}>
          <SelectTrigger className="flex-1 bg-slate-800 border-slate-700">
            <SelectValue placeholder="Select field" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            {fields.length === 0 ? (
              <SelectItem value="none" disabled>No fields yet</SelectItem>
            ) : (
              fields.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}{f.is_own ? '' : ' (shared with you)'}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {onCreate && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="bg-slate-800 border-slate-700" title="Create field">
                <Plus size={16} />
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
              <DialogHeader><DialogTitle>Create field</DialogTitle></DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="Field name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              <DialogFooter><Button onClick={handleCreate}>Create field</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {currentField && canEditField && onDelete && (
          <Button
            variant="outline" size="icon"
            className="bg-slate-800 border-slate-700 text-slate-500 hover:text-red-400"
            title="Delete field and ALL its production data"
            onClick={() => {
              if (window.confirm(`Delete field "${currentField.name}" and all its wells, ledger, tests and deferments? This cannot be undone.`)) {
                onDelete(currentField.id);
              }
            }}
          >
            <Trash2 size={14} />
          </Button>
        )}
      </div>

      {currentField && (
        <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-800/60 border border-slate-700/60 rounded px-2 py-1.5">
          {currentField.organization_id ? (
            <span className="flex items-center gap-1.5 text-sky-400"><Users size={12} /> Shared with your organization</span>
          ) : (
            <span className="flex items-center gap-1.5"><Lock size={12} /> Private</span>
          )}
          {canEditField && (
            currentField.organization_id ? (
              onUnshare && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-400" onClick={onUnshare}>
                  Unshare
                </Button>
              )
            ) : (
              onShare && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-400" onClick={onShare}>
                  <Share2 size={12} className="mr-1" /> Share
                </Button>
              )
            )
          )}
        </div>
      )}
      {currentField && !canEditField && (
        <p className="text-[11px] text-slate-500">
          Shared field: read-only. Imports, edits and allocation write-backs are the owner's.
        </p>
      )}
    </div>
  );
};

export default FieldPicker;
