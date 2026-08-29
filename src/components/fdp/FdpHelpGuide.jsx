// FDP Accelerator help guide (Economics E3).
//
// The app previously carried a "Help Center" module backed by mock FAQs,
// mock articles and mock video tutorials, none of which existed. This is the
// real thing: what the tool does, what it does not, and where its numbers
// come from.
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Compass, Layers, DollarSign, FolderOpen, FileText, AlertTriangle, FlaskConical,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this tool is',
    content:
      'The FDP Accelerator is a structured workspace for assembling a field development plan: the field and its subsurface, the development concepts you are weighing, wells, facilities, schedule, costs and screening economics, HSE, community and risk, and the document that comes out of it. It is a place to hold a plan together and see it whole. The detailed engineering behind each part belongs to the specialist studios in the Suite.',
  },
  {
    id: 'modes',
    icon: Compass,
    title: 'Guided and Expert modes',
    content:
      'Guided mode walks the sections in order and is the way to build a plan from nothing. Expert mode gives you the whole sidebar and is the way to come back to one section. They edit the same plan, so switch whenever it suits you.',
  },
  {
    id: 'plans',
    icon: FolderOpen,
    title: 'Saving a plan',
    content:
      'Use the Saved plan selector in the top bar to create a plan. Once one is open it auto-saves about ten seconds after each change and the indicator beside it shows the last save; click the indicator to save immediately. Work also survives a page refresh before you have named anything, because the app keeps a local draft in this browser. That draft is a convenience and not a home: it lives in one browser only, so name and save a plan you intend to keep.',
  },
  {
    id: 'example',
    icon: FlaskConical,
    title: 'The example data',
    content:
      'Several tabs offer a Load example button. It fills that section with an illustrative offshore oil development so you can see the shape of a complete plan. It is labelled as an example everywhere it appears because it is not your project and not benchmark data. Earlier versions of this app presented the same numbers as a live sync from the Geoscience, Reservoir, Well Design, AFE and Project Management apps, which was never true and is the reason the button now says what it does.',
  },
  {
    id: 'economics',
    icon: DollarSign,
    title: 'The economics, and their tier',
    content:
      'The Economics tab runs your cost items and a production profile through the Suite screening economics engine, post royalty and tax, discounted mid year. That means an NPV here means the same thing as one in the NPV Scenario Builder. Until August 2026 this calculation applied no fiscal terms at all: it was revenue minus operating cost on a card labelled NPV at 10 percent, which overstates project value by roughly forty percent on ordinary Nigerian terms. Full fiscal detail under the PIA and the Nigeria Tax Act belongs to Petroleum Economics Studio, and a plan heading for sanction should be valued there.',
  },
  {
    id: 'sections',
    icon: Layers,
    title: 'Where each number should come from',
    content:
      'Reserves and reservoir properties belong to your volumetric and material balance work; bring the numbers from ReservoirCalc Pro or Material Balance Studio. Well counts, depths and costs belong to Well Design Studio and the well cost tools. Facility capacities and costs belong to the Facilities studios. Schedule belongs to your planning tool. This app holds the plan together and does not re-derive any of it, so a figure typed here is only as good as the work behind it.',
  },
  {
    id: 'document',
    icon: FileText,
    title: 'Generating the document',
    content:
      'The Documents tab compiles what you have entered into an FDP document and exports it. It reports what is present and what is missing rather than filling gaps, so a thin section comes out thin. The Plan status panel on the right lists what is still empty, checked against the plan itself.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Limits',
    content:
      'There is no live connection to the other Suite apps yet, so data moves by hand. Economics is the screening tier described above. The tool models one plan at a time; comparing development options is the Scenarios tab, and comparing whole projects for funding belongs to Capital Portfolio Studio. Nothing here is a substitute for the specialist studies a real plan rests on.',
  },
];

export const FdpHelpContent = () => (
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

const FdpHelpGuide = () => (
  <StudioHelp
    title="FDP Accelerator"
    description="How a plan is built and saved, where its numbers should come from, and what the tool does not do."
  >
    <FdpHelpContent />
  </StudioHelp>
);

export default FdpHelpGuide;
