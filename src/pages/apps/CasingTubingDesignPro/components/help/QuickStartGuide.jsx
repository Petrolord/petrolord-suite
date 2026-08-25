import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

const QuickStartGuide = () => {
    const steps = [
        {
            title: "Load Well & Environment",
            description: "Select a well from the project explorer or import data from Well Design Studio. Define pore pressure and fracture gradients.",
            action: "Well & Loads Tab"
        },
        {
            title: "Define Load Cases",
            description: "Set up design scenarios like Production, Burst, Collapse, and Stimulation. Configure fluid densities and surface pressures.",
            action: "Load Cases Tab"
        },
        {
            title: "Configure Casing Strings",
            description: "Add casing sections, set top/bottom depths, and select grades/weights from the catalog.",
            action: "Casing Design Tab"
        },
        {
            title: "Design Tubing & Completion",
            description: "Configure production tubing, add packers, safety valves, and other completion accessories.",
            action: "Tubing Design Tab"
        },
        {
            title: "Verify & Export",
            description: "Check safety factors against limits (1.1 Burst, 1.0 Collapse). Visualize the string and export reports to AFE.",
            action: "Visualizer / Export"
        }
    ];

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-2">Getting Started</h3>
            <p className="text-sm text-slate-400 mb-4">Follow these steps to complete a standard casing and tubing design workflow.</p>
            
            <div className="space-y-3">
                {steps.map((step, idx) => (
                    <Card key={idx} className="bg-slate-900 border-slate-800">
                        <CardContent className="p-3">
                            <div className="flex items-start">
                                <div className="flex-shrink-0 h-6 w-6 rounded-full bg-lime-900/30 text-lime-400 flex items-center justify-center text-xs font-bold mr-3 mt-0.5">
                                    {idx + 1}
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-200">{step.title}</h4>
                                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{step.description}</p>
                                    <div className="mt-2 flex items-center text-[10px] text-blue-400 font-medium bg-blue-900/10 px-2 py-1 rounded w-fit">
                                        <ArrowRight className="w-3 h-3 mr-1" /> {step.action}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
            
            <div className="mt-6 bg-emerald-900/10 border border-emerald-900/30 p-4 rounded-lg">
                <h4 className="text-sm font-bold text-emerald-400 flex items-center mb-2">
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Pro Tip
                </h4>
                <p className="text-xs text-emerald-200/70">
                    Use the <strong>"String Visualizer"</strong> tab to compare multiple design iterations side-by-side before finalizing your selection.
                </p>
            </div>
        </div>
    );
};

export default QuickStartGuide;