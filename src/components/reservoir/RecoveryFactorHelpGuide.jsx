// Recovery Factor Estimator help content, rendered inside the StudioHelp
// sheet (the kit upgrade re-housed this from a standalone Dialog).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BookOpen, FolderOpen, Layers, Percent, Calculator, BarChart3, AlertTriangle } from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this estimates',
    content:
      "The Recovery Factor (RF) is the fraction of oil- or gas-in-place that you expect to produce. This tool closes the volumetrics-to-reserves bridge: Recoverable Reserves = RF × OOIP (or OGIP). It gives you a defensible RF and a low/typical/high reserves band, either from published drive-mechanism analog ranges or from empirical correlations.",
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Projects and auto-save',
    content:
      'Use the Project selector in the left rail to create a project. Once a project is open, your phase, method and every input auto-save about 10 seconds after each change, and the save indicator in the header shows when the last save happened. Click the indicator to save immediately. Reopening the app restores the project exactly as you left it.',
  },
  {
    id: 'inplace',
    icon: Layers,
    title: 'Step 1: In-place volume (OOIP / OGIP)',
    content:
      "Start by choosing the phase, oil or gas, because that choice drives the whole screen. Then enter the in-place volume directly if you already have it from a volumetrics study, or use the built-in volumetric calculator. For oil, OOIP = 7758·A·h·φ·(1−Sw)·NTG / Boi in STB. For gas, OGIP = 43560·A·h·φ·(1−Sw)·NTG / Bgi in scf. Area in acres, thickness in ft, porosity and saturations as fractions. These are the same relations used by the volumetrics apps, so numbers carry across cleanly. The Sample button in the header loads a worked case if you want to see the whole flow before entering your own data.",
  },
  {
    id: 'analog',
    icon: Percent,
    title: 'Step 2: Method, drive-mechanism analog (default)',
    content:
      "Pick the reservoir's primary drive mechanism and the tool returns a published low, typical and high recovery band for it. Five oil mechanisms are offered: solution-gas drive at 5 to 30%, gas-cap expansion at 20 to 40%, water drive at 35 to 75%, gravity drainage at 40 to 80%, and combination drive at 20 to 50%. Two gas mechanisms are offered: volumetric depletion at 70 to 90%, and water drive at 35 to 75%, which is lower because an advancing aquifer traps gas behind the front. These are screening ranges from industry literature; they are transparent and hard to abuse, and they always appear as a sanity band alongside any correlation result.",
  },
  {
    id: 'correlations',
    icon: Calculator,
    title: 'Step 2 (alt): Correlations',
    content:
      "The method menu is filtered by phase, so you only see what applies. For oil, the API (1967) solution-gas-drive and water-drive correlations take rock, fluid and pressure inputs and return a point estimate. For gas, choose the exact p/z depletion relation RF = 1 − (pa/za)/(pi/zi), or the water-drive gas method, which accounts for residual gas trapped behind the invading water at the abandonment condition. The API correlations are empirical fits with wide scatter and are flagged with a warning: always compare them to the analog band before trusting them.",
  },
  {
    id: 'read',
    icon: BarChart3,
    title: 'Step 3: Read the reserves band',
    content:
      "The KPI cards show the selected RF, the analog range, the in-place volume and the recoverable reserves. The chart shows the low, estimate and high reserves range so you can see the uncertainty at a glance. Use the analog band as your P90 to P10 screening spread until you have simulation or analog-field data to tighten it.",
  },
  {
    id: 'reference',
    icon: Layers,
    title: 'The drive-mechanism reference table',
    content:
      "Below the chart, every mechanism the tool knows is listed with its recovery band and a note on what makes it efficient or inefficient: which mechanisms respond to pressure maintenance, where structural relief and vertical permeability matter, and why aquifer support helps an oil reservoir but hurts a gas one. Use it to sanity-check the mechanism you picked against how the reservoir actually behaves, and to see at a glance what a different interpretation would do to your reserves.",
  },
  {
    id: 'assumptions',
    icon: AlertTriangle,
    title: 'Assumptions and limitations',
    content:
      "This is a screening tool, not a substitute for reservoir simulation or a full reserves study. Analog ranges are broad and field-specific; correlations were derived from limited datasets and can be well off for any single reservoir. Recovery also depends on the development plan, well count, secondary and tertiary recovery, and economics. None of those are captured here, so treat the output as an early-stage estimate to be refined.",
  },
];

const RecoveryFactorHelpContent = () => (
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
);

export default RecoveryFactorHelpContent;
