import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';

const WorkflowGuide = ({ steps, currentStep, onStepClick, validationState = {} }) => {
    return (
        <div className="h-full flex flex-col">
            <div className="mb-6 shrink-0">
                <h2 className="text-lg font-bold text-pl-text tracking-wide">Workflow</h2>
                <p className="text-xs text-pl-muted mt-1">Guided Process</p>
            </div>

            <div className="relative flex flex-col space-y-6 ml-2">
                {/* Vertical Line */}
                <div className="absolute left-3 top-2 bottom-2 w-px bg-pl-border -z-10" />

                {steps.map((step, index) => {
                    const stepNum = index + 1;
                    const isActive = stepNum === currentStep;
                    const isCompleted = stepNum < currentStep;
                    const hasError = validationState[stepNum]?.isValid === false;
                    
                    return (
                        <div 
                            key={step.id} 
                            className={cn(
                                "group flex items-start gap-4 relative cursor-pointer transition-opacity",
                                isActive ? "opacity-100" : "opacity-70 hover:opacity-100"
                            )}
                            onClick={() => onStepClick && onStepClick(stepNum)}
                        >
                            {/* Indicator */}
                            <div className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 z-10 transition-all duration-300 border-2",
                                isActive 
                                    ? "bg-pl-primary border-pl-primary text-pl-text ring-4 ring-pl-primary/50 shadow-lg " 
                                    : isCompleted 
                                        ? "bg-pl-sunken border-pl-primary text-pl-primary-text"
                                        : "bg-pl-surface border-pl-border text-pl-muted",
                                hasError && !isActive && "border-pl-danger/40 text-pl-danger-text bg-pl-danger-bg"
                            )}>
                                {isCompleted && !hasError ? <CheckCircle2 className="w-4 h-4" /> : 
                                 hasError ? <AlertCircle className="w-4 h-4" /> : 
                                 stepNum}
                            </div>

                            {/* Text */}
                            <div className="pt-0.5">
                                <h4 className={cn(
                                    "text-sm font-medium transition-colors",
                                    isActive ? "text-pl-text" : isCompleted ? "text-pl-primary-text" : "text-pl-muted",
                                    hasError && "text-pl-danger-text"
                                )}>
                                    {step.title}
                                </h4>
                                {isActive && (
                                    <p className="text-xs text-pl-muted mt-1 animate-in fade-in slide-in-from-left-2">
                                        {step.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WorkflowGuide;