// Flow Assurance Studio help content (Production P10).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Route, Thermometer, Snowflake, Droplets, Timer, Link2, AlertTriangle, Layers,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'It carries one continuous pressure and temperature trace from the perforations to the arrival point, and asks the hydrate and wax questions at every station along it. That is the whole idea. Hydrates do not form where an average says they might; they form at one particular place, usually just downstream of a choke or at the top of a riser, and naming that place is what a flow assurance study is for.',
  },
  {
    id: 'chain',
    icon: Route,
    title: 'The four legs, and which of them is solved',
    content:
      'The chain is the wellbore, the choke, the flowline and the riser. The difference between what is solved and what is assumed matters, so it is stated rather than implied. The WELLBORE temperature is the well record\'s flowing profile: an input, and deliberately the same input every other production studio uses, because a studio whose traverse disagreed with the nodal studios about temperature would be worse than useless. The FLOWLINE and RISER temperatures are genuinely solved, from an energy balance on the pipe with an overall U built out of the actual layers. That is where this studio earns its name.',
  },
  {
    id: 'coupling',
    icon: Thermometer,
    title: 'Coupled, not overlaid',
    content:
      'At each flowline station the temperature comes from the thermal solution and the pressure gradient is then evaluated at that local pressure AND that local temperature, using the same Beggs-Brill implementation the wellbore traverse uses. Properties that depend on temperature see the temperature the line is actually at. A study that solved the hydraulics at one temperature and painted a thermal profile on top would give a different pressure drop, and on a well-insulated line the difference is not small.',
  },
  {
    id: 'u',
    icon: Layers,
    title: 'The overall U, and the area it is referred to',
    content:
      'Series thermal resistances and nothing else: the inside film, the steel, every coating, the ground if the line is buried, the outside film. The buried term is the classical conduction shape factor from the method of images, and a line lying on the bottom is its limiting case, where the ground correctly adds nothing. Every U here is reported with the area it is referred to, because a U without its reference area is not a number, and quoting one referred to the outside against one referred to the inside is the commonest way a heat transfer hand calculation goes wrong. The share each layer carries is shown, so the claim that the insulation dominates can be read off rather than taken on trust.',
  },
  {
    id: 'choke',
    icon: Snowflake,
    title: 'Cooling across the choke',
    content:
      'Gas expanding through a bean cools, and the spool just downstream is the commonest place in a production system to make hydrate. The Joule-Thomson coefficient is an input and has no default worth trusting: it is a flash property, roughly 0.02 to 0.08 degrees per psi for natural gas and near zero for a liquid. A studio that guessed it would be inventing the single number that decides whether the wellhead sits inside the hydrate region, which is the number this studio exists to get right. On a 1,000 psi drop the difference between 0.02 and 0.08 is sixty degrees.',
  },
  {
    id: 'hydrate',
    icon: Snowflake,
    title: 'Where the boundary is, and how far an inhibitor moves it',
    content:
      'Two different questions, kept apart. Where the boundary IS comes from the Fluid Studio\'s Motiee screening, with its caveats carried through rather than dropped: it is a gas-gravity correlation for sweet natural gas, it knows nothing about carbon dioxide, hydrogen sulphide or salt, and a design decision should be confirmed against a measured dissociation curve. How far an inhibitor MOVES it is a depression, and both Hammerschmidt and Nielsen-Bucklin are computed with the gap between them reported rather than one picked silently. They agree when dilute and separate badly when not, and that gap is the honest measure of how far a dose is being pushed. Past the Hammerschmidt band, Nielsen-Bucklin is used only where it applies; it was developed for methanol, and a glycol pushed past that band is told it is being pushed rather than handed a second relation that does not fit it either.',
  },
  {
    id: 'ranking',
    icon: AlertTriangle,
    title: 'Why the worst point is not the coldest point',
    content:
      'The worst station is ranked by subcooling, not by temperature. A cold low-pressure arrival can be perfectly safe while a warmer high-pressure spool upstream of it is deep inside the hydrate region, because the boundary moves with pressure. Ranking by temperature picks the wrong one, and that is the specific failure this ranking exists to prevent.',
  },
  {
    id: 'inhibition',
    icon: Droplets,
    title: 'The dose',
    content:
      'A mass balance on the aqueous phase and nothing more: to make the water a given weight percent inhibitor, the inhibitor mass has to be that fraction of the water mass. The lean inhibitor is rarely pure -- recovered MEG comes back at 80 to 90 percent -- and injecting as if it were is a standard way to under-dose, so the lean strength is an explicit input. Salinity is NOT in the boundary, and it inhibits too: ignoring it over-states the subcooling and so over-doses, which is the conservative direction, but on a high-salinity well it over-states it substantially.',
  },
  {
    id: 'cooldown',
    icon: Timer,
    title: 'The no-touch time',
    content:
      'How long after a shutdown before the line is cold enough to be in trouble. It is asked for more often than any other number here, because it sets how long an operator has to decide whether to blow the line down, displace it or restart. It is a lumped capacitance, and the PIPE\'S OWN heat capacity is carried, not just the fluid\'s: leaving the steel out is a common and optimistic error worth about ten percent on a small-bore line. What is in the line when it stops is the liquid that settles out rather than the flowing mixture, so its density is an input.',
  },
  {
    id: 'spine',
    icon: Link2,
    title: 'The production spine and the shared well',
    content:
      'The well comes from the shared per-well record, so the trajectory, fluid, inflow and completion are the ones every other production studio is using; describe the well once and it is described everywhere. What the well was FLOWING on the day -- a rate, a water cut, a wellhead pressure -- stays with the study, because that is duty rather than the well.',
  },
  {
    id: 'refusals',
    icon: AlertTriangle,
    title: 'What this studio refuses to do',
    content:
      'There is no wax correlation. A wax appearance temperature is a measurement; inventing one from an API gravity would be a fiction dressed as an answer, so WAT is an input and if it is blank the wax question is simply not answered. There is no asphaltene onset either, for the same reason: it is not computable from a black-oil description. Subcooling that no practical concentration can kill is refused rather than answered with 96 weight percent, because the arithmetic is fine and the physics is absurd, and the honest answer is that deep subcooling is a thermal or a dosing-strategy problem. A coating whose material does not resolve is reported, never dropped: dropping it takes the insulation out of the stack and the line comes back cold with nothing to explain why.',
  },
];

const FlowAssuranceHelpContent = () => (
  <Accordion type="single" collapsible className="w-full">
    {helpContent.map((item) => {
      const Icon = item.icon;
      return (
        <AccordionItem key={item.id} value={item.id} className="border-slate-800">
          <AccordionTrigger className="text-sm hover:no-underline text-left">
            <span className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-cyan-400 shrink-0" />
              {item.title}
            </span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-slate-400 leading-relaxed">
            {item.content}
          </AccordionContent>
        </AccordionItem>
      );
    })}
  </Accordion>
);

export default FlowAssuranceHelpContent;
