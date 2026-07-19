import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  FlaskConical, Beaker, SlidersHorizontal, LineChart, Layers, Combine, Snowflake, Gauge, Save, Share2, AlertTriangle,
} from 'lucide-react';

const helpContent = [
  {
    id: 'overview',
    icon: FlaskConical,
    title: 'What is the Fluid Systems & Flow Behavior Studio?',
    content:
      "It takes a black-oil description of a reservoir fluid and computes its PVT behaviour from reservoir pressure down to the stock tank, then layers on surface-separation and flow-assurance screening. Everything runs in your browser and recomputes instantly as you type — there is no server round-trip and no Run button. Describe the fluid in the left panel (Stream A), pick correlations, and optionally blend in a second stream, define a separator train, run a batch sensitivity sweep, or paste a flowline pressure-temperature profile for hydrate screening. Results appear as tabs on the right.",
  },
  {
    id: 'streamA',
    icon: Beaker,
    title: 'Step 1: Describe the fluid (Stream A)',
    content:
      "Stream A is the primary reservoir fluid, described with standard black-oil parameters: API gravity (oil density), solution GOR Rsb (scf of gas dissolved per STB of oil at the bubble point), gas specific gravity (relative to air), reservoir temperature, and optional water salinity. Bubble point (Pb) is optional — leave it blank and the engine solves it from your GOR so that Rs(Pb) exactly equals Rsb. Enter a Pb only if you want to override that solve. Every result updates live as you edit.",
  },
  {
    id: 'correlations',
    icon: SlidersHorizontal,
    title: 'Step 2: Choose PVT correlations',
    content:
      "Two choices drive the PVT: the Rs / Bo / Pb correlation and the oil-viscosity correlation. Standing (1947) and Beggs-Robinson (1975) are the audited defaults and suit most black oils; Vasquez-Beggs (1980) is also available for Rs/Bo. Glaso and Beal-Cook-Spillman are selectable but flagged — Glaso's Rs form here is non-standard and Beal-Cook-Spillman's saturated branch is simplified, so choosing them raises a warning in the results and you should verify against lab PVT. Gas Z-factor (Papay with Sutton pseudo-criticals), gas FVF and viscosity (Lee-Gonzalez-Eakin) and oil compressibility (Vasquez-Beggs) are always computed with standard correlations.",
  },
  {
    id: 'pvtcharts',
    icon: LineChart,
    title: 'Reading the PVT results',
    content:
      "The PVT tab shows four curves versus pressure, each with a dashed bubble-point line. Oil FVF (Bo) rises with dissolved gas up to Pb, then declines above it as the undersaturated oil is compressed. Solution GOR (Rs) climbs to Rsb at Pb and stays flat above it. Oil viscosity (μo) traces the classic V — falling as gas dissolves down to a minimum at Pb, then rising again above Pb and continuing to rise toward the dead-oil value near stock-tank. Gas Z-factor shows real-gas deviation. The KPI row summarises bubble-point properties, and you can export the full table as CSV.",
  },
  {
    id: 'separator',
    icon: Layers,
    title: 'Separator train',
    content:
      "The separator train estimates how the produced GOR partitions across surface-separation stages. Enter each stage's pressure and temperature (an implicit stock-tank stage at 14.7 psia / 60 °F is always added) and a stock-tank oil basis rate used to report stage gas rates. The engine liberates gas stage by stage from the black-oil correlations, and the partition telescopes exactly back to Rsb. This is a black-oil staged-liberation approximation — a screening estimate of the GOR split and surface gas rates, not a compositional (EOS) flash — so it will differ from a lab separator test. Per-stage oil shrinkage volumes are deliberately not reported because they can't be defended from black-oil correlations alone.",
  },
  {
    id: 'blending',
    icon: Combine,
    title: 'Blending two streams',
    content:
      "Enable blending to mix a second stream (Stream B) into Stream A by volume fraction. API is blended on a specific-gravity (density) basis — not a linear API average — so the blended API is always physically correct and bounded between the two streams; GOR, gas SG, salinity and temperature are volume/mass weighted with clearly labelled proxies. The blend's bubble point is re-solved and the blended fluid flows through the same PVT and separator calculations. A screening Asphaltene Stability Index (ASI, 0-1) flags the classic risk of destabilising asphaltenes when a heavy crude meets a light paraffinic diluent: below 0.35 screens compatible, 0.35-0.60 marginal, above 0.60 high risk. ASI is an API-contrast heuristic, not a SARA/CII calculation — confirm marginal or high-risk blends with an ASTM D7112 / D7157 bench test before commingling.",
  },
  {
    id: 'flowassurance',
    icon: Snowflake,
    title: 'Flow assurance: hydrates & WAT',
    content:
      "Paste a flowline pressure-temperature profile (one 'P_psia, T_F' pair per line) to screen for gas-hydrate risk. The engine draws the hydrate formation envelope with the Motiee (1991) gas-gravity correlation and checks each profile point: where the fluid is colder than the hydrate-formation temperature at that pressure (positive subcooling), it sits inside the hydrate region and is flagged red. Wax Appearance Temperature (WAT) is reported only if you supply a measured value or a wax content (a labelled screening estimate) — it is never invented from API, because WAT is governed by wax content, not density. Asphaltene onset pressure (AOP) is shown as N/A because it needs SARA/compositional data. The hydrate correlation is a sweet-gas screening tool (valid ~0.55-1.0 gas SG, ±5-8 °F, no H2S/CO2/inhibitor or salt correction).",
  },
  {
    id: 'batch',
    icon: Gauge,
    title: 'Batch sensitivity',
    content:
      "Batch sensitivity sweeps one Stream-A variable (API, GOR, gas SG or temperature) across a min-max range in N steps and re-runs the whole engine at each point, so you can see how bubble point, oil FVF and viscosity respond. The endpoints are always included. If blending is enabled, the sweep characterises the un-blended Stream A fluid so the x-axis value means exactly what it says. Results show a dual-axis chart (Pb and Bo @ Pb) and a full table; WAT appears in the table only when flow assurance supplies one.",
  },
  {
    id: 'compositional',
    icon: FlaskConical,
    title: 'Compositional mode (PR78 EOS)',
    content:
      "Switch the fluid model selector to Compositional to add a Composition tab. Enter the feed in mole percent for the library components (N2 through nC6) plus a C7+ fraction described by molecular weight and specific gravity; the C7+ boiling point is optional and estimated from the Soreide correlation when blank. The engine characterizes the C7+ with the Kesler-Lee correlation set, then runs a stability-gated Peng-Robinson (1978) flash at your pressure and temperature. Results show the phase split, per-phase densities and viscosities, K values, interfacial tension and the characterized C7+ properties. The PT envelope traces in a background worker: bubble and dew branches, your flash conditions, and the saturation pressure at the flash temperature. The flash itself is validated against an independent oracle and NIST data (green badges); viscosities are an untuned correlation (amber badge). The Compositional tab also runs your Separator Train stages as rigorous per-stage EOS flashes: each stage's vapor is drawn off and the liquid feeds the next stage down to stock tank, giving stage GORs, gas gravities, stock-tank API and a thermodynamic multistage Bo with a single-flash comparison. The compositional path runs beside the black oil analysis and does not change any black oil result. Tuning the EOS to lab data is a planned follow-on.",
  },
  {
    id: 'saveload',
    icon: Save,
    title: 'Saving & loading projects',
    content:
      "Save names and stores the current setup to your account; Load restores it. Only your inputs are saved — results recompute automatically on load, so nothing can go stale. Projects are private to your account (enforced by row-level security). Saving requires a one-time database table to be deployed; until then, Save and Load show a clear setup message rather than failing silently.",
  },
  {
    id: 'handoff',
    icon: Share2,
    title: 'Sending fluids to other apps',
    content:
      "The Integration Suite passes the computed fluid 'backbone' — API, gas gravity, surface GOR, inlet temperature and the PVT table — to other Petrolord applications. 'Send to Pipeline Sizer' opens the Pipeline Sizer pre-loaded with these properties so you don't re-enter them. More handoffs will appear as connected apps come online.",
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Assumptions & limitations',
    content:
      "This is a black-oil screening tool, not a compositional simulator or a substitute for a laboratory PVT / flow-assurance study. Each correlation carries its own validity range (the defaults are used within their intended envelopes); the separator flash is an empirical GOR partition; the hydrate and asphaltene checks are screening indicators; and WAT/AOP are reported only when they can be defended. Any approximation in play is surfaced either as a warning banner or as a note on the relevant results tab. Treat the numbers as engineering estimates for screening and comparison, and validate critical decisions against lab data and rigorous simulation.",
  },
];

const FluidStudioHelpGuide = ({ isOpen, onOpenChange }) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[680px] bg-slate-900 border-slate-700 text-white">
      <DialogHeader>
        <DialogTitle className="text-lime-300 text-xl">Fluid Systems &amp; Flow Behavior Studio — Help Guide</DialogTitle>
        <DialogDescription>
          Black-oil PVT, blending, separator train and flow-assurance screening — how it works and how to read it.
        </DialogDescription>
      </DialogHeader>
      <ScrollArea className="h-[62vh] pr-4">
        <Accordion type="single" collapsible className="w-full" defaultValue="overview">
          {helpContent.map((item) => {
            const Icon = item.icon;
            return (
              <AccordionItem value={item.id} key={item.id}>
                <AccordionTrigger className="text-base hover:no-underline text-left">
                  <div className="flex items-center">
                    <Icon className="w-5 h-5 mr-3 text-lime-400 shrink-0" />
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
      </ScrollArea>
    </DialogContent>
  </Dialog>
);

export default FluidStudioHelpGuide;
