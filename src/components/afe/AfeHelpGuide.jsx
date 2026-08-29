// AFE Cost Control Manager help guide (Economics E4).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, FileText, Table2, Receipt, History, Users, Gauge, AlertTriangle,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What an AFE is for here',
    content:
      'An Authorization For Expenditure is the approved budget for a piece of work and the record of what it actually cost. This app holds the AFE, its cost breakdown, the invoices against it, the budget changes it has been through, and the joint-venture split of the bill. The question it answers is where the money is going against what was approved, while there is still time to do something about it.',
  },
  {
    id: 'create',
    icon: FileText,
    title: 'Creating an AFE',
    content:
      'New AFE opens a short wizard: the AFE number, what it is for, the project it belongs to, its currency and its window. The window matters more than it looks, because the schedule side of the performance indexes is measured against it.',
  },
  {
    id: 'costs',
    icon: Table2,
    title: 'The cost breakdown, and the four numbers per line',
    content:
      'Each cost line carries a budget, a commitment, an actual and a progress percentage, and optionally your own forecast. Budget is what was approved. Commitment is money contracted but not yet invoiced. Actual is money spent. Progress is how much of that line of work is physically done, which is a judgement and not a function of the money.',
  },
  {
    id: 'forecast',
    icon: Gauge,
    title: 'How the forecast and the indexes are worked out',
    content:
      'Where you have entered a forecast for a line, that is used. Where you have not, the forecast is the greater of the budget and what is already spent plus committed, because a forecast below money already gone is not a forecast. Earned value is each line\'s budget times its progress. The cost index is earned value over actual cost, so above one means you are getting more work per pound than planned. The schedule index compares earned value against the share of the budget that the elapsed time implies, which is a simplification: it assumes the budget was meant to be spent evenly across the window, so read it as a rough flag rather than a proper planned-value curve.',
  },
  {
    id: 'invoices',
    icon: Receipt,
    title: 'Invoices and the S curve',
    content:
      'Invoices are the record of what has actually been billed, and they drive the actual line on the S curve, which accumulates them by date against the planned spend. A gap between the two lines is worth reading before it is worth explaining: early it usually means invoicing lag rather than underspend.',
  },
  {
    id: 'changes',
    icon: History,
    title: 'Budget changes',
    content:
      'Supplements and transfers are recorded rather than applied silently, so the AFE keeps its history: what was originally approved, what changed, and why. That trail is what an audit asks for.',
  },
  {
    id: 'partners',
    icon: Users,
    title: 'Joint-venture partners and billing',
    content:
      'Add each non-operating partner with its working interest. Costs are allocated by interest and the operator carries the remainder, so the split always accounts for the whole cost. If the interests you have entered add up to more than 100 percent the app says so and does not quietly hand the operator a negative share, which would bill out more than the cost. Partners belong to the AFE and are saved with it. Before August 2026 they lived in the browser only, and every AFE opened with two invented partner companies already in the list.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Limits',
    content:
      'This is cost control, not accounting: it does not post to a ledger, reconcile with an ERP or handle tax. There is no live link to a finance system, so invoices and actuals are entered here. The schedule index is the time-based approximation described above. Currency is per AFE with no conversion, so keep one AFE in one currency.',
  },
];

export const AfeHelpContent = () => (
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

const AfeHelpGuide = () => (
  <StudioHelp
    title="AFE & Cost Control"
    description="How the budget, forecast and performance indexes are worked out, and how the JV split is billed."
  >
    <AfeHelpContent />
  </StudioHelp>
);

export default AfeHelpGuide;
