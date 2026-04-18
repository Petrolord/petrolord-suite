import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BookOpen, Video, HelpCircle, Lightbulb } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const InterpretationGuide = () => {
    return (
        <Card className="bg-slate-900 h-full flex flex-col border border-slate-800">
            <CardHeader className="pb-2 border-b border-slate-800">
                <CardTitle className="flex items-center gap-2 text-sm"><BookOpen className="w-4 h-4 text-purple-400"/> Knowledge Base</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full p-4">
                    <div className="mb-6">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2"><Lightbulb className="w-3 h-3"/> Best Practices</h4>
                        <div className="space-y-3 text-sm text-slate-400">
                            <p className="leading-relaxed bg-slate-950 p-3 rounded border border-slate-800">
                                <strong>Normalization:</strong> Always normalize curves (Z-Score or Min-Max) before running unsupervised clustering to ensure equal weighting.
                            </p>
                            <p className="leading-relaxed bg-slate-950 p-3 rounded border border-slate-800">
                                <strong>Rare Facies:</strong> If identifying coal or anhydrite, manually label a few intervals and use the "Supervised" mode with Class Balancing enabled.
                            </p>
                        </div>
                    </div>

                    <Accordion type="single" collapsible className="w-full space-y-2 mb-6">
                        <AccordionItem value="item-1" className="border-slate-800">
                            <AccordionTrigger className="text-slate-200 py-2 text-sm">Facies Signatures</AccordionTrigger>
                            <AccordionContent className="text-slate-400 text-xs space-y-2">
                                <p><span className="text-yellow-400 font-semibold">Sandstone:</span> Low GR, crossover on Density-Neutron (if gas bearing).</p>
                                <p><span className="text-gray-400 font-semibold">Shale:</span> High GR, large separation on Density-Neutron.</p>
                                <p><span className="text-blue-400 font-semibold">Limestone:</span> Matrix density ~2.71 g/cc, low GR, PEF ~5.</p>
                                <p><span className="text-purple-400 font-semibold">Dolomite:</span> Matrix density ~2.87 g/cc, PEF ~3.</p>
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="item-2" className="border-slate-800">
                            <AccordionTrigger className="text-slate-200 py-2 text-sm">Model Troubleshooting</AccordionTrigger>
                            <AccordionContent className="text-slate-400 text-xs space-y-2">
                                <p><strong>High Noise:</strong> Apply a median filter (smoothing) in the Data QC tab.</p>
                                <p><strong>Misclassification:</strong> Check for bad hole conditions (caliper &gt; bit size) or barite mud affecting PEF.</p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                    
                    <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2"><Video className="w-3 h-3"/> Tutorials</h4>
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 p-2 rounded hover:bg-slate-800 cursor-pointer text-sm text-blue-400 transition-colors">
                                <div className="bg-blue-900/20 p-1.5 rounded"><Video className="w-3 h-3" /></div> 
                                <span>Workflow: End-to-End Analysis</span>
                            </div>
                            <div className="flex items-center gap-3 p-2 rounded hover:bg-slate-800 cursor-pointer text-sm text-blue-400 transition-colors">
                                <div className="bg-blue-900/20 p-1.5 rounded"><Video className="w-3 h-3" /></div> 
                                <span>Advanced: Rock Typing</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

export default InterpretationGuide;