// Separator & Slug Catcher Studio help content (Facilities F5).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Wind, Droplets, Layers, Ruler, Waves, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'Mechanical sizing of separators and slug catchers: how big the vessel has to be for the gas to drop its liquid and the liquids to separate from each other. That is a different question from what leaves each stage of a separation train, which is the Fluid Systems Studio\'s flash calculation. This one takes the rates and conditions and answers with a diameter, a length and the reason that length was chosen.',
  },
  {
    id: 'k',
    icon: Wind,
    title: 'The K value and the gas load',
    content:
      'Gas capacity comes from the Souders-Brown relation: the gas may not rise faster than a droplet falls. The K in it depends on the vessel orientation and the mist extractor, and it derates with pressure, which the studio applies from the published rule. Below a floor the derating stops meaning anything and the studio says so rather than quietly extrapolating. A vendor K always wins if you type one. The gas density behind all of this comes from the validated compressibility correlation at your conditions, not a fixed number. The oil density is taken at the separator temperature: its 60 degF value from the API gravity, corrected with the API crude-oil expansion (a 32 API oil is about 3.6 percent lighter at 140 degF). Water gravity is used as you enter it.',
  },
  {
    id: 'geometry',
    icon: Layers,
    title: 'Horizontal geometry, exactly',
    content:
      'A horizontal vessel at half level is not the only case, and the gas space at any other level is a circular segment, not a simple fraction. The studio computes the liquid and gas areas by exact segment geometry at whatever level you set, so raising the level to buy retention time correctly costs you gas area, and the trade-off is visible instead of hidden in an assumption.',
  },
  {
    id: 'lengths',
    icon: Ruler,
    title: 'Two lengths, and which one wins',
    content:
      'A horizontal separator has two independent length requirements: the gas needs enough length for a droplet to fall through the gas space before the gas carries it out, and the liquid needs enough volume to hold its retention time. The vessel is the larger of the two, and the studio reports both and names the controlling one. That matters because they respond to different fixes: a gas-controlled vessel wants a bigger diameter, a liquid-controlled one wants more length or less retention time.',
  },
  {
    id: 'threephase',
    icon: Droplets,
    title: 'Three phase and the check that catches carryover',
    content:
      'Oil and water each need their own retention time in their own layer. The studio splits the liquid cross-section between them in proportion to the two retention volumes and places the oil-water interface at the exact height that share implies, so one retention length satisfies both, and it tells you whether that length or the gas set the vessel. The interface height, the water layer and the oil layer are all reported. It then asks the question retention time alone cannot answer: can a water droplet of the size you name fall through the oil layer, and an oil droplet of its own size rise through the water, in the residence the sized vessel gives them. Those two droplet sizes are separate inputs, because they are different jobs: 500 micron water out of oil and 200 micron oil out of water are the customary figures. On a thick, cold oil the answer is often no, and a vessel that meets every retention target still carries water over. The studio warns when a settling check fails, because that is the failure people are surprised by, and a candidate that fails one is marked unfeasible in the L/D family so it can never be selected.',
  },
  {
    id: 'ld',
    icon: Ruler,
    title: 'The L/D family',
    content:
      'Rather than pin one slenderness, the studio sizes every candidate diameter you give it and shows the family with the L/D of each. The customary band is three to four for a two-phase horizontal separator, three to five for a three-phase one (the extra length buys the oil-water retention) and two to four for a vertical one, and the band fields switch to the band for the new type when you change the vessel type (unless you have edited them). The selected vessel is the smallest candidate that both works and sits inside the band, where working means it carries the gas and, on a three-phase vessel, passes both droplet checks. Each row says which of those it fails. When nothing qualifies, the studio selects nothing and says whether no candidate works at all or whether the ones that work are all outside the band. A vessel outside the band still separates; it is just an awkward thing to build, ship and support, and seeing the whole family makes that a choice rather than an accident.',
  },
  {
    id: 'inputs',
    icon: BookOpen,
    title: 'The example case and missing inputs',
    content:
      'A new study opens with an illustrative example case so the whole chain has something to show. Replace those values with your own. If you clear a required field, it stays blank: the studio does not put a typical gas gravity, oil gravity, retention time, droplet size or finger size back in its place. The results are replaced by a message naming each required input that is missing. The K override is the one optional field; blank there means the derated correlation is used.',
  },
  {
    id: 'slug',
    icon: Waves,
    title: 'Slug catchers',
    content:
      'A slug catcher holds the liquid a line delivers in one burst, so the volume it must hold comes from the line, not from this studio: the Pipeline and Line Sizing Studio computes it from the pipe volume and the holdup. Give the studio that number and it sizes either a vessel with freeboard for the gas, or a harp of parallel fingers. Fingers are how large slugs are actually caught, because pipe is cheaper per unit volume than a vessel and does not need a vessel code stamp.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'What this does not do',
    content:
      'This is bulk separation sizing to the standard method. It does not design the inlet device, size the mist extractor itself, or predict the actual droplet distribution leaving a real inlet nozzle. Those need vendor data and, for difficult services, physical testing. What the studio gives you is the vessel envelope a vendor bid should fit inside, and the reasons behind it.',
  },
];

const SeparatorHelpContent = () => (
  <Accordion type="single" collapsible className="w-full">
    {helpContent.map((item) => (
      <AccordionItem key={item.id} value={item.id}>
        <AccordionTrigger className="text-sm text-left">
          <span className="flex items-center gap-2">
            <item.icon className="w-4 h-4 text-emerald-400 shrink-0" />
            {item.title}
          </span>
        </AccordionTrigger>
        <AccordionContent className="text-sm text-slate-400 leading-relaxed">
          {item.content}
        </AccordionContent>
      </AccordionItem>
    ))}
  </Accordion>
);

export default SeparatorHelpContent;
