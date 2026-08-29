import React from 'react';
import { useFDP } from '@/contexts/FDPContext';
import CollapsibleSection from '@/components/fdp/CollapsibleSection';
import FieldInformation from './field-overview/FieldInformation';
import FieldLocationMap from './field-overview/FieldLocationMap';
import KeyDates from './field-overview/KeyDates';
import Stakeholders from './field-overview/Stakeholders';
import StrategicObjectives from './field-overview/StrategicObjectives';
import FieldStatistics from './field-overview/FieldStatistics';
import { Button } from '@/components/ui/button';
import { Download, Upload, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { exampleFieldData, exampleSubsurface, EXAMPLE_LABEL } from '@/services/fdp/exampleData';
import { useToast } from '@/components/ui/use-toast';

const FieldOverviewModule = () => {
    const { state, actions } = useFDP();
    const { fieldData, subsurface, dataManagement } = state;
    const { toast } = useToast();

    // Economics E3: this button used to claim it had retrieved the user's own
    // field data from the Geoscience and Reservoir apps. It contacted nothing;
    // the numbers were hardcoded. It loads a clearly labelled example now.
    const handleLoadExample = () => {
        actions.updateFieldData(exampleFieldData());
        actions.updateSubsurface({ ...state.subsurface, ...exampleSubsurface() });
        toast({
            title: 'Example loaded',
            description: `${EXAMPLE_LABEL}. These are illustrative figures, not your project's.`,
        });
    };

    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header / Actions */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">Field Overview</h2>
                    <p className="text-slate-400">Define the core parameters and constraints of the development.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleLoadExample} className="border-slate-700 text-slate-300">
                        <RefreshCw className="w-4 h-4 mr-2" /> Load example
                    </Button>
                    <Button variant="outline" className="border-slate-700 text-slate-300">
                        <Upload className="w-4 h-4 mr-2" /> Import File
                    </Button>
                </div>
            </div>

            {/* Validation Status Banner */}
            {dataManagement.validationStatus && !dataManagement.validationStatus.isValid && (
                <div className="bg-red-900/20 border border-red-800 rounded-md p-4 flex items-start">
                    <AlertTriangle className="w-5 h-5 text-red-500 mr-3 mt-0.5" />
                    <div>
                        <h4 className="text-red-400 font-medium">Data Validation Issues</h4>
                        <ul className="list-disc list-inside text-sm text-red-300/80 mt-1">
                            {dataManagement.validationStatus.errors.map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                    </div>
                </div>
            )}

            {/* Statistics Banner */}
            <FieldStatistics data={fieldData} subsurface={subsurface} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Main Info */}
                <div className="lg:col-span-2 space-y-6">
                    <CollapsibleSection title="Field Information" defaultOpen>
                        <FieldInformation 
                            data={fieldData} 
                            onChange={actions.updateFieldData} 
                        />
                    </CollapsibleSection>

                    <CollapsibleSection title="Location & Map">
                        <FieldLocationMap location={fieldData.location} />
                    </CollapsibleSection>

                    <CollapsibleSection title="Stakeholders">
                        <Stakeholders 
                            stakeholders={fieldData.stakeholders} 
                            onChange={(newStakeholders) => actions.updateFieldData({ stakeholders: newStakeholders })} 
                        />
                    </CollapsibleSection>
                </div>

                {/* Right Column: Timeline & Strategy */}
                <div className="space-y-6">
                    <KeyDates 
                        dates={fieldData.dates} 
                        onChange={(newDates) => actions.updateFieldData({ dates: newDates })} 
                    />

                    <StrategicObjectives 
                        objectives={fieldData.objectives} 
                        onChange={(newObjectives) => actions.updateFieldData({ objectives: newObjectives })} 
                    />

                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                        <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Data Sources</h4>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-300">Geoscience Hub</span>
                                <span className="text-green-400 flex items-center text-xs"><CheckCircle2 className="w-3 h-3 mr-1"/> Connected</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-300">Reservoir Sim</span>
                                <span className="text-slate-500 text-xs">Last sync: 2d ago</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-300">Project Mgmt</span>
                                <span className="text-yellow-500 flex items-center text-xs">Manual Input</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FieldOverviewModule;