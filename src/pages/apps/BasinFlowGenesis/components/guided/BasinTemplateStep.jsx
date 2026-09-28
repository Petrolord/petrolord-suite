import React from 'react';
import { useGuidedMode } from '../../contexts/GuidedModeContext';
import { BasinTemplates } from '../../data/BasinTemplates';
import { Card } from '@/components/ui/card';
import { CheckCircle2, Info, Layers, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

const BasinTemplateStep = () => {
    const { wizardData, selectTemplate } = useGuidedMode();

    const selectedTemplate = BasinTemplates.find(t => t.id === wizardData.selectedTemplateId);

    return (
        <div className="h-full flex flex-col lg:flex-row gap-6">
            {/* Left: Template Grid */}
            <div className="flex-1 flex flex-col">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-pl-text mb-2">Select Basin Template</h2>
                    <p className="text-pl-muted">Choose the geological setting that best matches your area of interest.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 overflow-y-auto pr-2">
                    {BasinTemplates.map((template) => {
                        const isSelected = wizardData.selectedTemplateId === template.id;
                        
                        return (
                            <div 
                                key={template.id}
                                onClick={() => selectTemplate(template.id)}
                                className={cn(
                                    "relative cursor-pointer flex gap-4 p-4 rounded-xl border-2 transition-all duration-200",
                                    isSelected 
                                        ? "border-pl-primary bg-pl-surface shadow-pl-sm"
                                        : "border-pl-border bg-pl-surface hover:border-pl-border-strong hover:bg-pl-sunken"
                                )}
                            >
                                <div className="w-24 h-24 shrink-0 rounded-lg bg-pl-sunken overflow-hidden bg-cover bg-center"
                                     style={{ backgroundImage: `url(${template.image})` }} 
                                />
                                
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <h3 className={cn("text-lg font-bold mb-1", isSelected ? "text-pl-primary-text" : "text-pl-text")}>
                                            {template.name}
                                        </h3>
                                        {isSelected && <CheckCircle2 className="w-5 h-5 text-pl-primary-text" />}
                                    </div>
                                    
                                    <p className="text-sm text-pl-muted leading-relaxed mb-2">
                                        {template.description}
                                    </p>

                                    <div className="flex flex-wrap gap-2">
                                        {template.useCases.map((useCase, i) => (
                                            <span key={i} className="px-2 py-0.5 rounded text-[10px] font-medium bg-pl-sunken text-pl-muted border border-pl-border">
                                                {useCase}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Right: Details Panel */}
            <div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-pl-border pt-4 lg:pt-0 lg:pl-6 flex flex-col">
                {selectedTemplate ? (
                    <div className="animate-in slide-in-from-right-4 fade-in duration-300">
                        <h3 className="text-sm font-bold text-pl-muted uppercase mb-4 flex items-center gap-2">
                            <Info className="w-4 h-4" /> Template Details
                        </h3>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="text-xs text-pl-muted font-bold block mb-2">Data Requirements</label>
                                <ul className="space-y-2">
                                    {selectedTemplate.dataRequirements.map((req, i) => (
                                        <li key={i} className="flex items-start gap-2 text-xs text-pl-text">
                                            <Database className="w-3 h-3 mt-0.5 text-pl-muted" />
                                            {req}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <label className="text-xs text-pl-muted font-bold block mb-2">Default Stratigraphy</label>
                                <div className="bg-pl-surface rounded-lg border border-pl-border p-3">
                                    <div className="space-y-1.5">
                                        {selectedTemplate.defaultStratigraphy.map((layer, i) => (
                                            <div key={i} className="flex items-center gap-2 text-xs">
                                                <div className="w-2 h-2 rounded-full bg-pl-border-strong" />
                                                <span className="text-pl-text flex-1 truncate">{layer.name}</span>
                                                <span className="text-pl-muted font-mono">{layer.thickness}m</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-3 pt-2 border-t border-pl-border text-[10px] text-pl-muted text-center">
                                        <Layers className="w-3 h-3 inline mr-1" />
                                        Total Thickness: {selectedTemplate.defaultStratigraphy.reduce((sum, l) => sum + l.thickness, 0)}m
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center text-center text-pl-muted p-4 border-2 border-dashed border-pl-border rounded-xl">
                        <div>
                            <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Select a template to view details</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BasinTemplateStep;