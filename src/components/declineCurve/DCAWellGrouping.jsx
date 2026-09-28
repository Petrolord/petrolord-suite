import React, { useState } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { CHECKBOX_THEMED } from './dsClasses';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Layers, Plus, Users, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// R1: group creation now has a real well multi-select (the pre-R1 UI
// called createWellGroup with a bare string, so no group could ever be
// created). The candidate list honors the Well Filters panel.
const DCAWellGrouping = () => {
  const {
    wells, filteredWellIds, wellGroups, createWellGroup, deleteWellGroup,
    selectedWellGroup, setSelectedWellGroup,
  } = useDeclineCurve();
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const toggleWell = (id) => setSelectedIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleCreate = () => {
    if (!newGroupName || selectedIds.length === 0) return;
    createWellGroup({ name: newGroupName, wellIds: selectedIds });
    setNewGroupName('');
    setSelectedIds([]);
  };

  const candidates = filteredWellIds.map(id => wells[id]).filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-pl-muted mb-2">
        <Layers size={14} />
        <span className="text-xs font-medium uppercase tracking-wider">Well Groups</span>
      </div>

      <div className="space-y-2">
        <Input
          placeholder="New Group Name"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          className="h-8 text-xs"
        />
        <div className="rounded border border-pl-border bg-pl-surface max-h-[130px] overflow-y-auto p-1">
          {candidates.length === 0 ? (
            <div className="text-[11px] text-pl-muted italic p-2">No wells match the filters</div>
          ) : (
            candidates.map(w => (
              <label key={w.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-pl-sunken cursor-pointer">
                <Checkbox checked={selectedIds.includes(w.id)} onCheckedChange={() => toggleWell(w.id)} className={CHECKBOX_THEMED} />
                <span className="text-xs text-pl-text truncate">{w.name}</span>
                <span className="text-[10px] text-pl-muted ml-auto capitalize">{w.type}</span>
              </label>
            ))
          )}
        </div>
        <Button
          onClick={handleCreate}
          disabled={!newGroupName || selectedIds.length === 0}
          size="sm"
          className="h-8 w-full disabled:opacity-40"
        >
          <Plus size={14} className="mr-1" /> Create group ({selectedIds.length} wells)
        </Button>
      </div>

      <ScrollArea className="h-[160px] pr-2">
        <div className="space-y-2">
          {wellGroups.length === 0 ? (
            <div className="text-center py-4 text-pl-muted text-xs italic">No groups created</div>
          ) : (
            wellGroups.map(group => (
              <div
                key={group.id}
                className={`p-2 rounded border text-sm flex justify-between items-center cursor-pointer transition-colors ${selectedWellGroup === group.id ? 'bg-pl-primary/10 border-pl-primary' : 'bg-pl-surface border-pl-border hover:border-pl-border-strong'}`}
                onClick={() => setSelectedWellGroup(group.id)}
              >
                <div>
                  <div className="font-medium text-pl-text">{group.name}</div>
                  <div className="text-[10px] text-pl-muted flex items-center gap-1">
                    <Users size={10} /> {group.wellIds.length} wells
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {selectedWellGroup === group.id && (
                    <Badge variant="outline" className="border-pl-primary text-pl-primary-text text-[10px] h-5">Active</Badge>
                  )}
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6 text-pl-muted hover:text-pl-danger-text"
                    aria-label={`Delete group ${group.name}`}
                    onClick={(e) => { e.stopPropagation(); deleteWellGroup(group.id); }}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default DCAWellGrouping;
