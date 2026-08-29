// Crude Assay & Blending Studio help guide (DS1).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Beaker, Scale, Droplets, LineChart, DollarSign, AlertTriangle, FolderOpen,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this tool answers',
    content:
      'Four questions about a barrel. What does it turn into when you distil it. What happens to the properties when you mix two crudes. Will the mixture drop asphaltenes in your tank. And what is it worth against the crude you already buy. Everything in the app serves one of those four.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved studies',
    content:
      'Create a study from the selector at the top. Your assays, cut points and prices auto-save about ten seconds after each change, and the indicator shows the last save. Results are recomputed from the inputs rather than stored, so a reopened study cannot show numbers that no longer follow from what is in it.',
  },
  {
    id: 'assays',
    icon: Beaker,
    title: 'Entering an assay',
    content:
      'Each crude carries its gravity, sulfur, TAN, viscosity, nitrogen and metals, and a TBP distillation curve as volume percent distilled against temperature. Crude assays are reported as TBP distillations (D2892 and D5236), which is what this app takes. The two crudes it opens with are illustrative starting figures rather than published assay sheets; replace them with the seller\'s assay before the numbers mean anything about a real cargo.',
  },
  {
    id: 'blending',
    icon: Scale,
    title: 'Why each property blends on its own basis',
    content:
      'This is the part that goes wrong quietly. Density blends on VOLUME, because mass is conserved and volume is assumed to be. Sulfur, TAN, nitrogen and metals are quantities per unit MASS, so they blend on mass, and the mass fractions come from the densities. Viscosity blends on neither and needs an index. And API gravity does not blend at all: it is a hyperbola in density, so averaging two API numbers is simply wrong. A 50/50 blend of 20 and 40 API is 29.38, not 30. Six tenths of a degree sounds like nothing and is the difference between two grades on a price sheet. Every figure here reports the basis it was computed on.',
  },
  {
    id: 'viscosity',
    icon: Droplets,
    title: 'Viscosity and the blending index',
    content:
      'Viscosity is wildly non-linear in composition: a 50/50 blend of a 10 cSt and a 1000 cSt oil is nowhere near 505 cSt, it is closer to 100. The app uses the Refutas index, which linearises the double logarithm of viscosity so the blend can be taken as a weighted mean and inverted. The index is blended on mass fraction, which is the classic Refutas formulation. If any component viscosity is missing or below about 0.2 cSt, where the index is undefined, the app reports no blended viscosity rather than quietly blending the rest.',
  },
  {
    id: 'stability',
    icon: AlertTriangle,
    title: 'The asphaltene stability screen',
    content:
      'Blending a heavy asphaltenic crude with a light paraffinic one is the classic way to drop asphaltenes in a tank or a preheat train. Where you supply a SARA analysis for every crude, the app forms the colloidal instability index, the ratio of saturates plus asphaltenes to aromatics plus resins, because saturates precipitate asphaltenes while aromatics and resins hold them. Below about 0.7 screens stable, above about 0.9 screens unstable, and the band between is where blends go either way. Without SARA it falls back to a gravity-contrast heuristic and tells you that is what it did, because a screening result whose basis is unstated invites more confidence than it has earned. Either way, a blend near the line is a spot test to ASTM D7112 or D7157, not an argument.',
  },
  {
    id: 'yields',
    icon: LineChart,
    title: 'Cut yields',
    content:
      'A cut\'s yield is the volume between its boiling bounds, read off the distillation curve. The cut points are yours to set, because every refinery draws them where its own units want them. The blend\'s curve is built by mixing the component yields at each temperature, which is the quantity that is additive; averaging the components\' temperatures would mean nothing. If your cut set does not cover the whole curve the app says the yields do not close to 100 rather than scaling them up, because scaling would hide the gap.',
  },
  {
    id: 'netback',
    icon: DollarSign,
    title: 'Netback and the differential',
    content:
      'The value of a barrel is its own yields times the price of each cut, less losses, processing and freight. That follows the assay rather than a rule of thumb about gravity and sulfur, which is the point of doing it this way. Every term is shown separately because the argument with a seller is always about one of them. A cut with no price is named rather than counted as free: a missing price silently treated as zero understates the crude and loses the argument for the wrong reason. Enter a marker netback to see the differential.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Limits',
    content:
      'This is a screening tool for evaluation and blending decisions, not a refinery model: it distils the barrel and values the cuts, and it does not simulate conversion units, so the yields are straight-run. Volumes are assumed to mix without shrinkage, which is a good assumption for crudes of similar character and a poorer one at wide gravity contrast. Pour point is not blended, and D86 to TBP conversion is not offered, because both rest on published correlation tables this package will not reproduce from memory; a crude assay is a TBP distillation in the first place. The stability screen is a screen. Confirm marginal blends in a lab.',
  },
];

export const CrudeAssayHelpContent = () => (
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

const CrudeAssayHelpGuide = () => (
  <StudioHelp
    title="Crude Assay & Blending Studio"
    description="How each property is blended, how the stability screen works, and what the netback does and does not include."
  >
    <CrudeAssayHelpContent />
  </StudioHelp>
);

export default CrudeAssayHelpGuide;
