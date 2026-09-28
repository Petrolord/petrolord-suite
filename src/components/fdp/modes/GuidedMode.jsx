import React from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowRight, ArrowLeft, Save } from 'lucide-react';

// Import Steps
import FieldOverviewModule from '@/components/fdp/modules/FieldOverviewModule';
import SubsurfaceModule from '@/components/fdp/modules/SubsurfaceModule';
import ConceptModule from '@/components/fdp/modules/ConceptModule'; 
import ScenarioModule from '@/components/fdp/modules/ScenarioModule'; 
import WellsModule from '@/components/fdp/modules/WellsModule'; 
import FacilitiesModule from '@/components/fdp/modules/FacilitiesModule'; 
import ScheduleModule from '@/components/fdp/modules/ScheduleModule'; 
import CostModule from '@/components/fdp/modules/CostModule'; 
import HSEModule from '@/components/fdp/modules/HSEModule';
import CommunityRelationsModule from '@/components/fdp/modules/CommunityRelationsModule';
import RiskManagementModule from '@/components/fdp/modules/RiskManagementModule';
import FDPGenerationModule from '@/components/fdp/modules/FDPGenerationModule'; // UPDATED

const StepWrapper = ({ children }) => (
    <div className="max-w-7xl mx-auto">
        {children}
    </div>
);

const GuidedMode = () => {
    const { state, actions } = useFDP();
    const { currentStep } = state.navigation;

    const steps = [
        { id: 'overview', title: 'Field Overview', description: 'Define the project scope, location, and key parameters.' },
        { id: 'subsurface', title: 'Subsurface & Reserves', description: 'Input reservoir data, recovery methods, and reserve estimates.' },
        { id: 'concepts', title: 'Development Concepts', description: 'Define technical solutions and facility types.' }, 
        { id: 'scenarios', title: 'Scenario Planning', description: 'Evaluate economic viability under different conditions.' }, 
        { id: 'wells', title: 'Wells & Drilling', description: 'Plan the number of producers, injectors, and drilling schedule.' }, 
        { id: 'facilities', title: 'Facilities Concept', description: 'Select and size the surface facilities and export options.' }, 
        { id: 'schedule', title: 'Project Schedule', description: 'Define milestones, critical path, and project timeline.' },
        { id: 'costs', title: 'Cost & Economics', description: 'Estimate CAPEX/OPEX and analyze project viability.' }, 
        { id: 'hse', title: 'HSE Management', description: 'Define safety systems, environmental policies, and risk assessments.' },
        { id: 'community', title: 'Community Relations', description: 'Plan stakeholder engagement and local content strategies.' },
        { id: 'risk-management', title: 'Integrated Risk Management', description: 'Consolidate and analyze all project risks.' },
        { id: 'review', title: 'Review & Finalize', description: 'Review all inputs and generate the Field Development Plan.' }
    ];

    const progress = ((currentStep + 1) / steps.length) * 100;

    const handleNext = () => {
        if (currentStep < steps.length - 1) actions.setGuidedStep(currentStep + 1);
    };

    const handlePrev = () => {
        if (currentStep > 0) actions.setGuidedStep(currentStep - 1);
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case 0: return <FieldOverviewModule />;
            case 1: return <SubsurfaceModule />;
            case 2: return <ConceptModule />;
            case 3: return <ScenarioModule />;
            case 4: return <WellsModule />;
            case 5: return <FacilitiesModule />;
            case 6: return <ScheduleModule />;
            case 7: return <CostModule />; 
            case 8: return <HSEModule />;
            case 9: return <CommunityRelationsModule />;
            case 10: return <RiskManagementModule />; 
            case 11: return <FDPGenerationModule />; // UPDATED: Replaced placeholder with actual module
            default: return null;
        }
    };

    return (
        <div className="h-full flex flex-col p-6 w-full">
            {/* Wizard Header */}
            <div className="mb-6 max-w-4xl mx-auto w-full">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <h2 className="text-2xl font-bold text-pl-text">{steps[currentStep].title}</h2>
                        <p className="text-pl-muted text-sm">{steps[currentStep].description}</p>
                    </div>
                    <div className="text-right">
                        <span className="text-sm text-pl-muted block">Step {currentStep + 1} of {steps.length}</span>
                        <span className="text-xs text-pl-muted font-medium">{Math.round(progress)}% Complete</span>
                    </div>
                </div>
                <Progress value={progress} className="h-2" />
            </div>

            {/* Step Content */}
            <div className="flex-1 overflow-auto pb-20">
                <StepWrapper>
                    {renderStepContent()}
                </StepWrapper>
            </div>

            {/* Navigation Footer */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-pl-surface border-t border-pl-border flex justify-between items-center z-50 pl-64 transition-all duration-300">
                 <Button 
                    variant="ghost" 
                    onClick={handlePrev} 
                    disabled={currentStep === 0}
                >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Previous
                </Button>
                
                <div className="flex space-x-3">
                    <Button variant="outline">
                        <Save className="w-4 h-4 mr-2" /> Save Draft
                    </Button>
                    <Button 
                        onClick={handleNext}
                        disabled={currentStep === steps.length - 1 && currentStep !== 11}
                    >
                        {currentStep === steps.length - 1 ? 'Finish' : 'Next Step'} <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default GuidedMode;