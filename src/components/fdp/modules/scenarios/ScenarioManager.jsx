import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit2, Trash2, PlayCircle } from 'lucide-react';
import { runScenario } from '@/utils/fdp/scenarioCalculations';

const ScenarioCard = ({ scenario, concept, onEdit, onDelete, onSelect, isSelected }) => {
    if (!concept) return null; // Should not happen if data integrity is maintained

    // Economics E1: post royalty and tax, through the sanctioned engine.
    const { metrics } = runScenario(scenario, concept);
    const npv = metrics.npv;
    const irr = metrics.irr;

    return (
        <Card 
            className={`bg-slate-800 border transition-all duration-200 cursor-pointer ${isSelected ? 'border-green-500 shadow-lg shadow-green-900/20' : 'border-slate-700 hover:border-slate-600'}`}
            onClick={() => onSelect(scenario.id)}
        >
            <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-white">{scenario.name}</h3>
                    <Badge className={`${scenario.type === 'Base' ? 'bg-blue-600' : scenario.type === 'High' ? 'bg-green-600' : 'bg-red-600'}`}>
                        {scenario.type}
                    </Badge>
                </div>
                
                <div className="text-xs text-slate-400 mb-4">
                    Linked Concept: <span className="text-slate-200">{concept.name}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                    <div className="bg-slate-900 p-2 rounded text-center">
                        <div className="text-slate-500">NPV ({scenario.discountRate}%)</div>
                        <div className={`font-mono font-bold ${npv >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ${npv.toFixed(1)}M
                        </div>
                    </div>
                    <div className="bg-slate-900 p-2 rounded text-center">
                        <div className="text-slate-500">IRR</div>
                        <div className={`font-mono font-bold ${irr >= 15 ? 'text-green-400' : 'text-yellow-400'}`}>
                            {irr.toFixed(1)}%
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                    <div className="text-xs text-slate-500">
                        Oil Price: <span className="text-slate-300">${scenario.oilPrice}/bbl</span>
                    </div>
                    <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => onEdit(scenario)}>
                            <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-400" onClick={() => onDelete(scenario.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

const ScenarioManager = ({ scenarios, concepts, onEdit, onDelete, selectedId, onSelect }) => {
    if (scenarios.length === 0) {
        return (
            <div className="text-center py-12 bg-slate-900/50 border border-dashed border-slate-800 rounded-lg">
                <p className="text-slate-500 mb-2">No scenarios defined yet.</p>
                <p className="text-sm text-slate-600">Create economic scenarios to evaluate your concepts.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scenarios.map(scenario => (
                <ScenarioCard 
                    key={scenario.id} 
                    scenario={scenario} 
                    concept={concepts.find(c => c.id === scenario.conceptId)}
                    onEdit={onEdit} 
                    onDelete={onDelete}
                    isSelected={selectedId === scenario.id}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
};

export default ScenarioManager;