import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, Play, GitBranch } from 'lucide-react';
import { useBasinFlow } from '../../contexts/BasinFlowContext';
import { useToast } from '@/components/ui/use-toast';
import ScenarioCompare from './ScenarioCompare';
import { MAX_COMPARE } from '../../services/scenarioCompare';

const ScenarioManager = () => {
    const { state, dispatch } = useBasinFlow();
    const { scenarios, activeScenarioId } = state;
    const { toast } = useToast();

    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingScenario, setEditingScenario] = useState(null); // null = create new
    const [formData, setFormData] = useState({ name: '', description: '' });
    // U2-008: two to four scenarios side by side
    const [picked, setPicked] = useState([]);
    const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_COMPARE ? p : [...p, id]));
    const compared = picked.map((id) => scenarios.find((s) => s.id === id)).filter(Boolean);

    const handleCreateClick = () => {
        setEditingScenario(null);
        setFormData({ name: `Scenario ${scenarios.length + 1}`, description: '' });
        setIsEditOpen(true);
    };

    const handleEditClick = (scenario) => {
        setEditingScenario(scenario);
        setFormData({ name: scenario.name, description: scenario.parameters?.description || '' });
        setIsEditOpen(true);
    };

    const handleSave = () => {
        if (editingScenario) {
            // Update existing (This needs a new reducer case ideally, or we just re-save. 
            // Reducer currently only has SAVE_SCENARIO which creates new. 
            // For Phase 3, let's assume editing mostly means renaming/meta updates, OR re-saving current state as that scenario ID.
            // Let's implement a basic metadata update or simple delete-readd logic if reducer is limited, 
            // but for robustness we should add UPDATE_SCENARIO to context. I will stick to CREATE for now for safety.)
            
            // Actually, just updating name is fine for now.
            // We'll assume SAVE_SCENARIO creates new.
            // Let's treat this as "Create New Snapshot" for the null case.
            if (editingScenario.id) {
                // Since we don't have UPDATE_SCENARIO in context yet, we'll skip editing logic in this iteration
                // or just console log.
                // Wait, I should allow creating new scenarios from current state.
            }
        } else {
            // Create new from current state
            dispatch({ 
                type: 'SAVE_SCENARIO', 
                payload: { name: formData.name, description: formData.description } 
            });
            toast({ title: "Scenario Created", description: `${formData.name} saved.` });
        }
        setIsEditOpen(false);
    };

    const handleDelete = (id) => {
        dispatch({ type: 'DELETE_SCENARIO', id });
        toast({ title: "Scenario Deleted" });
    };

    const handleLoad = (id) => {
        dispatch({ type: 'LOAD_SCENARIO', id });
        toast({ title: "Scenario Loaded", description: "Parameters updated from snapshot." });
    };

    return (
        <div className="h-full p-6 bg-pl-bg overflow-y-auto">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-pl-text flex items-center gap-2">
                            <GitBranch className="w-6 h-6 text-pl-muted" /> Scenario Manager
                        </h2>
                        <p className="text-pl-muted text-sm">Create, manage, and compare simulation scenarios.</p>
                    </div>
                    <Button onClick={handleCreateClick}>
                        <Plus className="w-4 h-4 mr-2" /> Save Current State
                    </Button>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-pl-border hover:bg-transparent">
                                    <TableHead className="text-pl-muted w-16">Compare</TableHead>
                                    <TableHead className="text-pl-muted">Name</TableHead>
                                    <TableHead className="text-pl-muted">Created</TableHead>
                                    <TableHead className="text-pl-muted">Description</TableHead>
                                    <TableHead className="text-right text-pl-muted">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {scenarios.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-pl-muted">
                                            No scenarios saved yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    scenarios.map((s) => (
                                        <TableRow key={s.id} className={`border-pl-border ${activeScenarioId === s.id ? 'bg-pl-sunken' : ''}`}>
                                            <TableCell>
                                                <input type="checkbox" aria-label={`Compare ${s.name}`} data-testid={`bf-scenario-pick-${s.id}`}
                                                    checked={picked.includes(s.id)} onChange={() => togglePick(s.id)}
                                                    disabled={!picked.includes(s.id) && picked.length >= MAX_COMPARE} />
                                            </TableCell>
                                            <TableCell className="font-medium text-pl-text">
                                                {s.name}
                                                {activeScenarioId === s.id && <span className="ml-2 text-[10px] text-pl-primary-text bg-pl-sunken px-1.5 py-0.5 rounded">Active</span>}
                                            </TableCell>
                                            <TableCell className="text-pl-muted text-xs">
                                                {new Date(s.timestamp).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-pl-muted text-sm max-w-xs truncate">
                                                {s.parameters?.description || '-'}
                                            </TableCell>
                                            <TableCell className="text-right space-x-2">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-pl-primary-text" onClick={() => handleLoad(s.id)} title="Load">
                                                    <Play className="w-4 h-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-pl-danger-text" onClick={() => { setPicked((p) => p.filter((x) => x !== s.id)); handleDelete(s.id); }} title="Delete">
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                <div className="mt-6" data-testid="bf-scenario-compare-area">
                    {compared.length >= 2
                        ? <ScenarioCompare scenarios={compared} />
                        : <p className="text-xs text-pl-muted" data-testid="bf-scenario-compare-hint">Tick two to {MAX_COMPARE} scenarios to compare their inputs and results side by side. A scenario keeps the result that was on screen when it was saved; run before saving to compare results.</p>}
                </div>
            </div>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingScenario ? 'Edit Scenario' : 'Save Scenario'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium">Name</label>
                            <Input 
                                value={formData.name} 
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium">Description</label>
                            <Textarea 
                                value={formData.description} 
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                                className="h-20"
                                placeholder="Notes about this run..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ScenarioManager;