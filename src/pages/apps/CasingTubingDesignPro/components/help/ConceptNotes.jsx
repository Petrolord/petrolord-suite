import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const ConceptNotes = () => {
    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-pl-text mb-2">Design Concepts</h3>
            <p className="text-sm text-pl-muted mb-4">Key engineering principles used in casing and tubing calculations.</p>

            <Accordion type="single" collapsible className="w-full space-y-2">
                <AccordionItem value="burst" className="rounded border border-pl-border bg-pl-surface px-2">
                    <AccordionTrigger className="text-sm hover:no-underline">
                        Burst Calculation
                    </AccordionTrigger>
                    <AccordionContent className="text-xs text-pl-muted leading-relaxed border-t border-pl-border pt-2">
                        <p className="mb-2"><strong className="text-pl-text">Definition:</strong> Failure mode where internal pressure exceeds external pressure and the material yield strength.</p>
                        <p><strong>Formula:</strong> SF = API Burst Rating / Differential Pressure</p>
                        <p className="mt-2">The API Burst Rating is calculated using Barlow's formula: <code>P = 0.875 * (2 * Yp * t) / D</code>, where Yp is yield strength, t is wall thickness, and D is OD.</p>
                    </AccordionContent>
                </AccordionItem>

                <AccordionItem value="collapse" className="rounded border border-pl-border bg-pl-surface px-2">
                    <AccordionTrigger className="text-sm hover:no-underline">
                        Collapse Calculation
                    </AccordionTrigger>
                    <AccordionContent className="text-xs text-pl-muted leading-relaxed border-t border-pl-border pt-2">
                        <p className="mb-2"><strong className="text-pl-text">Definition:</strong> Failure mode where external pressure exceeds internal pressure, causing the pipe to crush.</p>
                        <p><strong>Formula:</strong> SF = API Collapse Rating / Differential Pressure</p>
                        <p className="mt-2">Collapse strength depends on D/t ratio. It transitions through four regimes: Yield, Plastic, Transition, and Elastic collapse.</p>
                    </AccordionContent>
                </AccordionItem>

                <AccordionItem value="tension" className="rounded border border-pl-border bg-pl-surface px-2">
                    <AccordionTrigger className="text-sm hover:no-underline">
                        Axial Tension
                    </AccordionTrigger>
                    <AccordionContent className="text-xs text-pl-muted leading-relaxed border-t border-pl-border pt-2">
                        <p className="mb-2"><strong className="text-pl-text">Definition:</strong> Failure due to longitudinal weight of the string, including buoyancy effects.</p>
                        <p><strong>Formula:</strong> SF = Body Yield Strength / Effective Tension</p>
                        <p className="mt-2">Effective Tension includes the weight of the string in air minus the buoyancy force provided by the drilling fluid.</p>
                    </AccordionContent>
                </AccordionItem>

                <AccordionItem value="triaxial" className="rounded border border-pl-border bg-pl-surface px-2">
                    <AccordionTrigger className="text-sm hover:no-underline">
                        Triaxial (VME) Stress
                    </AccordionTrigger>
                    <AccordionContent className="text-xs text-pl-muted leading-relaxed border-t border-pl-border pt-2">
                        <p className="mb-2"><strong className="text-pl-text">Definition:</strong> Combined stress analysis using Von Mises Equivalent (VME) stress.</p>
                        <p><strong>Logic:</strong> Considers the interaction of axial, radial, and tangential stresses.</p>
                        <p className="mt-2">Essential for high-pressure/high-temperature (HPHT) wells where simple uniaxial checks are insufficient.</p>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
};

export default ConceptNotes;