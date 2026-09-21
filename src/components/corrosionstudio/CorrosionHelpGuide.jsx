// Corrosion & Integrity Studio help content (Facilities F6).
//
// FC9-0 corrected three claims in this file and kept one.
//  - the sulphide ratio claim said "past about one to five hundred, iron
//    sulphide governs", which is the ratio at which the ENGINE still
//    calls the film mixed and the CO2 rate an upper bound. The help and
//    the panel gave a user two different answers about the same number.
//  - "below about 60 degrees Celsius" was 21 C out at the studio's own
//    shipped conditions, where the protective film does not start until
//    81 C, and the panel hint on the same screen said there was no film
//    at 70 C while this file said there was one.
//  - the guide promised integrity in the inspection sense while the
//    studio computes no interval and no minimum thickness.
//  - KEPT, because running the engine confirms it: a 95 percent
//    inhibitor at 80 percent availability delivers 76 percent
//    protection, and 0.24 against 0.05 is 4.8 times the metal loss.
// The sour-service section is rewritten around a withdrawal rather than
// corrected, because the region model it described has been removed
// from the engine.
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Waves, Thermometer, ShieldCheck, Droplets, Timer, AlertTriangle,
  Ban, FileQuestion,
} from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this studio does',
    content:
      'Screens CO2 corrosion of carbon steel at line conditions, compares the H2S partial pressure against a screening threshold, and turns the rate into a remaining life against a corrosion allowance. It is a screening model, not a prediction: it tells you which lines need attention and roughly how much, and where the uncertainty is large enough that an inhibitor programme or a metallurgy decision needs real data behind it. Where it cannot answer it refuses, and a blank input box is refused rather than filled in with a comfortable number.',
  },
  {
    id: 'velocity',
    icon: Waves,
    title: 'Why velocity is in the model at all',
    content:
      'CO2 corrosion is fed by mass transfer: the carbonic acid has to reach the wall and the iron has to leave it. So the rate is two resistances in series, the chemical reaction and the transport, and the slower one governs. That is why the same fluid in a bigger line corrodes less at the same rate, and why a velocity sweep saturates rather than rising forever. A model with only a flat multiplier cannot say either of those things, and the Rate against velocity chart is the difference.',
  },
  {
    id: 'temperature',
    icon: Thermometer,
    title: 'Hotter is not always worse',
    content:
      'Up to a point the rate rises with temperature the way an Arrhenius law says. Past that point iron carbonate becomes protective, plates out on the steel and the rate falls with further heating, which is why a hot line can screen better than a warm one. That turning point is NOT a fixed 60 degrees Celsius, which is what this guide used to say. The studio computes it from the correlation and prints it beside the scale factor, and it moves with CO2 fugacity: at the studio default conditions it is near 81 degrees, so between 60 and 81 there is no protective credit at all. A higher CO2 fugacity brings it down. What temperature the published correlation actually turns at, and the constants behind the factor, are not sourced in the engine and the studio says so.',
  },
  {
    id: 'inhibitor',
    icon: ShieldCheck,
    title: 'Efficiency is not availability',
    content:
      'An inhibitor datasheet quotes an efficiency, typically ninety-something percent. What eats the wall is the time average, and the uninhibited rate applies for every hour the inhibitor is not on spec, not injecting, or being displaced by a slug. A 95 percent inhibitor at 80 percent availability delivers 76 percent protection, which is nearly five times the metal loss of the number on the datasheet. The studio asks for both and shows the effective figure, because that gap is where corrosion failures live.',
  },
  {
    id: 'shear',
    icon: Droplets,
    title: 'Wall shear and whether the film survives',
    content:
      'An inhibitor works by holding a film on the steel, and the film has to survive the shear of the flow. Past a threshold the film is stripped and the efficiency on the datasheet stops describing the line. The studio used to say that and then apply the datasheet efficiency anyway, so at 60 ft/s it printed 1.90 mm/yr beside a sentence that implied 13.08. It no longer does: when the shear passes the threshold the inhibitor credit is REMOVED from the rate, the rate the datasheet credit would have given is printed next to it so the cost of the verdict is visible, and the velocity sweep marks the velocity where the step happens. The threshold used is 100 pascals and it is not sourced in the engine, so treat the step as a flag rather than a cliff edge at exactly that number.',
  },
  {
    id: 'sour',
    icon: AlertTriangle,
    title: 'Sour service and which film governs',
    content:
      'This studio does not classify sour service severity and does not recommend materials. It used to. It drew severity regions from the H2S partial pressure and the in-situ pH, labelled them with a standard name, and printed material guidance against each region. That curve was written in the engine rather than read from the standard, and it has been withdrawn rather than adjusted, because a curve carrying a standard name and telling an engineer what steel to buy is not something to improve. Nothing replaces it. What is left is a plain comparison: is the H2S partial pressure above the screening threshold or below it. The threshold value itself is not sourced in the engine either, so use it to decide whether the question arises and then take the question to the standard. Separately the studio reports the H2S to CO2 ratio and which film it expects to govern. Past about one to twenty it calls the surface sulphide dominated and STOPS GRADING the rate: no category and no remaining life, only a stated upper bound. Between about one to five hundred and one to twenty it calls the film mixed and the CO2 rate an upper bound. Both of those ratios are unsourced too.',
  },
  {
    id: 'life',
    icon: Timer,
    title: 'Allowance, life, and what to fix',
    content:
      'The rate becomes useful when it is divided into a corrosion allowance. The studio reports the remaining life against the rate the mitigation actually delivers, the allowance a stated design life would need, and the shortfall if there is one. The practical value is in the comparison: when it is the inhibitor availability failing the design life rather than the chemistry, fixing the injection system is far cheaper than upgrading the metallurgy, and the studio makes that visible. Read the word integrity narrowly here. The studio divides an allowance by a rate and stops. There is no inspection interval, no minimum thickness, no retirement thickness and no fitness-for-service assessment, because producing any of those means adopting a standard the engine does not carry. A zero rate no longer returns an unbounded life with a passing verdict either: the studio asks you why the rate is zero first, because an oil-wet assumption, a stream with no CO2 and a perfect inhibitor all land there.',
  },
  {
    id: 'refusals',
    icon: Ban,
    title: 'What this studio refuses, and why that is the point',
    content:
      'A blank box used to be filled in for you. A cleared pH box became 4.5, which cuts the answer by 43.8 percent against a typed 4.0. A cleared CO2 box became a positive statement that there is no CO2, so the studio printed a rate of zero and the word negligible in green. A cleared temperature box did the same thing by a different route. A missing velocity was treated as unlimited mass-transfer capacity and put the rate 4.78 times high. None of that happens now: a blank box is refused and the refusal names the box. The pH correction is refused below its reference of pH 4 as well, because what the correlation does below its reference is not established in the engine and returning a factor of 1 there made pH 2.0 and pH 4.0 the same answer to sixteen figures. A mole fraction outside 0 to 1, a water cut outside 0 to 100 percent, partial pressures that would add up past the total pressure, and a temperature below absolute zero are all refused too.',
  },
  {
    id: 'notprovided',
    icon: Ban,
    title: 'What is not in this model at all',
    content:
      'No sour-service severity region and no material selection. No inspection interval, minimum thickness or retirement thickness. No erosional velocity limit, and note that the Choke Performance and Pipeline and Line Sizing studios do carry one. No pitting, sulphide stress cracking or hydrogen induced cracking criterion, no chloride, oxygen, organic acid, glycol or top of line model. The single rate this studio returns is a general uniform rate, and nothing in it describes localised attack. Three Suite studios take a corrosion allowance and they do not know about each other: this one consumes an allowance to give a life, while Pipeline and Line Sizing and Storage Tank and Venting each ADD their own allowance to a wall. The defaults differ and there is no link between them, so the wall this studio is eating is not the wall either of those sized.',
  },
  {
    id: 'held',
    icon: FileQuestion,
    title: 'Which numbers here are not sourced',
    content:
      'Every de Waard-Milliams constant, the temperature at which the protective film turns on, the pH slope and its reference, the 250 bar pressure cap on the fugacity correlation, the H2S screening threshold, the two H2S to CO2 ratios, the 100 and 50 pascal shear thresholds, the Blasius friction constants and the Reynolds 4000 branch switch, and the rate category bands. The rate bands matter most of the four labels on the screen: they are looser than the bands commonly cited for carbon steel in production service, so a label here may be optimistic by a step or two. The studio lists all of these under the rate and the integrity tabs. One more is worth naming on its own: the protective scale factor is applied to the COMBINED rate after the reaction and transport resistances are put in series, and whether it belongs there or on the reaction term alone changes the answer materially whenever transport controls, which it does at the studio defaults. The engine states which it does and states that the alternative is unresolved.',
  },
];

const CorrosionHelpContent = () => (
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

export default CorrosionHelpContent;
