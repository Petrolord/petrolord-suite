import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

const QuickStartGuide = () => {
    const steps = [
        {
            title: "Pick the Wellbore",
            description: "Choose a site and wellbore in the project explorer. The trajectory comes from the definitive design saved in Well Design Studio.",
            action: "Left Panel"
        },
        {
            title: "Set the Environment",
            description: "Enter mud, cement and packer fluid densities, the temperature profile, and pore/frac EMWs (sync from published Pore Pressure Studio curves when available).",
            action: "Well & Loads Tab"
        },
        {
            title: "Define Load Cases",
            description: "Configure the canonical scenarios: gas kick, pressure test, evacuation, cementing, running, and the tubing operating cases.",
            action: "Load Cases Tab"
        },
        {
            title: "Configure Strings",
            description: "Add casing sections with real API 5CT tubulars from the catalog; set the tubing string and packer.",
            action: "Casing / Tubing Tabs"
        },
        {
            title: "Verify & Save",
            description: "Check the worst-point safety factors against your design factors, then save the case to the wellbore.",
            action: "Results / Save Design"
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
                    Duplicate a saved case before big changes; each case keeps its own strings, load cases and results, so alternatives stay comparable.
                </p>
            </div>
        </div>
    );
};

export default QuickStartGuide;