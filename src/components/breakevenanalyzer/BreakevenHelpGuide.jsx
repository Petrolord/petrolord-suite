// Probabilistic Breakeven Analyzer help guide (Economics E2).
//
// Written against the E1 engine, so what it says about sampling, fitting and
// discounting is what the code actually does.
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  BookOpen, Upload, BarChart2, Dice5, LineChart, Scale, FolderOpen,
  AlertTriangle, Download,
} from 'lucide-react';
import StudioHelp from '@/components/studio/StudioHelp';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this tool answers',
    content:
      'The breakeven oil price is the price at which a project just meets your hurdle, which by default is a net present value of zero at your discount rate. A single breakeven number hides how uncertain it is. This tool runs your cost and performance uncertainties through a Monte Carlo simulation and solves the breakeven price for every iteration, so you get a distribution: a P10, a P50, a P90 and the full spread behind them. The question it answers is not only "what price do we need" but "how confident are we in that price".',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Saved studies and auto-save',
    content:
      'Use the Saved study selector at the top of the left rail to create a study. Once one is open, your inputs and the uploaded production profile auto-save about ten seconds after each change, and the save indicator shows when the last save happened. Click the indicator to save immediately. Results are recomputed from the inputs rather than stored, so reopening a study shows you the inputs exactly as you left them and waits for you to press Run.',
  },
  {
    id: 'data',
    icon: Upload,
    title: 'Step 1: Upload a production profile',
    content:
      'This tool will not run on invented production. Upload a CSV with a date column and an oil rate column (oil_rate_bpd or similar). Rates are aggregated to annual production volumes, so monthly data is fine. Download Sample CSV shows the exact shape expected. If your production forecast lives in the Decline Curve Analysis app or the Forecast Scenario Hub, export it there and bring the CSV here.',
  },
  {
    id: 'variables',
    icon: BarChart2,
    title: 'Step 2: State your uncertainties as percentiles',
    content:
      'Each probabilistic variable is entered as a P10, P50 and P90. These are percentiles of your belief about the value, not the smallest and largest numbers you can imagine. P10 means a one in ten chance of coming in below that value, so ten percent of outcomes should fall outside each end. The three shipped variables (total CAPEX, annual OPEX and production efficiency) are the ones that move a breakeven price most, and you can add your own.',
  },
  {
    id: 'fitting',
    icon: Dice5,
    title: 'How the percentiles become a distribution',
    content:
      'The three percentiles are fitted to a triangular distribution whose cumulative curve passes through all three points. That fit matters. A common shortcut is to feed P10, P50 and P90 straight in as the minimum, mode and maximum of a triangular, which quietly declares that nothing can land below your P10 or above your P90 and deletes the outer twenty percent of the distribution, understating every downside. A triangular cannot pass through any three percentiles you like: the median has to sit between roughly 38 and 62 percent of the way from P10 to P90. Outside that band the fit clamps to the most skewed triangular available and says so rather than pretending.',
  },
  {
    id: 'seed',
    icon: Dice5,
    title: 'The run seed, and why results reproduce',
    content:
      'Sampling runs through a seeded generator, so the same inputs and the same seed always give the same answer. That is what lets you put a number in front of a board, be asked about it a week later, and reproduce it exactly. Change the seed to draw a different sample and see how stable your percentiles are. If P50 moves materially when only the seed changes, raise the iteration count.',
  },
  {
    id: 'engine',
    icon: Scale,
    title: 'The economics behind each iteration',
    content:
      'For every iteration the app samples CAPEX, OPEX and production efficiency, then solves by bisection for the oil price that puts net present value on your target. The cash flow is built by the Suite screening economics engine, the same one behind the NPV Scenario Builder, so a breakeven price here means the same thing as an NPV there. Terms are a flat royalty and a flat tax on profit, CAPEX in the first year, OPEX flat across the profile, and mid-year discounting. Full Nigerian fiscal detail (PIA and NTA frameworks, terrain and price based royalties, cost recovery, allowances) belongs to Petroleum Economics Studio, and a project heading for sanction should be taken there.',
  },
  {
    id: 'read',
    icon: LineChart,
    title: 'Reading the three charts',
    content:
      'The S curve gives the chance that the true breakeven price is below any given value, with your P50 marked. A steep curve is a tight answer; a flat one means the breakeven is poorly constrained and the cost estimate needs work before the price does. The histogram shows where iterations landed and whether the distribution is skewed. The tornado shows both ends of each uncertainty measured from the deterministic base case, so a symmetric input looks symmetric. The bar that reaches furthest to the right is the uncertainty that can hurt the project most.',
  },
  {
    id: 'export',
    icon: Download,
    title: 'Exporting the run',
    content:
      'Export writes a CSV carrying the percentile summary, the seed and the full per-iteration sample. The sample is included on purpose: a percentile nobody can check is a claim rather than a result, and anyone reviewing your work can re-derive the numbers from the file.',
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Assumptions and limits',
    content:
      'Variables are sampled independently. Real CAPEX and OPEX overruns tend to arrive together, so a correlated run would show a slightly wider downside than this one does. Price is solved rather than sampled, which is the point of a breakeven, so this tool says nothing about price risk itself. The fiscal treatment is the screening tier described above. Production is taken as given from your uploaded profile, so uncertainty in the forecast itself belongs upstream in the decline analysis, other than the production efficiency multiplier applied here.',
  },
];

export const BreakevenHelpContent = () => (
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

const BreakevenHelpGuide = () => (
  <StudioHelp
    title="Probabilistic Breakeven Analyzer"
    description="How the breakeven distribution is built, and what it does and does not cover."
  >
    <BreakevenHelpContent />
  </StudioHelp>
);

export default BreakevenHelpGuide;
