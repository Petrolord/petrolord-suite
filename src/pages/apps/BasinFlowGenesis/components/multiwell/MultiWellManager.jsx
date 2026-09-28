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
import { depthToDisplay } from '@/pages/apps/BasinFlowGenesis/services/units';
import { useToast } from '@/components/ui/use-toast';

const StatusBadge = ({ status }) => {
    const styles = {
        'calibrated': 'bg-pl-success-bg text-pl-success-text border-pl-success/40',
        'in-progress': 'bg-pl-warning-bg text-pl-warning-text border-pl-warning/40',
        'not-started': 'bg-pl-sunken text-pl-muted border-pl-border'
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
    const { state: bfState, dispatch: bfDispatch, units } = useBasinFlow();
    // TD from the stated depth range, else the stratigraphy's total thickness (Basin T1-006: the seeded well read TD 0m)
    const wellTd = (well) => {
        const strat = well.stratigraphy?.length ? well.stratigraphy : (well.id === mwState.activeWellId ? bfState.stratigraphy || [] : []);
        const m = Number(well.depthRange?.max) || strat.reduce((acc, l) => acc + (Number(l.thickness) || 0), 0);
        if (!(m > 0)) return 'not set';
        const u = units?.depth || 'm';
        return `${Math.round(depthToDisplay(m, u)).toLocaleString()} ${u}`;
    };
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
        <div className="h-full flex flex-col bg-pl-surface border-r border-pl-border w-full">
            <div className="p-4 border-b border-pl-border space-y-4 shrink-0">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-pl-text">Project Wells</h3>
                    <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-pl-sunken hover:text-pl-primary-text" onClick={() => setIsCreateOpen(true)}>
                        <Plus className="w-4 h-4" />
                    </Button>
                </div>
                <div className="relative">
                    <Search className="absolute left-2 top-1.5 h-3 w-3 text-pl-muted" />
                    <Input 
                        className="h-8 pl-8 text-xs" 
                        placeholder="Search wells..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-2">
                    {filteredWells.length === 0 && (
                        <div className="text-center p-8 text-xs text-pl-muted flex flex-col items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-pl-sunken flex items-center justify-center"><Search className="w-4 h-4" /></div>
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
                                ? 'bg-pl-sunken border-pl-primary shadow-sm'
                                : 'bg-pl-surface border-pl-border hover:border-pl-border-strong hover:bg-pl-sunken'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-2 h-6">
                                {editingId === well.id ? (
                                    <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
                                        <Input 
                                            value={editName} 
                                            onChange={e => setEditName(e.target.value)}
                                            className="h-6 text-xs px-1 focus-visible:ring-1"
                                            autoFocus
                                            onKeyDown={e => { if(e.key === 'Enter') saveEdit(e); if(e.key === 'Escape') cancelEdit(e); }}
                                        />
                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-pl-primary-text hover:bg-pl-sunken" onClick={saveEdit}>
                                            <Check className="w-3 h-3" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-pl-muted hover:bg-pl-danger-bg" onClick={cancelEdit}>
                                            <X className="w-3 h-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="font-medium text-sm text-pl-text truncate flex-1 mr-2" title={well.name}>{well.name}</div>
                                        <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
                                            <Button size="icon" variant="ghost" className="h-5 w-5 text-pl-muted hover:text-pl-primary-text" onClick={(e) => startEditing(well, e)}>
                                                <Edit2 className="w-3 h-3" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="h-5 w-5 text-pl-muted hover:text-pl-danger-text" onClick={(e) => handleDeleteClick(e, well.id)}>
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                            
                            <div className="flex items-center justify-between text-[10px] text-pl-muted mb-2">
                                <div className="flex items-center gap-2">
                                    <StatusBadge status={well.status} />
                                </div>
                                <span className="flex items-center" title={`Updated: ${new Date(well.updated_at || Date.now()).toLocaleDateString()}`}>
                                    <Calendar className="w-3 h-3 mr-1 opacity-50" /> 
                                    {new Date(well.updated_at || Date.now()).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                </span>
                            </div>

                            <div className="text-[10px] text-pl-muted flex gap-3 border-t border-pl-border pt-2 mt-1">
                                <span className="flex items-center"><MapPin className="w-2.5 h-2.5 mr-1" /> {well.location?.name || 'N/A'}</span>
                                <span className="flex items-center">TD: {wellTd(well)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>

            {/* New Well Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-[90vw] sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Create New Well</DialogTitle>
                        <DialogDescription className="text-pl-muted">
                            Initialize a new well model in your project.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-pl-muted">Name</Label>
                            <Input 
                                value={newWellData.name}
                                onChange={e => setNewWellData({...newWellData, name: e.target.value})}
                                className="col-span-3" 
                                placeholder="e.g. Exploration Well 01"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-pl-muted">Status</Label>
                            <Select 
                                value={newWellData.status} 
                                onValueChange={v => setNewWellData({...newWellData, status: v})}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="not-started">Not Started</SelectItem>
                                    <SelectItem value="in-progress">In Progress</SelectItem>
                                    <SelectItem value="calibrated">Calibrated</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-pl-muted">Location</Label>
                            <Input 
                                value={newWellData.location}
                                onChange={e => setNewWellData({...newWellData, location: e.target.value})}
                                className="col-span-3" 
                                placeholder="e.g. Block 4, Offshore"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-pl-muted">Depth (m)</Label>
                            <div className="col-span-3 flex gap-2 items-center">
                                <Input 
                                    type="number" placeholder="Min" 
                                    value={newWellData.depthMin}
                                    onChange={e => setNewWellData({...newWellData, depthMin: e.target.value})}
                                />
                                <span className="text-pl-muted">-</span>
                                <Input 
                                    type="number" placeholder="Max" 
                                    value={newWellData.depthMax}
                                    onChange={e => setNewWellData({...newWellData, depthMax: e.target.value})}
                                />
                            </div>
                        </div>
                         <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-pl-muted">Description</Label>
                            <Input 
                                value={newWellData.description}
                                onChange={e => setNewWellData({...newWellData, description: e.target.value})}
                                className="col-span-3" 
                                placeholder="Optional notes..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateWell}>Create Well</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription className="text-pl-muted">
                            This action cannot be undone. This will permanently delete the well and all associated data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-pl-danger text-pl-danger-fg hover:bg-pl-danger/90 border-0">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default MultiWellManager;