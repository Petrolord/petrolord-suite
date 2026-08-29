// Terminal & Depot Studio help guide (DS5).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Ruler, Scale, TrendingDown, Truck, Database, Leaf, AlertTriangle, FolderOpen,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'Built for a terminal with a dip tape',
    content:
      'Terminal automation systems assume mass flow meters on every arm, automatic tank gauging and a historian. Most terminals in the markets this Suite serves have a dip tape, a strapping table and a spreadsheet. That is not a lesser case waiting to be upgraded into the real product; it is the case this app is built for, and instrumented data is the upgrade path rather than the entry ticket. So everything here starts from a dip: a number a person read off a tape at a time they wrote down.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved studies',
    content:
      'Create a study from the selector at the top; tanks, dips, the day\'s movements and your history auto-save. Everything else is recomputed from them.',
  },
  {
    id: 'dips',
    icon: Ruler,
    title: 'Dips, strapping tables and free water',
    content:
      'A dip height becomes a volume through the tank\'s strapping table, interpolated linearly between entries, which is what every terminal does by hand. Above the last entry the app refuses rather than extrapolating, because extrapolating a strapping table invents capacity the tank does not have. Free water sits under the product and is subtracted, because it is not product: that subtraction is the difference between a stock figure and a stock figure that is right.',
  },
  {
    id: 'vcf',
    icon: Scale,
    title: 'The volume correction factor, and what the app will not guess',
    content:
      'Product expands when it is warm, so a gross observed volume has to be corrected to a standard temperature before it means anything on an invoice. The correction has a standard form and a set of coefficients per commodity group, and those coefficients are a published table (API MPMS Chapter 11.1) that this app does not ship, because reproducing published tables from memory is exactly how a plausible wrong number gets into a custody transfer. So supply your commodity group\'s coefficient row, or type a VCF read straight off your own tables, which is what most terminals do anyway. Without either, the app reports gross observed volume only and says so, which is honest and still useful.',
  },
  {
    id: 'reconciliation',
    icon: TrendingDown,
    title: 'The reconciliation, and why the gap is the point',
    content:
      'Opening plus receipts less deliveries less known losses is what the closing stock should be; the dip says what it is. The difference is the unaccounted figure, and it is the entire point of a terminal reconciliation. A tool that silently balanced would be worse than useless: gain and loss is what the operator is judged on, what the customer disputes, and what tells you a meter is drifting or a valve is passing. Tolerance is set as a percentage of throughput rather than of stock, because measurement error scales with what moved, not with what is sitting in the tank.',
  },
  {
    id: 'trend',
    icon: TrendingDown,
    title: 'Trending gain and loss',
    content:
      'One day\'s gain is noise. A run of days in the same direction is a finding. Separating the two is the reason to trend rather than to stare at today\'s number, and the app will say when a run has gone on long enough to be worth investigating: a drifting meter, a passing valve, or a temperature effect that is not being corrected.',
  },
  {
    id: 'rack',
    icon: Truck,
    title: 'The loading rack is a queue, not a capacity',
    content:
      'Trucks arrive irregularly and take varying times to load, which is exactly the case simple capacity arithmetic gets wrong. A rack at 85 percent utilisation does not have 15 percent spare, it has a queue, and the wait grows sharply as utilisation climbs. This is modelled as a multi-server queue, derived from first principles rather than read from a chart. When the rack genuinely cannot keep up the app says so plainly rather than reporting an average waiting time, because with arrivals above capacity the queue grows without limit and no average exists.',
  },
  {
    id: 'farm',
    icon: Database,
    title: 'Tank farm cover',
    content:
      'Working capacity is capacity less the heel, because the heel cannot be pumped out and a plan that counts it is planning on volume that does not exist. Days of cover are on pumpable stock for the same reason. Turns per year is throughput against working capacity, which is the number that tells you whether the farm is sized for the business.',
  },
  {
    id: 'carbon',
    icon: Leaf,
    title: 'Money and carbon from the same volumes',
    content:
      'A terminal\'s emissions come from the same movements and losses its economics already describe, so both are computed from one set of volumes rather than assembled separately and reconciled later. The emission factor is an input rather than a shipped constant: factors are published, versioned data, and a terminal that has not supplied one gets its money answer and a stated absence on the carbon side rather than an invented number.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Limits',
    content:
      'This is stock and throughput accounting, not custody transfer certification: the numbers here are as good as the dips, the strapping table and the correction you supply. Evaporation and breathing losses are entered as known losses here rather than predicted; the Facilities Storage Tank studio computes them from tank geometry and duty. The queue model assumes arrivals that are random rather than appointment-booked, which is the harder and more common case. And one product density is used for the carbon conversion, so a terminal with very different products should read that figure per product rather than in aggregate.',
  },
];

export const TerminalDepotHelpContent = () => (
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

const TerminalDepotHelpGuide = () => (
  <StudioHelp
    title="Terminal & Depot Studio"
    description="How a dip becomes a stock figure, why the unaccounted gap is the point, and what the app will not guess."
  >
    <TerminalDepotHelpContent />
  </StudioHelp>
);

export default TerminalDepotHelpGuide;
