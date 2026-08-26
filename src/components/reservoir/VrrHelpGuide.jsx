// VRR Monitor help content, rendered inside the StudioHelp sheet (V1 of the
// VRR upgrade re-housed this from a standalone Dialog).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BookOpen, Droplets, Table2, LineChart, Scale, Upload, AlertTriangle, FolderOpen, Gauge, Network } from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What is VRR?',
    content:
      'The Voidage Replacement Ratio (VRR) is the classic waterflood and pressure-maintenance surveillance metric: the reservoir barrels of fluid injected divided by the reservoir barrels of voidage produced over the same period. VRR near 1 means the voidage you take out of the reservoir is being replaced by injection, so pressure is held. This tool tracks both instantaneous (per-period) and cumulative VRR over time.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Projects and auto-save',
    content:
      'Use the Project selector in the left rail to create a project. Once a project is open, your fluid properties and period table auto-save about 10 seconds after each change, and the save indicator in the header shows when the last save happened. Click the indicator to save immediately. Reopening the app restores the project exactly as you left it.',
  },
  {
    id: 'pvt',
    icon: Droplets,
    title: 'Step 1: Set PVT / formation volume factors',
    content:
      'All volumes are converted to reservoir barrels (RB) before the ratio is taken, so the engine needs your fluid properties: Bo (oil FVF, RB/STB), Bw (water FVF, RB/STB), Bg (gas FVF, RB/Mscf) and Rs (solution GOR, scf/STB). These apply to every period. Solution gas (Rs times Np) is already carried in Bo, so only free produced gas above solution adds to voidage; the engine subtracts it automatically.',
  },
  {
    id: 'periods',
    icon: Table2,
    title: 'Step 2: Enter production and injection by period',
    content:
      'On the Data tab, add one row per surveillance period (typically a month). Enter oil produced (Np, STB), water produced (Wp, STB), gas produced (Gp, Mscf), water injected (Wi, bbl) and gas injected (Gi, Mscf). Produced voidage = Np·Bo + Wp·Bw + free-gas·Bg; injected voidage = Wi·Bw + Gi·Bg. Leave a cell blank and it counts as zero.',
  },
  {
    id: 'read',
    icon: LineChart,
    title: 'Step 3: Read the VRR trend',
    content:
      "The Dashboard tab plots instantaneous VRR (this period alone), rolling VRR (a trailing multi-period window that smooths month-to-month allocation noise) and cumulative VRR (all periods to date) against a reference line at VRR = 1 and your shaded operator target band. The instantaneous line tells you what is happening right now; the cumulative line reflects the reservoir's overall voidage balance since the start of the record. Set the band and rolling window under Analysis Settings; periods outside the band flag as Under or Over. The download button on the chart saves it as a PNG.",
  },
  {
    id: 'pressure',
    icon: Gauge,
    title: 'Pressure tab: the maintenance proof',
    content:
      'VRR is a means to an end; the end is reservoir pressure. On the Pressure tab, enter or import pressure surveys (date and psia) and the app interpolates them onto each period, overlays pressure on the VRR trend, shows dp/dt in the tooltip, and marks fill-up where cumulative VRR first reaches 1. A VRR near 1 with steady pressure is the proof of pressure maintenance; a VRR near 1 with falling pressure suggests out-of-zone injection or unaccounted voidage. With Pressure track mode on, Bo, Bw, Bg and Rs are derived per period from black-oil correlations at the interpolated pressure instead of one constant set, which matters most below the bubble point where gas properties move quickly. The chart is withheld with a stated reason until pressure actually attaches to your periods.',
  },
  {
    id: 'patterns',
    icon: Network,
    title: 'Patterns tab: allocation factors and per-pattern VRR',
    content:
      'A field-level VRR of 1 can hide one flooded-out pattern and one starved one. On the Patterns tab (available with an imported per-well ledger), define patterns as sets of producers, then fill the allocation matrix: for each injector, the fraction of its volume reaching each producer. Rows should sum to 1; a shortfall counts as out-of-zone injection and the audit line accounts for every barrel. The fractions are your judgement (from streamline runs, interference tests or geometry); the app never assumes even splits on its own, though an Even split button is there when that is your call. Each pattern then gets its own VRR trend, band flags, and a water-injection recommendation that scales recent allocated injection by target over current rolling VRR, split per injector by allocated share. Recommendations with an implausibly large step are clamped and flagged; treat that as a prompt to re-check allocation and PVT rather than as an instruction.',
  },
  {
    id: 'interpret',
    icon: Scale,
    title: 'Interpreting the number',
    content:
      "VRR near 1 (0.9 to 1.1): balanced, voidage is being replaced and pressure maintenance is effective. VRR below 0.9: under-injection, you are withdrawing faster than you replace, so expect reservoir pressure to decline. VRR above 1.1: over-injection, injecting more than produced, repressurizing the reservoir or filling up voidage (watch for fracturing or out-of-zone injection).",
  },
  {
    id: 'import',
    icon: Upload,
    title: 'Importing real field data (per-well CSV)',
    content:
      'The Data tab imports real allocation files: one row per well per date (daily or monthly), with columns for date, well, oil, water and gas produced, and water and gas injected. Common header aliases are recognized (oil_bbl, np, bopd, water_inj, inj_bbl, gas_inj and more) and units auto-scale from the header (MMscf and Bscf to Mscf, Mbbl to bbl). Rows the importer cannot use are listed in the import report, never dropped silently. Daily rows aggregate to calendar months. Download the Template for the exact schema, or click Sample wells to load a worked 3-month, 4-well example. Wells that ever inject classify as injectors, including gas injectors.',
  },
  {
    id: 'data',
    icon: Table2,
    title: 'Manual entry, sample and export',
    content:
      'Without an import, enter monthly field totals directly in the period grid. Click Sample to load a 6-month waterflood dataset, Export to download the grid as CSV, and Import on the grid toolbar to load that same format back in (columns: label, Np, Wp, Gp, Wi, Gi). When a per-well import is active, the grid is replaced by the read-only monthly ledger; clear the import to return to manual entry.',
  },
  {
    id: 'assumptions',
    icon: AlertTriangle,
    title: 'Assumptions and limitations',
    content:
      'VRR is a material-balance surveillance ratio, not a full reservoir simulation. It assumes your FVFs are representative for the period and that reported volumes are allocated correctly to this pattern or reservoir. It says nothing about sweep efficiency or where injected fluid actually goes; a VRR of 1 with poor conformance can still leave oil behind. Use it alongside pressure data and pattern analysis.',
  },
];

const VrrHelpContent = () => (
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

export default VrrHelpContent;
