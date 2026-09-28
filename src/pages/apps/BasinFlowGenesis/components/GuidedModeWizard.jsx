import React, { useState, useEffect } from 'react';
import { useGuidedMode } from '../contexts/GuidedModeContext';
import BasinTemplateStep from './guided/BasinTemplateStep';
import StratigraphyInputStep from './guided/StratigraphyInputStep';
import PetroleumSystemStep from './guided/PetroleumSystemStep';
import HeatFlowStep from './guided/HeatFlowStep';
import ErosionStep from './guided/ErosionStep';
import ReviewAndRunStep from './guided/ReviewAndRunStep';
import WorkflowGuide from './common/WorkflowGuide';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, AlertCircle, HelpCircle } from 'lucide-react'; // Added HelpCircle
import { cn } from '@/lib/utils';
import { DragDropContext } from 'react-beautiful-dnd';
import { ValidationFeedback } from './common/ValidationFeedback';
import { ValidationEngine } from '../services/ValidationEngine';
import SimulationRunDialog from './common/SimulationRunDialog';
import ResultsDashboard from './ResultsDashboard';
import UnitsBar from './common/UnitsBar';
import { Link } from 'react-router-dom';
import { useBasinFlow } from '../contexts/BasinFlowContext';
import { appPath } from '@/components/wells/appLinks';

const StepContent = ({ step }) => {
    switch(step) {
        case 1: return <BasinTemplateStep />;
        case 2: return <StratigraphyInputStep />;
        case 3: return <PetroleumSystemStep />;
        case 4: return <HeatFlowStep />;
        case 5: return <ErosionStep />;
        case 6: return <ReviewAndRunStep />;
        default: return <div>Unknown Step</div>;
    }
};

const GuidedModeWizard = () => {
    const { currentStep, totalSteps, steps, nextStep, prevStep, stepError, validateStep, reorderLayers, wizardData, goToStep } = useGuidedMode();
    const [isDndReady, setIsDndReady] = useState(false);
    const [validationStatus, setValidationStatus] = useState({});
    const [showResults, setShowResults] = useState(false);
    const { appPaths } = useBasinFlow();
    const helpHref = `${appPath('basinflow-genesis', appPaths)}/help`;

    // Progress calc
    const progressPercentage = ((currentStep - 1) / (totalSteps - 1)) * 100;

    // Fix for React StrictMode with react-beautiful-dnd
    useEffect(() => {
        const animation = requestAnimationFrame(() => setIsDndReady(true));
        return () => {
            cancelAnimationFrame(animation);
            setIsDndReady(false);
        };
    }, []);

    // Validate current step on change
    useEffect(() => {
        const result = ValidationEngine.validateStep(currentStep, wizardData);
        setValidationStatus(prev => ({...prev, [currentStep]: result}));
    }, [currentStep, wizardData]);

    const onDragEnd = (result) => {
        if (!result.destination) return;
        // Handle layer reordering for the stratigraphy step
        if (result.source.droppableId === 'guided-stratigraphy-list' && result.destination.droppableId === 'guided-stratigraphy-list') {
            reorderLayers(result.source.index, result.destination.index);
        }
    };

    const handleNext = () => {
        // Explicit validation before moving
        const result = ValidationEngine.validateStep(currentStep, wizardData);
        setValidationStatus(prev => ({...prev, [currentStep]: result}));
        
        if (result.isValid) {
            nextStep();
        }
    };

    const handleSimulationComplete = () => {
        setShowResults(true);
    };

    if (showResults) {
        return <ResultsDashboard onBack={() => setShowResults(false)} />;
    }

    return (
        <div className="flex flex-col lg:flex-row h-full bg-pl-bg text-pl-text overflow-hidden relative">
             {/* Help Button Floating or Fixed */}
            <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
                <UnitsBar />
                <Link to={helpHref} data-testid="bf-wizard-help" title="Open the help guide" className="text-pl-muted hover:text-pl-text bg-pl-surface">
                    <HelpCircle className="w-5 h-5" />
                </Link>
            </div>

            {/* Sidebar */}
            <div className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-pl-border bg-pl-surface p-4 lg:p-6 flex lg:flex-col shrink-0 overflow-x-auto lg:overflow-visible">
                <div className="hidden lg:block h-full">
                    <WorkflowGuide 
                        steps={steps} 
                        currentStep={currentStep} 
                        validationState={validationStatus}
                        onStepClick={(step) => { if(step < currentStep) goToStep(step); }}
                    />
                </div>
                {/* Mobile Progress */}
                <div className="lg:hidden w-full flex items-center justify-between">
                    <span className="font-bold">Step {currentStep}: {steps[currentStep-1]?.title}</span>
                    <span className="text-xs text-pl-muted">{Math.round(progressPercentage)}%</span>
                </div>
            </div>

            {/* Main Content Area wrapped in DragDropContext */}
            <div className="flex-1 flex flex-col w-full min-w-0 h-full overflow-hidden">
                {isDndReady ? (
                    <DragDropContext onDragEnd={onDragEnd}>
                        <div className="flex-1 p-4 lg:p-8 overflow-y-auto custom-scrollbar bg-pl-bg">
                            <div className="max-w-5xl mx-auto h-full flex flex-col">
                                 <div className="flex-1">
                                    <StepContent step={currentStep} />
                                 </div>
                                 
                                 <div className="mt-4">
                                     <ValidationFeedback result={validationStatus[currentStep]} />
                                 </div>
                            </div>
                        </div>
                    </DragDropContext>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-pl-muted">Loading...</div>
                    </div>
                )}

                {/* Error Banner from Context (Global Errors) */}
                {stepError && (
                    <div className="px-4 lg:px-8 pb-4 shrink-0">
                         <div className="bg-pl-danger-bg border border-pl-danger/40 text-pl-danger-text p-3 rounded-lg flex items-center gap-2 text-sm animate-in slide-in-from-bottom-2 max-w-5xl mx-auto w-full">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{stepError}</span>
                        </div>
                    </div>
                )}

                {/* Footer Navigation */}
                <div className="p-4 lg:p-6 border-t border-pl-border flex justify-between items-center bg-pl-surface shrink-0">
                    <Button 
                        variant="ghost" 
                        onClick={prevStep} 
                        disabled={currentStep === 1}
                        className="text-pl-muted hover:text-pl-text"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>

                    {currentStep < totalSteps && (
                        <Button 
                            onClick={handleNext} 
                            className="w-32"
                        >
                            Next <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}
                </div>
            </div>
            
        </div>
    );
};

export default GuidedModeWizard;