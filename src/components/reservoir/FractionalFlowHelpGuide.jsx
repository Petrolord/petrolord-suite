import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BookOpen, Sliders, Beaker, GitMerge, TrendingUp, Scale, AlertTriangle } from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What is this tool?',
    content:
      "This is a 1-D Buckley-Leverett fractional-flow analyzer for immiscible displacement (typically waterflooding an oil reservoir). From relative-permeability and viscosity inputs it builds the water fractional-flow curve fw(Sw), applies the Welge tangent construction to find the shock-front saturation, and predicts water breakthrough and oil recovery versus pore volumes injected.",
  },
  {
    id: 'inputs',
    icon: Sliders,
    title: 'Step 1: Relative permeability inputs',
    content:
      "Relative permeability is modelled with Corey correlations. Enter Swc (connate water saturation) and Sor (residual oil saturation) to set the movable-saturation window, the endpoints krw @ Sor and kro @ Swc, and the Corey exponents nw and no that control curvature. Larger exponents make the curves more concave and typically sharpen the displacement front.",
  },
  {
    id: 'fluids',
    icon: Beaker,
    title: 'Step 2: Fluid viscosities',
    content:
      "Enter water viscosity μw and oil viscosity μo in centipoise. Together with the endpoint relative permeabilities these set the endpoint mobility ratio M = (krw/μw) / (kro/μo). Viscosity is often the single biggest lever on displacement quality, especially for heavier oils.",
  },
  {
    id: 'fw',
    icon: GitMerge,
    title: 'Step 3: Fractional flow & the Welge tangent',
    content:
      "fw is the fraction of water in the flowing stream at a given saturation. The tangent drawn from (Swc, 0) to the fw curve gives the shock-front saturation Swf and the fraction fwf at the front. Where the tangent touches the curve is the leading edge of the flood; the average saturation behind the front is read where that tangent line reaches fw = 1.",
  },
  {
    id: 'recovery',
    icon: TrendingUp,
    title: 'Step 4: Breakthrough & recovery',
    content:
      "Pore volumes injected at breakthrough = 1 / fw′(Swf). The recovery chart shows displacement efficiency ED versus pore volumes injected: a sharp rise to breakthrough, then a long tail of high-water-cut production. Ultimate displacement efficiency ED = (1 − Sor − Swc)/(1 − Swc) — the fraction of oil the flood can move under ideal 1-D sweep.",
  },
  {
    id: 'mobility',
    icon: Scale,
    title: 'Reading the mobility ratio M',
    content:
      "M ≤ 1: favorable — piston-like displacement, late breakthrough, efficient sweep. 1 < M ≤ 3: moderately unfavorable — some viscous fingering and earlier breakthrough. M > 3: unfavorable — strong fingering, early breakthrough and a prolonged high-water-cut tail. M is the quickest single indicator of how well the flood will sweep before you look at the curves.",
  },
  {
    id: 'assumptions',
    icon: AlertTriangle,
    title: 'Assumptions & limitations',
    content:
      "This is the classic 1-D Buckley-Leverett model: horizontal, immiscible, incompressible flow with no capillary-pressure or gravity term, and a single homogeneous rock type. It captures front dynamics and displacement efficiency, not areal or vertical sweep, heterogeneity, gravity override or three-phase effects. Treat it as a screening and teaching tool, and validate against simulation for field decisions.",
  },
];

const FractionalFlowHelpGuide = ({ isOpen, onOpenChange }) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[620px] bg-slate-900 border-slate-700 text-white">
      <DialogHeader>
        <DialogTitle className="text-lime-300 text-xl">Fractional Flow (Buckley-Leverett) — Help Guide</DialogTitle>
        <DialogDescription>
          From Corey relative permeability to breakthrough and oil recovery.
        </DialogDescription>
      </DialogHeader>
      <ScrollArea className="h-[60vh] pr-4">
        <Accordion type="single" collapsible className="w-full" defaultValue="what">
          {helpContent.map((item) => {
            const Icon = item.icon;
            return (
              <AccordionItem value={item.id} key={item.id}>
                <AccordionTrigger className="text-base hover:no-underline">
                  <div className="flex items-center">
                    <Icon className="w-5 h-5 mr-3 text-lime-400" />
                    {item.title}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-slate-300 pl-8 leading-relaxed">
                  {item.content}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </ScrollArea>
    </DialogContent>
  </Dialog>
);

export default FractionalFlowHelpGuide;
