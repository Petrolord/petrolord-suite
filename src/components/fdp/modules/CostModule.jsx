import React, { useState } from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { Button } from '@/components/ui/button';
import { Plus, Download, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import CollapsibleSection from '@/components/fdp/CollapsibleSection';
import CostBreakdown from './cost/CostBreakdown';
import CostForm from './cost/CostForm';
import EconomicsAnalysis from './cost/EconomicsAnalysis';
import SensitivityAnalysis from './cost/SensitivityAnalysis';
import { exampleCosts, EXAMPLE_LABEL } from '@/services/fdp/exampleData';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const CostModule = () => {
    const { state, actions } = useFDP();
    const { costs } = state;
    const { toast } = useToast();
    
    const [view, setView] = useState('list'); // list, form
    const [editingCost, setEditingCost] = useState(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [costToDelete, setCostToDelete] = useState(null);

    const handleCreate = () => {
        setEditingCost(null);
        setView('form');
    };

    const handleEdit = (item) => {
        setEditingCost(item);
        setView('form');
    };

    const handleDeleteClick = (id) => {
        setCostToDelete(id);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = () => {
        if (costToDelete) {
            const updated = costs.items.filter(c => c.id !== costToDelete);
            actions.updateCosts({ items: updated });
        }
        setDeleteDialogOpen(false);
        setCostToDelete(null);
    };

    const handleSave = (item) => {
        if (editingCost) {
            const updated = costs.items.map(c => c.id === item.id ? item : c);
            actions.updateCosts({ items: updated });
        } else {
            actions.updateCosts({ items: [...costs.items, item] });
        }
        setView('list');
    };

    const handleLoadExample = () => {
        // Economics E3: this claimed to sync the user's own data from another
    // Suite app and contacted nothing. It loads a labelled example now.
        const added = exampleCosts();
        actions.updateCosts({ items: [...costs.items, ...added] });
        toast({ title: 'Example loaded', description: `${added.length} example cost items. ${EXAMPLE_LABEL}.` });
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">Cost & Economics</h2>
                    <p className="text-slate-400">Manage budget, estimate CAPEX/OPEX, and analyze economic viability.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleLoadExample} className="border-slate-700 text-slate-300">
                        <Download className="w-4 h-4 mr-2" /> Load example
                    </Button>
                    <Button 
                        onClick={handleCreate} 
                        className="bg-green-600 hover:bg-green-700"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Add Cost Item
                    </Button>
                </div>
            </div>

            {view === 'form' ? (
                <CostForm 
                    initialData={editingCost}
                    onSave={handleSave}
                    onCancel={() => setView('list')}
                />
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <CollapsibleSection title="Economic Indicators" defaultOpen>
                            <EconomicsAnalysis costItems={costs.items} />
                        </CollapsibleSection>
                        <CollapsibleSection title="Sensitivity Analysis" defaultOpen>
                            <SensitivityAnalysis />
                        </CollapsibleSection>
                    </div>

                    <CollapsibleSection title="Cost Breakdown Structure" defaultOpen>
                        <CostBreakdown 
                            costItems={costs.items}
                            onEdit={handleEdit}
                            onDelete={handleDeleteClick}
                        />
                    </CollapsibleSection>
                </div>
            )}

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Cost Item</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this cost item? This will affect total estimates.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex justify-end gap-2">
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
                            Delete
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default CostModule;