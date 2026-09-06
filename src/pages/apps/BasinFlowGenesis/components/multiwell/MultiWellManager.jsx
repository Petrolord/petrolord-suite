import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Trash2, MapPin, Edit2, Check, X, Calendar } from 'lucide-react';
import { useMultiWell } from '@/pages/apps/BasinFlowGenesis/contexts/MultiWellContext';
import { useBasinFlow } from '@/pages/apps/BasinFlowGenesis/contexts/BasinFlowContext';
import { useToast } from '@/components/ui/use-toast';

const StatusBadge = ({ status }) => {
    const styles = {
        'calibrated': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
        'in-progress': 'bg-amber-500/20 text-amber-400 border-amber-500/50',
        'not-started': 'bg-slate-500/20 text-slate-400 border-slate-500/50'
    };
    
    const labels = {
        'calibrated': 'Calibrated',
        'in-progress': 'In Progress',
        'not-started': 'Not Started'
    };

    return (
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 border ${styles[status] || styles['not-started']}`}>
            {labels[status] || 'Unknown'}
        </Badge>
    );
};

const MultiWellManager = () => {
    const { state: mwState, addWell, removeWell, setActiveWell, updateWell, saveWellData, getWellData } = useMultiWell();
    const { state: bfState, dispatch: bfDispatch } = useBasinFlow();
    const { toast } = useToast();
    
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [deleteId, setDeleteId] = useState(null);
    
    // New Well Dialog State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newWellData, setNewWellData] = useState({
        name: '',
        location: '',
        status: 'not-started',
        description: '',
        depthMin: 0,
        depthMax: 5000
    });

    // Initialize active well if none selected but we have wells
    useEffect(() => {
        if (!mwState.activeWellId && mwState.wells && mwState.wells.length > 0) {
            handleSwitchWell(mwState.wells[0].id);
        } else if (mwState.wells && mwState.wells.length === 0) {
            // Create default first well
            addWell({ name: 'Exploration Well 1', status: 'not-started' });
        }
    }, [mwState.wells]); // Depend on wells to ensure we catch updates

    const handleSwitchWell = (targetId) => {
        if (targetId === mwState.activeWellId) return;

        // 1. Save current well data to MultiWell store
        if (mwState.activeWellId) {
            const currentData = {
                stratigraphy: bfState.stratigraphy,
                heatFlow: bfState.heatFlow,
                erosionEvents: bfState.erosionEvents,
                settings: bfState.settings,
                calibration: bfState.calibration,
            };
            saveWellData(mwState.activeWellId, currentData);
        }

        // 2. Load new well data
        const targetWellData = getWellData(targetId);
        if (targetWellData) {
            setActiveWell(targetId);
            bfDispatch({ type: 'LOAD_PROJECT', payload: {
                name: targetWellData.name,
                stratigraphy: targetWellData.stratigraphy || [],
                heatFlow: targetWellData.heatFlow || { type: 'constant', value: 60, history: [] },
                erosionEvents: targetWellData.erosionEvents || [],
                settings: targetWellData.settings || {},
                calibration: targetWellData.calibration || { ro: [], temp: [] }
            }});
            toast({ description: `Switched to ${targetWellData.name}` });
        }
    };

    const startEditing = (well, e) => {
        e.stopPropagation();
        setEditingId(well.id);
        setEditName(well.name);
    };

    const saveEdit = (e) => {
        e.stopPropagation();
        if (editName.trim().length === 0) {
            toast({ variant: "destructive", title: "Invalid Name", description: "Well name cannot be empty." });
            return;
        }
        if (editName.length > 50) {
             toast({ variant: "destructive", title: "Invalid Name", description: "Name too long (max 50 chars)." });
             return;
        }
        updateWell(editingId, { name: editName });
        setEditingId(null);
        
        // If editing currently active well, update main context title too
        if (editingId === mwState.activeWellId) {
             bfDispatch({ type: 'LOAD_PROJECT', payload: { name: editName } });
        }
    };

    const cancelEdit = (e) => {
        e.stopPropagation();
        setEditingId(null);
    };

    const handleDeleteClick = (e, id) => {
        e.stopPropagation();
        setDeleteId(id);
    };

    const confirmDelete = () => {
        if (deleteId) {
            removeWell(deleteId);
            setDeleteId(null);
            toast({ title: "Well Deleted", description: "The well has been removed." });
        }
    };

    const handleCreateWell = () => {
        if (!newWellData.name.trim()) {
             toast({ variant: "destructive", title: "Validation Error", description: "Well name is required." });
             return;
        }

        const wellPayload = {
            name: newWellData.name,
            status: newWellData.status,
            location: { name: newWellData.location },
            description: newWellData.description,
            depthRange: { min: parseFloat(newWellData.depthMin), max: parseFloat(newWellData.depthMax) }
        };

        addWell(wellPayload);
        setIsCreateOpen(false);
        setNewWellData({ name: '', location: '', status: 'not-started', description: '', depthMin: 0, depthMax: 5000 });
        toast({ title: "Well Created", description: `${wellPayload.name} added to project.` });
    };

    const filteredWells = (mwState.wells || []).filter(w => 
        w.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="h-full flex flex-col bg-slate-900 border-r border-slate-800 w-full">
            <div className="p-4 border-b border-slate-800 space-y-4 shrink-0">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-white">Project Wells</h3>
                    <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-indigo-900/50 hover:text-indigo-400" onClick={() => setIsCreateOpen(true)}>
                        <Plus className="w-4 h-4" />
                    </Button>
                </div>
                <div className="relative">
                    <Search className="absolute left-2 top-1.5 h-3 w-3 text-slate-500" />
                    <Input 
                        className="h-8 pl-8 text-xs bg-slate-950 border-slate-800 focus-visible:ring-indigo-500/50" 
                        placeholder="Search wells..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-2">
                    {filteredWells.length === 0 && (
                        <div className="text-center p-8 text-xs text-slate-500 flex flex-col items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center"><Search className="w-4 h-4" /></div>
                            No wells found.
                        </div>
                    )}
                    {filteredWells.map(well => (
                        <div 
                            key={well.id}
                            onClick={() => handleSwitchWell(well.id)}
                            data-testid="bf-well-row"
                            data-well-name={well.name}
                            data-active={well.id === mwState.activeWellId ? 'true' : 'false'}
                            className={`group p-3 rounded-lg border cursor-pointer transition-all relative ${
                                mwState.activeWellId === well.id 
                                ? 'bg-indigo-950/40 border-indigo-500/50 shadow-sm shadow-indigo-900/20' 
                                : 'bg-slate-950/30 border-slate-800 hover:border-slate-600 hover:bg-slate-900'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2 h-6">
                                {editingId === well.id ? (
                                    <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
                                        <Input 
                                            value={editName} 
                                            onChange={e => setEditName(e.target.value)}
                                            className="h-6 text-xs px-1 bg-slate-900 border-slate-700 focus-visible:ring-1"
                                            autoFocus
                                            onKeyDown={e => { if(e.key === 'Enter') saveEdit(e); if(e.key === 'Escape') cancelEdit(e); }}
                                        />
                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-400 hover:bg-emerald-900/20" onClick={saveEdit}>
                                            <Check className="w-3 h-3" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:bg-red-900/20" onClick={cancelEdit}>
                                            <X className="w-3 h-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="font-medium text-sm text-white truncate flex-1 mr-2" title={well.name}>{well.name}</div>
                                        <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
                                            <Button size="icon" variant="ghost" className="h-5 w-5 text-slate-500 hover:text-indigo-400" onClick={(e) => startEditing(well, e)}>
                                                <Edit2 className="w-3 h-3" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="h-5 w-5 text-slate-500 hover:text-red-400" onClick={(e) => handleDeleteClick(e, well.id)}>
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                            
                            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-2">
                                <div className="flex items-center gap-2">
                                    <StatusBadge status={well.status} />
                                </div>
                                <span className="flex items-center" title={`Updated: ${new Date(well.updated_at || Date.now()).toLocaleDateString()}`}>
                                    <Calendar className="w-3 h-3 mr-1 opacity-50" /> 
                                    {new Date(well.updated_at || Date.now()).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                </span>
                            </div>

                            <div className="text-[10px] text-slate-600 flex gap-3 border-t border-slate-800/50 pt-2 mt-1">
                                <span className="flex items-center"><MapPin className="w-2.5 h-2.5 mr-1" /> {well.location?.name || 'N/A'}</span>
                                <span className="flex items-center">TD: {well.depthRange?.max || 0}m</span>
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>

            {/* New Well Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-[90vw] sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Create New Well</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Initialize a new well model in your project.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-slate-400">Name</Label>
                            <Input 
                                value={newWellData.name}
                                onChange={e => setNewWellData({...newWellData, name: e.target.value})}
                                className="col-span-3 bg-slate-950 border-slate-800" 
                                placeholder="e.g. Exploration Well 01"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-slate-400">Status</Label>
                            <Select 
                                value={newWellData.status} 
                                onValueChange={v => setNewWellData({...newWellData, status: v})}
                            >
                                <SelectTrigger className="col-span-3 bg-slate-950 border-slate-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800 text-white">
                                    <SelectItem value="not-started">Not Started</SelectItem>
                                    <SelectItem value="in-progress">In Progress</SelectItem>
                                    <SelectItem value="calibrated">Calibrated</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-slate-400">Location</Label>
                            <Input 
                                value={newWellData.location}
                                onChange={e => setNewWellData({...newWellData, location: e.target.value})}
                                className="col-span-3 bg-slate-950 border-slate-800" 
                                placeholder="e.g. Block 4, Offshore"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-slate-400">Depth (m)</Label>
                            <div className="col-span-3 flex gap-2 items-center">
                                <Input 
                                    type="number" placeholder="Min" 
                                    value={newWellData.depthMin}
                                    onChange={e => setNewWellData({...newWellData, depthMin: e.target.value})}
                                    className="bg-slate-950 border-slate-800" 
                                />
                                <span className="text-slate-500">-</span>
                                <Input 
                                    type="number" placeholder="Max" 
                                    value={newWellData.depthMax}
                                    onChange={e => setNewWellData({...newWellData, depthMax: e.target.value})}
                                    className="bg-slate-950 border-slate-800" 
                                />
                            </div>
                        </div>
                         <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-slate-400">Description</Label>
                            <Input 
                                value={newWellData.description}
                                onChange={e => setNewWellData({...newWellData, description: e.target.value})}
                                className="col-span-3 bg-slate-950 border-slate-800" 
                                placeholder="Optional notes..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateWell} className="bg-indigo-600 hover:bg-indigo-700">Create Well</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-white max-w-[90vw] sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                            This action cannot be undone. This will permanently delete the well and all associated data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white border-0">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default MultiWellManager;