import React, { useState, useMemo } from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, Download } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import CollapsibleSection from '@/components/fdp/CollapsibleSection';
import RiskManagementOverview from './risk/RiskManagementOverview';
import ConsolidatedRiskRegister from './risk/ConsolidatedRiskRegister';
import RiskMatrix from './risk/RiskMatrix';
import RiskResponsePlanning from './risk/RiskResponsePlanning';
import HSERiskForm from './hse/HSERiskForm'; // Reusing form or creating generic
import { RiskIntegrationService } from '@/services/fdp/RiskIntegrationService';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const RiskManagementModule = () => {
    const { state, actions } = useFDP();
    const { toast } = useToast();
    
    const [view, setView] = useState('list');
    const [editingRisk, setEditingRisk] = useState(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [riskToDelete, setRiskToDelete] = useState(null);

    // Memoize the consolidation to prevent recalculating on every render unless state changes
    const consolidatedRisks = useMemo(() => 
        RiskIntegrationService.consolidateRisks(state), 
    [state.risks, state.hseData, state.wells, state.schedule, state.subsurface]);

    const handleCreate = () => {
        setEditingRisk(null);
        setView('form');
    };

    const handleEdit = (risk) => {
        // We can only edit risks that originate from the Risk Register directly here
        // Others should be edited in their respective modules
        if (risk.source !== 'Risk Register') {
            toast({
                title: "Read Only View",
                description: `This risk is managed in the ${risk.source}. Please edit it there.`,
                variant: "default" // or warning
            });
            return;
        }
        setEditingRisk(risk);
        setView('form');
    };

    const handleDeleteClick = (id) => {
        setRiskToDelete(id);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = () => {
        if (riskToDelete) {
            // Only delete local risks
            const updated = (state.risks || []).filter(r => r.id !== riskToDelete);
            actions.updateDataManagement({ risks: updated }); // Assuming action exists or we patch state
            // NOTE: Context might not have specific updateRisks action exposed, assuming generic update or we add it.
            // Let's assume we added 'updateRisks' or similar to FDPContext.
            if (actions.updateRisks) {
                actions.updateRisks(updated);
            } else {
                // Fallback if action not yet in context (we will add it below)
                console.warn("updateRisks action missing");
            }
        }
        setDeleteDialogOpen(false);
        setRiskToDelete(null);
    };

    const handleSaveRisk = (risk) => {
        const currentRisks = state.risks || [];
        let updatedRisks;
        if (editingRisk) {
            updatedRisks = currentRisks.map(r => r.id === risk.id ? risk : r);
        } else {
            updatedRisks = [...currentRisks, { ...risk, source: 'Risk Register' }];
        }
        
        if (actions.updateRisks) {
            actions.updateRisks(updatedRisks);
        }
        setView('list');
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">Integrated Risk Management</h2>
                    <p className="text-slate-400">Consolidated view of technical, commercial, and HSE risks across the project.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="border-slate-700 text-slate-300">
                        <Download className="w-4 h-4 mr-2" /> Export Register
                    </Button>
                    <Button onClick={handleCreate} className="bg-red-600 hover:bg-red-700">
                        <Plus className="w-4 h-4 mr-2" /> Add Project Risk
                    </Button>
                </div>
            </div>

            {view === 'form' ? (
                // Reusing HSERiskForm for now as it fits the schema well, ideally separate generic form
                <HSERiskForm 
                    initialData={editingRisk}
                    onSave={handleSaveRisk}
                    onCancel={() => setView('list')}
                />
            ) : (
                <>
                    <CollapsibleSection title="Portfolio Overview" defaultOpen>
                        <RiskManagementOverview risks={consolidatedRisks} />
                    </CollapsibleSection>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                            <CollapsibleSection title="Consolidated Risk Register" defaultOpen>
                                <ConsolidatedRiskRegister 
                                    risks={consolidatedRisks}
                                    onEdit={handleEdit}
                                    onDelete={handleDeleteClick}
                                />
                            </CollapsibleSection>
                        </div>
                        <div>
                            <CollapsibleSection title="Risk Matrix" defaultOpen>
                                <RiskMatrix risks={consolidatedRisks} />
                            </CollapsibleSection>
                        </div>
                    </div>

                    <CollapsibleSection title="Response Planning">
                        <RiskResponsePlanning risks={consolidatedRisks} />
                    </CollapsibleSection>
                </>
            )}

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Risk</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this risk? Only risks created directly in the Risk Register can be deleted here.
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

export default RiskManagementModule;