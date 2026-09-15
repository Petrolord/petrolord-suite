import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit2, Trash2, AlertTriangle } from 'lucide-react';
import { runScenario, conceptCapexMM } from '@/utils/fdp/scenarioCalculations';

/**
 * EC6-0. Two things were wrong with this card.
 *
 * The concept it looked up never matched when the scenario had been saved
 * with the form's default: the form's initial conceptId is a string and a
 * pick from the list stores a number, and the lookup used `===`. A card with
 * no concept rendered nothing at all, silently.
 *
 * And the economics behind it ignored the concept's capex, because the
 * engine read `concept.capex` and the concept form writes drillingCapex,
 * facilitiesCapex and subseaCapex. Every card in the app was priced at the
 * $100MM fallback: a $1,900MM concept showed NPV $3,507.6MM and IRR 676.4
 * percent instead of $1,791.4MM and 30.0 percent. The engine now reads the
 * fields the form writes and refuses a concept that carries no cost at all,
 * which this card reports rather than swallowing.
 */
const CAPEX_FIELD_LABELS = {
    drillingCapex: 'the drilling capex',
    facilitiesCapex: 'the facilities capex',
    subseaCapex: 'the subsea capex',
};

/** "the drilling capex and the subsea capex", from the engine's field names. */
export const capexMissingText = (fields = []) => {
    const names = fields.map((f) => CAPEX_FIELD_LABELS[f] || f);
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

const ScenarioCard = ({ scenario, concept, onEdit, onDelete, onSelect, isSelected }) => {
    if (!concept) {
        return (
            <Card className="bg-slate-800 border border-amber-700/50">
                <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between items-start">
                        <h3 className="font-bold text-white">{scenario.name}</h3>
                        <Badge className="bg-amber-700">No concept</Badge>
                    </div>
                    <p className="text-xs text-amber-200/80 flex items-start">
                        <AlertTriangle className="w-3.5 h-3.5 mr-1.5 mt-0.5 shrink-0" />
                        This scenario is linked to a concept that is no longer in the plan. Edit it and
                        pick a concept to see its economics.
                    </p>
                    <div className="flex justify-end gap-1 pt-2 border-t border-slate-700">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => onEdit(scenario)}>
                            <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-400" onClick={() => onDelete(scenario.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    let metrics = null;
    let refusal = null;
    let capexStatus = 'complete';
    let capexMissing = [];
    try {
        // Economics E1: post royalty and tax, through the sanctioned engine.
        // EC6-0: on the concept's own capex. EC6-9: and whether that capex
        // is complete, so a partial sum cannot pass for a whole one.
        ({ metrics, capexStatus, capexMissing = [] } = runScenario(scenario, concept));
    } catch (err) {
        refusal = err.message;
    }

    if (refusal) {
        return (
            <Card className="bg-slate-800 border border-amber-700/50">
                <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between items-start">
                        <h3 className="font-bold text-white">{scenario.name}</h3>
                        <Badge className="bg-amber-700">Incomplete</Badge>
                    </div>
                    <div className="text-xs text-slate-400">
                        Linked Concept: <span className="text-slate-200">{concept.name}</span>
                    </div>
                    <p className="text-xs text-amber-200/80 flex items-start">
                        <AlertTriangle className="w-3.5 h-3.5 mr-1.5 mt-0.5 shrink-0" />
                        No economics for this scenario: {refusal}.
                    </p>
                    <div className="flex justify-end gap-1 pt-2 border-t border-slate-700">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => onEdit(scenario)}>
                            <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-400" onClick={() => onDelete(scenario.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const npv = metrics.npv;
    const irr = metrics.irr;
    const capex = conceptCapexMM(concept);

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
                
                <div className={`text-xs text-slate-400 ${capexStatus === 'partial' ? 'mb-2' : 'mb-4'}`}>
                    Linked Concept: <span className="text-slate-200">{concept.name}</span>
                    <span className="text-slate-500"> (CAPEX ${capex.toFixed(0)}MM{capexStatus === 'partial' ? ', partial' : ''})</span>
                </div>
                {capexStatus === 'partial' && (
                    <p className="text-xs text-amber-200/80 flex items-start mb-4" data-testid="partial-capex">
                        <AlertTriangle className="w-3.5 h-3.5 mr-1.5 mt-0.5 shrink-0" />
                        Partial capex: {capexMissingText(capexMissing)} {capexMissing.length === 1 ? 'is' : 'are'} blank, so these economics leave that cost out.
                    </p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                    <div className="bg-slate-900 p-2 rounded text-center">
                        <div className="text-slate-500">NPV ({scenario.discountRate}%)</div>
                        <div className={`font-mono font-bold ${npv >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ${npv.toFixed(1)}M
                        </div>
                    </div>
                    <div className="bg-slate-900 p-2 rounded text-center">
                        <div className="text-slate-500">IRR</div>
                        <div className={`font-mono font-bold ${irr !== null && irr >= 15 ? 'text-green-400' : 'text-yellow-400'}`}>
                            {irr === null ? 'n/a' : `${irr.toFixed(1)}%`}
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
                    concept={concepts.find(c => String(c.id) === String(scenario.conceptId))}
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