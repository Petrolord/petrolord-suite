// Materials & Spares Planner help guide (SC3).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Database, FolderOpen, ListOrdered, Calculator, ShieldCheck, LifeBuoy, Dices, Archive, AlertTriangle, Library,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

export const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What the planner does',
    content:
      'The planner works through a materials and spares register the way a stores or maintenance planner does: which items matter most, how much to order and when, how many insurance spares to hold against a failure that stops production, how exposed a reorder point is to a long lead time, and which stock has stopped moving. Every figure comes from the Petrolord inventory engine (engines/supplychain/inventory.js), the same engine the NextGen course on materials, spares and inventory management teaches with.',
  },
  {
    id: 'inputs',
    icon: AlertTriangle,
    title: 'Every input is yours to state',
    content:
      'No cost, rate, service level, band, cut-off or rounding rule is filled in behind your back. A new study starts blank. When a required input is missing or out of range, the engine refuses and the planner prints its message word for word, naming the input it refused, so you can see exactly what to fix. Copy figures copies an item\'s register values into the visible fields; you can change any of them.',
  },
  {
    id: 'register',
    icon: Database,
    title: 'The register and the Ekene demo',
    content:
      'Load the Ekene demo to see every calculation run on a synthetic register of 18 items for block EK-11, Petrolord\'s fictional teaching field, with its stated policy and one stated case per calculation. To use your own data, paste CSV (columns id, name, annualUsage, unitCost, onHand, monthsSinceLastIssue, monthlyUsage and score_<criterion>) or JSON. Importing replaces the items and leaves your policy and inputs alone. A column the planner does not read is refused by name, so a misspelt header is caught.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved studies',
    content:
      'Create a study from the selector at the top; the register, the policy and every calculation input auto-save, with the engine commit they ran on. Results are recomputed from the inputs when a study is opened.',
  },
  {
    id: 'criticality',
    icon: ListOrdered,
    title: 'Criticality and ABC',
    content:
      'Criticality scores each item on your criteria (for example safety, production, lead time and redundancy) against your weights, which add to 100, and places it in the first class whose minimum score it meets. VED (vital, essential, desirable) is one such scheme. An optional override places an item in the top class when it scores the maximum on a named criterion, such as safety. ABC ranks items by annual usage value, usage times unit cost, and closes classes A and B at your cumulative cut-offs. The boundary rule decides where the item that crosses a cut-off goes. Every class comes with its reason.',
  },
  {
    id: 'eoq',
    icon: Calculator,
    title: 'EOQ and quantity discounts',
    content:
      'The Harris-Wilson economic order quantity is the square root of 2 x order cost x annual demand / holding cost a unit a year. The quantity you actually order follows your stated rounding rule, and the planner shows what that rounding costs against the exact EOQ. Under a price schedule, all-units discounts price the whole lot at the band\'s price; incremental discounts price each unit by its own band. Each band\'s candidate is costed and the lowest total wins, with ties going to the smaller quantity.',
  },
  {
    id: 'safety',
    icon: ShieldCheck,
    title: 'Safety stock and the reorder point',
    content:
      'With normal demand, demand over the lead time (plus the review period for periodic review) has a standard deviation built from the variation in demand and in lead time. A cycle service level sets the safety factor k from the exact inverse normal; a fill rate sets the smallest k whose expected shortage per cycle is small enough against the order quantity. Slow movers and spares are read with Poisson demand, where the stock level is the smallest whole number meeting the target, and the service level is the probability of no stockout over the lead time.',
  },
  {
    id: 'spares',
    icon: LifeBuoy,
    title: 'Insurance spares',
    content:
      'Each failure takes a spare and orders a replacement that arrives after the lead time, so the replacements outstanding are Poisson with mean failures a year x lead time / days a year. For each stock from 0 up to your largest number, the planner adds the holding cost of the spares to the expected downtime cost of units waiting, and picks the cheapest.',
  },
  {
    id: 'leadtime',
    icon: Dices,
    title: 'Lead-time risk and the P-labels',
    content:
      'Lead time and daily demand can each be fixed or triangular. The engine draws them from one seeded stream (the canonical Petrolord sampler), so a seed reproduces a run exactly. The stockout probability is the share of draws whose lead-time demand is above the reorder point. P-labels follow the Petrolord percentile convention: P90 means a 90% probability the actual value meets or exceeds it, so for a lead time or a demand P90 is the low figure (the 10th percentile) and P10 the high one.',
  },
  {
    id: 'slow',
    icon: Archive,
    title: 'Slow-moving and obsolete stock',
    content:
      'Each item takes the last band whose months since the last issue it has reached, and is written down by that band\'s stated percentage of its stock value. Cover is stock on hand divided by monthly usage; stock above your cover limit is excess, and an item with stock and no usage is all excess.',
  },
  {
    id: 'sources',
    icon: Library,
    title: 'Sources',
    content:
      'F. W. Harris, How Many Parts to Make at Once, Factory 10(2), 1913 (public domain). C. Caplice, MIT ESD.260J Logistics Systems, Fall 2006, lectures 7, 8 and 11 to 13 (MIT OpenCourseWare, CC BY-NC-SA 4.0): EOQ, discounts, safety stock, fill rate, Poisson demand. MIL-HDBK-338B, Electronic Reliability Design Handbook, 1998, section 5.3.8: spares by the Poisson probability of n or fewer failures. The engine is checked against these worked examples by an independent oracle.',
  },
];

export const MaterialsSparesHelpContent = () => (
  <Accordion type="single" collapsible className="w-full">
    {helpContent.map((item) => {
      const Icon = item.icon;
      return (
        <AccordionItem value={item.id} key={item.id}>
          <AccordionTrigger className="text-base hover:no-underline">
            <div className="flex items-center">
              <Icon className="mr-3 h-5 w-5 text-pl-primary-text" />
              {item.title}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pl-8 leading-relaxed text-pl-text">
            {item.content}
          </AccordionContent>
        </AccordionItem>
      );
    })}
  </Accordion>
);

const MaterialsSparesHelpGuide = () => (
  <StudioHelp
    title="Materials & Spares Planner"
    description="Criticality, ABC, order quantities, safety stock, insurance spares, lead-time risk and slow-moving stock, every input stated."
  >
    <MaterialsSparesHelpContent />
  </StudioHelp>
);

export default MaterialsSparesHelpGuide;
