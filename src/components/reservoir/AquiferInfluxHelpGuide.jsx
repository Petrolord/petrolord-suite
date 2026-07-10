import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BookOpen, Waves, Settings2, Calculator, BarChart3, AlertTriangle } from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this computes',
    content:
      "This tool estimates the cumulative water influx We(t) that an aquifer contributes to a reservoir, given the reservoir-boundary pressure as it declines over time. We is the water-drive term in a material balance and a key driver of pressure support and recovery. The calculator runs entirely in your browser — no data leaves the page.",
  },
  {
    id: 'methods',
    icon: Waves,
    title: 'The three methods',
    content:
      "van Everdingen-Hurst (vEH) is the rigorous constant-terminal-pressure solution for a radial (edge-water) aquifer; it superposes the pressure history against the dimensionless influx function WD(tD) and is the reference method. Carter-Tracy is a marching approximation to vEH that avoids the superposition sum — convenient for large or effectively-infinite aquifers, and it should track vEH closely. Fetkovich is a finite-aquifer, pseudo-steady-state productivity-index method: it needs the aquifer water volume W and productivity index J (or the geometry to derive them) and is stable and cheap.",
  },
  {
    id: 'params',
    icon: Settings2,
    title: 'Aquifer parameters',
    content:
      "vEH and Carter-Tracy use the aquifer influx constant U = 1.119·f·φ·ct·h·rR² and the dimensionless time tD = 6.33e-3·k·t/(φ·μw·ct·rR²), where f = θ/360 is the encroachment-angle fraction and rR is the reservoir (inner aquifer) radius. Enter permeability k (md), water viscosity μw (cp), porosity φ, total compressibility ct = cw + cf (1/psi), thickness h (ft), radius rR (ft), and θ (degrees; 360 = full radial, 180 = edge). For Fetkovich you can also give the outer radius re, or W and J directly.",
  },
  {
    id: 'history',
    icon: Calculator,
    title: 'Pressure history',
    content:
      "Enter the boundary pressure at a series of times in days. The first row defines the initial pressure pi at t = 0, where We = 0. Add rows manually, or use Import to paste a table of \"time_days, pressure_psia\" lines. The methods assume the pressure you enter is the pressure at the reservoir/aquifer interface. Roughly even time steps give the most stable superposition.",
  },
  {
    id: 'read',
    icon: BarChart3,
    title: 'Reading the results',
    content:
      "The KPI cards show cumulative We, the latest influx rate, a qualitative aquifer-strength read, and either the final dimensionless time tD (vEH / Carter-Tracy) or the maximum encroachable water Wei (Fetkovich). The chart overlays We against the pressure decline, and the results table lists We at every timestep. Export writes the full We history to CSV. Compare methods: if Carter-Tracy diverges sharply from vEH, check that your aquifer is large enough for the infinite-acting assumption.",
  },
  {
    id: 'assumptions',
    icon: AlertTriangle,
    title: 'Assumptions & limitations',
    content:
      "This is a screening engine. vEH and Carter-Tracy assume a radial, homogeneous, infinite-acting aquifer; Fetkovich assumes a finite aquifer in pseudo-steady state. None capture aquifer heterogeneity, layering, or a linear/bottom-water geometry beyond the θ and radius inputs. Water influx is notoriously non-unique — several aquifer models can match the same history. Confirm the result against reservoir simulation or a full MBAL history match before using it in reserves or development decisions.",
  },
];

const AquiferInfluxHelpGuide = ({ isOpen, onOpenChange }) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[620px] bg-slate-900 border-slate-700 text-white">
      <DialogHeader>
        <DialogTitle className="text-sky-300 text-xl">Aquifer Influx Calculator — Help Guide</DialogTitle>
        <DialogDescription>
          How to compute cumulative water influx We(t) from a pressure history.
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
                    <Icon className="w-5 h-5 mr-3 text-sky-400" />
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

export default AquiferInfluxHelpGuide;
