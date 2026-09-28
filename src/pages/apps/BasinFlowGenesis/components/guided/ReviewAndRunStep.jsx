import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, AlertTriangle, Play, Settings2 } from 'lucide-react';
import { useGuidedMode } from '../../contexts/GuidedModeContext';
import { ValidationEngine } from '../../services/ValidationEngine';
import SimulationRunDialog from '../common/SimulationRunDialog';

const ReviewAndRunStep = () => {
    const { wizardData, runSimulation } = useGuidedMode();
    const [isSimDialogOpen, setIsSimDialogOpen] = useState(false);

    // Perform full validation
    const stratValidation = ValidationEngine.validateStratigraphy(wizardData.layers);
    const psValidation = ValidationEngine.validatePetroleumSystem(wizardData.layers);
    const hfValidation = ValidationEngine.validateHeatFlow(wizardData.heatFlowId);

    const isReady = stratValidation.isValid && psValidation.isValid && hfValidation.isValid;

    const handleRunClick = () => {
        setIsSimDialogOpen(true);
    };

    const handleSimulationComplete = () => {
        // The dialog will handle showing success state.
        // Parent component listens for state change or we trigger global event
        window.dispatchEvent(new CustomEvent('GUIDED_MODE_COMPLETE'));
        // Ideally redirect or show results. GuidedModeWizard handles this via event or we can pass a prop.
    };

    return (
        <div className="h-full flex flex-col space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-pl-text">Review & Simulate</h2>
                <p className="text-sm text-pl-muted">Verify your inputs before running the basin model.</p>
            </div>

            <ScrollArea className="flex-1">
                <div className="space-y-4 pr-4">
                    {/* Stratigraphy Summary */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                {stratValidation.isValid ? <Check className="w-4 h-4 text-pl-primary-text" /> : <AlertTriangle className="w-4 h-4 text-pl-warning-text" />}
                                Stratigraphy
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm text-pl-muted">
                                <p>{wizardData.layers.length} layers defined.</p>
                                <p>Total Thickness: {wizardData.layers.reduce((acc, l) => acc + l.thickness, 0)} m</p>
                                <p>Base Age: {Math.max(...wizardData.layers.map(l => l.ageStart))} Ma</p>
                            </div>
                            {stratValidation.errors.map((err, i) => <p key={i} className="text-xs text-pl-danger-text mt-1">{err}</p>)}
                        </CardContent>
                    </Card>

                    {/* Petroleum System Summary */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                {psValidation.isValid && psValidation.warnings.length === 0 ? <Check className="w-4 h-4 text-pl-primary-text" /> : <AlertTriangle className="w-4 h-4 text-pl-warning-text" />}
                                Petroleum System Elements
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm text-pl-muted">
                                <p>Source Rocks: {wizardData.layers.filter(l => l.sourceRock?.isSource).length}</p>
                            </div>
                            {psValidation.warnings.map((w, i) => <p key={i} className="text-xs text-pl-warning-text mt-1">{w}</p>)}
                        </CardContent>
                    </Card>

                    {/* Heat Flow Summary */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                {hfValidation.isValid ? <Check className="w-4 h-4 text-pl-primary-text" /> : <AlertTriangle className="w-4 h-4 text-pl-warning-text" />}
                                Thermal Boundary Conditions
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm text-pl-muted">
                                <p>Model: {wizardData.heatFlowId}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </ScrollArea>

            <div className="pt-4 border-t border-pl-border flex items-center justify-between">
                <div className="text-sm text-pl-muted">
                    Estimated run time: ~2 seconds
                </div>
                <Button 
                    size="lg" 
                    onClick={handleRunClick} 
                    disabled={!isReady}
                >
                    <Play className="w-5 h-5 mr-2" /> Run Simulation
                </Button>
            </div>

            <SimulationRunDialog 
                isOpen={isSimDialogOpen}
                onClose={() => setIsSimDialogOpen(false)}
                onComplete={handleSimulationComplete}
                onCancel={() => setIsSimDialogOpen(false)}
            />
        </div>
    );
};

export default ReviewAndRunStep;