import React, { useState } from 'react';
import { useReservoirCalc } from '../../contexts/ReservoirCalcContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Layers, Plus, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// Header control for the reservoirs inside the open project: pick one to view
// its inputs and results, add a new case, rename or delete the current one.
// Switching folds the on-screen workspace into its entry first, so nothing is
// lost; the project Save button persists all reservoirs together.
const ReservoirSwitcher = () => {
    const { state, addReservoir, switchReservoir, renameReservoir, deleteReservoir } = useReservoirCalc();
    const { toast } = useToast();

    const [dialog, setDialog] = useState(null); // null | 'add' | 'rename'
    const [name, setName] = useState('');

    // Before any reservoir action runs, the workspace is an implicit single
    // reservoir; show it as such.
    const list = state.reservoirs?.length
        ? state.reservoirs
        : [{ id: '__current', name: state.reservoirName || 'Reservoir 1' }];
    const activeId = state.activeReservoirId || '__current';
    const active = list.find(r => r.id === activeId) || list[0];

    const openAdd = () => {
        setName(`Reservoir ${list.length + 1}`);
        setDialog('add');
    };
    const openRename = () => {
        setName(active?.name || '');
        setDialog('rename');
    };

    const confirmDialog = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        if (dialog === 'add') {
            addReservoir(trimmed);
            toast({ title: 'Reservoir added', description: `"${trimmed}" is now open. Save the project to keep it.` });
        } else if (dialog === 'rename') {
            renameReservoir(state.activeReservoirId, trimmed);
        }
        setDialog(null);
    };

    const handleDelete = () => {
        if (list.length <= 1) {
            toast({ variant: 'destructive', title: 'Cannot delete', description: 'A project needs at least one reservoir.' });
            return;
        }
        if (window.confirm(`Delete reservoir "${active?.name}"? Its inputs and results will be removed from this project.`)) {
            deleteReservoir(activeId);
        }
    };

    return (
        <div className="flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-blue-400 hidden md:block" />
            <Select
                value={activeId}
                onValueChange={(id) => { if (id !== '__current') switchReservoir(id); }}
            >
                <SelectTrigger className="h-8 w-[150px] text-xs bg-slate-800 border-slate-700 text-slate-200">
                    <SelectValue placeholder="Reservoir" />
                </SelectTrigger>
                <SelectContent>
                    {list.map(r => (
                        <SelectItem key={r.id} value={r.id} className="text-xs">{r.name || 'Unnamed reservoir'}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" onClick={openAdd} title="Add reservoir">
                <Plus className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white hidden md:flex" onClick={openRename} title="Rename reservoir">
                <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-400 hidden md:flex" onClick={handleDelete} title="Delete reservoir">
                <Trash2 className="w-3.5 h-3.5" />
            </Button>

            <Dialog open={dialog !== null} onOpenChange={(o) => { if (!o) setDialog(null); }}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-[380px]">
                    <DialogHeader>
                        <DialogTitle className="text-base">{dialog === 'add' ? 'Add Reservoir' : 'Rename Reservoir'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        <Label className="text-xs">Reservoir name</Label>
                        <Input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') confirmDialog(); }}
                            autoFocus
                            className="bg-slate-950 border-slate-700"
                        />
                        {dialog === 'add' && (
                            <p className="text-[11px] text-slate-500">The current reservoir is kept in this project. The new one starts with default inputs.</p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
                        <Button onClick={confirmDialog} className="bg-blue-600 hover:bg-blue-700">{dialog === 'add' ? 'Add' : 'Rename'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ReservoirSwitcher;
