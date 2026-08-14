import React, { useState } from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { Button } from '@/components/ui/button';
import { Plus, Download } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import CollapsibleSection from '@/components/fdp/CollapsibleSection';
import HSEOverview from './hse/HSEOverview';
import HSERiskRegister from './hse/HSERiskRegister';
import HSERiskForm from './hse/HSERiskForm';
import { HSEDataImporter } from '@/services/fdp/HSEDataImporter';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const HSEModule = () => {
    const { state, actions } = useFDP();
    const { hseData } = state;
    const { toast } = useToast();
    
    const [view, setView] = useState('list'); // list, form
    const [editingRisk, setEditingRisk] = useState(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [riskToDelete, setRiskToDelete] = useState(null);

    const handleCreate = () => {
        setEditingRisk(null);
        setView('form');
    };

    const handleEdit = (risk) => {
        setEditingRisk(risk);
        setView('form');
    };

    const handleDeleteClick = (id) => {
        setRiskToDelete(id);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = () => {
        if (riskToDelete) {
            const updated = hseData.hazards.filter(r => r.id !== riskToDelete);
            actions.updateHSE({ hazards: updated });
        }
        setDeleteDialogOpen(false);
        setRiskToDelete(null);
    };

    const handleSaveRisk = (risk) => {
        let updatedHazards;
        if (editingRisk) {
            updatedHazards = hseData.hazards.map(r => r.id === risk.id ? risk : r);
        } else {
            updatedHazards = [...hseData.hazards, risk];
        }
        actions.updateHSE({ hazards: updatedHazards });
        setView('list');
    };

    const handleImport = async () => {
        try {
            toast({ title: "Importing HSE Data", description: "Syncing with HSE Management System..." });
            const imported = await HSEDataImporter.importFromHSESystem();
            // Merge imported
            const currentIds = new Set(hseData.hazards.map(h => h.id));
            const newRisks = imported.filter(h => !currentIds.has(h.id));
            
            actions.updateHSE({ hazards: [...hseData.hazards, ...newRisks] });
            toast({ title: "Success", description: `Imported ${newRisks.length} new risks.` });
        } catch (e) {
            toast({ title: "Import Failed", description: "Could not load data.", variant: "destructive" });
        }
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">HSE Management</h2>
                    <p className="text-slate-400">Manage health, safety, environment, and regulatory compliance.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleImport} className="border-slate-700 text-slate-300">
                        <Download className="w-4 h-4 mr-2" /> Import System Data
                    </Button>
                    <Button onClick={handleCreate} className="bg-yellow-600 hover:bg-yellow-700">
                        <Plus className="w-4 h-4 mr-2" /> Add Risk
                    </Button>
                </div>
            </div>

            {view === 'form' ? (
                <HSERiskForm 
                    initialData={editingRisk}
                    onSave={handleSaveRisk}
                    onCancel={() => setView('list')}
                />
            ) : (
                <>
                    <CollapsibleSection title="HSE Overview" defaultOpen>
                        <HSEOverview data={hseData} />
                    </CollapsibleSection>

                    <CollapsibleSection title="Risk Register & Hazards" defaultOpen>
                        <HSERiskRegister 
                            risks={hseData.hazards}
                            onEdit={handleEdit}
                            onDelete={handleDeleteClick}
                        />
                    </CollapsibleSection>

                    <CollapsibleSection title="Management Systems & Policy">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm text-slate-300">HSE Policy Statement</label>
                                <Textarea 
                                    value={hseData.policy}
                                    onChange={(e) => actions.updateHSE({ policy: e.target.value })}
                                    className="bg-slate-800 border-slate-700 min-h-[100px]"
                                    placeholder="Enter policy summary..."
                                />
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-300">Safety Standard</label>
                                    <Input 
                                        value={hseData.safetySystem}
                                        onChange={(e) => actions.updateHSE({ safetySystem: e.target.value })}
                                        className="bg-slate-800 border-slate-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-300">Environmental Standard</label>
                                    <Input 
                                        value={hseData.envSystem}
                                        onChange={(e) => actions.updateHSE({ envSystem: e.target.value })}
                                        className="bg-slate-800 border-slate-700"
                                    />
                                </div>
                            </div>
                        </div>
                    </CollapsibleSection>
                </>
            )}

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Risk</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this risk assessment?
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

export default HSEModule;