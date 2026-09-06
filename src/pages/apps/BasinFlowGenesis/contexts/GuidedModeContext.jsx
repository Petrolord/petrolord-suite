import React, { createContext, useContext, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useBasinFlow } from './BasinFlowContext';
import { BasinTemplates } from '../data/BasinTemplates';
import { StepValidator } from '../services/StepValidator';
import { WizardDataConverter } from '../services/WizardDataConverter';

const GuidedModeContext = createContext(null);

export const GuidedModeProvider = ({ children }) => {
    const { dispatch, runSimulation: engineRunSimulation } = useBasinFlow();
    
    const [currentStep, setCurrentStep] = useState(1);
    const totalSteps = 6;
    const [isValidating, setIsValidating] = useState(false);
    const [stepError, setStepError] = useState(null);

    // Complete Wizard State
    const [wizardData, setWizardData] = useState({
        selectedTemplateId: null,
        layers: [],
        heatFlowId: 'continental_stable',
        erosionOption: 'none',
        erosionEvent: { age: 10, amount: 500 } // edited in the Erosion step when the option is custom
    });

    const steps = [
        { id: 1, title: "Basin Template", description: "Select geological setting" },
        { id: 2, title: "Stratigraphy", description: "Define layers & ages" },
        { id: 3, title: "Petroleum System", description: "Source, Reservoir, Seal" },
        { id: 4, title: "Heat Flow", description: "Thermal history" },
        { id: 5, title: "Erosion", description: "Uplift events" },
        { id: 6, title: "Review & Run", description: "Verify parameters" }
    ];

    // --- Actions ---

    const selectTemplate = (templateId) => {
        const template = BasinTemplates.find(t => t.id === templateId);
        if (template) {
            // Deep copy layers and assign IDs
            const initializedLayers = template.defaultStratigraphy.map(l => ({
                ...l,
                id: uuidv4(),
                color: getColorForLithology(l.lithology),
                sourceRock: l.sourceRock ? { ...l.sourceRock } : { isSource: false }
            }));
            
            setWizardData(prev => ({
                ...prev,
                selectedTemplateId: templateId,
                layers: initializedLayers
            }));
        }
    };

    const updateLayer = (layerId, updates) => {
        setWizardData(prev => ({
            ...prev,
            layers: prev.layers.map(l => l.id === layerId ? { ...l, ...updates } : l)
        }));
    };

    const addLayer = () => {
        const newLayer = {
            id: uuidv4(),
            name: 'New Formation',
            thickness: 100,
            lithology: 'shale',
            ageStart: 10,
            ageEnd: 0,
            color: getColorForLithology('shale'),
            sourceRock: { isSource: false }
        };
        setWizardData(prev => ({ ...prev, layers: [newLayer, ...prev.layers] }));
    };

    const removeLayer = (layerId) => {
        setWizardData(prev => ({
            ...prev,
            layers: prev.layers.filter(l => l.id !== layerId)
        }));
    };
    
    const reorderLayers = (dragIndex, hoverIndex) => {
         const newLayers = [...wizardData.layers];
         const [removed] = newLayers.splice(dragIndex, 1);
         newLayers.splice(hoverIndex, 0, removed);
         setWizardData(prev => ({...prev, layers: newLayers}));
    };

    // --- Navigation & Validation ---

    const validateStep = (stepId) => {
        setStepError(null);
        let result = { isValid: true };
        
        switch(stepId) {
            case 1: result = StepValidator.validateTemplateSelection(wizardData); break;
            case 2: result = StepValidator.validateStratigraphy(wizardData); break;
            case 3: result = StepValidator.validatePetroleumSystem(wizardData); break;
            case 4: result = StepValidator.validateHeatFlow(wizardData); break;
            case 5: result = StepValidator.validateErosion(wizardData); break;
            case 6: result = StepValidator.validateReview(wizardData); break;
            default: break;
        }

        if (!result.isValid) {
            if (result.isWarning) {
                // Just log or show toast, but allow proceed? For now, treat as blocking if severe, or allow if just warning.
                // Let's block on errors, allow on warnings but maybe user confirms?
                // Simplified: Block on error.
                if(!result.isWarning) setStepError(result.error);
            } else {
                setStepError(result.error);
            }
        }
        
        return result.isValid || result.isWarning; 
    };

    const nextStep = () => {
        if (validateStep(currentStep)) {
            if (currentStep < totalSteps) {
                setCurrentStep(prev => prev + 1);
                setStepError(null);
            }
        }
    };

    const prevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(prev => prev - 1);
            setStepError(null);
        }
    };
    
    const goToStep = (step) => {
        // Only allow going back or to next immediate step if valid?
        // For simplicity in Review, allow jumping back.
        setCurrentStep(step);
    };

    const runSimulation = async () => {
        setIsValidating(true);
        
        // 1. Convert Data
        const simulationInput = WizardDataConverter.convertWizardDataToSimulationInput(wizardData);
        
        // 2. Update Global Context
        // BF0: erosion events and the settings were dropped here, so the
        // wizard's Erosion step never reached the engine
        dispatch({ type: 'LOAD_PROJECT', payload: {
            name: `Guided Run - ${new Date().toLocaleTimeString()}`,
            stratigraphy: simulationInput.stratigraphy,
            heatFlow: simulationInput.heatFlow,
            erosionEvents: simulationInput.erosionEvents,
            settings: simulationInput.settings,
        }});
        
        // 3. Run
        try {
            await engineRunSimulation();
            // Signal completion to parent
            window.dispatchEvent(new CustomEvent('GUIDED_MODE_COMPLETE'));
        } catch (e) {
            setStepError("Simulation failed: " + e.message);
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <GuidedModeContext.Provider value={{
            currentStep,
            totalSteps,
            steps,
            wizardData,
            setWizardData,
            stepError,
            selectTemplate,
            updateLayer,
            addLayer,
            removeLayer,
            reorderLayers,
            nextStep,
            prevStep,
            goToStep,
            runSimulation,
            validateStep
        }}>
            {children}
        </GuidedModeContext.Provider>
    );
};

const getColorForLithology = (lith) => {
    const map = {
        sandstone: '#f4a261',
        shale: '#264653',
        limestone: '#2a9d8f',
        salt: '#e9c46a',
        granite: '#e76f51',
        coal: '#1d1d1d'
    };
    return map[lith?.toLowerCase()] || '#888';
};

export const useGuidedMode = () => {
    const context = useContext(GuidedModeContext);
    if (!context) throw new Error('useGuidedMode must be used within GuidedModeProvider');
    return context;
};