import React from 'react';
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
      "It computes the PVT behaviour of a reservoir fluid from reservoir pressure down to the stock tank, then layers on surface separation and flow-assurance screening. Two fluid models are available: the black-oil default, driven by correlations, and a compositional mode built on a validated Peng-Robinson (1978) equation of state. Everything runs in your browser and recomputes instantly as you type. There is no server round-trip and no Run button. Describe the fluid in the left panel (Stream A), pick correlations or enter a composition, and optionally blend in a second stream, define a separator train, run a batch sensitivity sweep, or paste a flowline pressure-temperature profile for hydrate screening. Results appear as tabs on the right.",
  },
  {
    id: 'streamA',
    icon: Beaker,
    title: 'Step 1: Describe the fluid (Stream A)',
    content:
      "Stream A is the primary reservoir fluid, described with standard black-oil parameters: API gravity (oil density), solution GOR Rsb (scf of gas dissolved per STB of oil at the bubble point), gas specific gravity (relative to air), reservoir temperature, and optional water salinity. Bubble point (Pb) is optional. Leave it blank and the engine solves it from your GOR so that Rs(Pb) exactly equals Rsb, or enter a Pb to override that solve. Every result updates live as you edit.",
  },
  {
    id: 'correlations',
    icon: SlidersHorizontal,
    title: 'Step 2: Choose PVT correlations',
    content:
      "Two choices drive the PVT: the Rs / Bo / Pb correlation and the oil-viscosity correlation. Standing (1947) and Beggs-Robinson (1975) are the audited defaults and suit most black oils; Vasquez-Beggs (1980) is also available for Rs/Bo. Glaso and Beal-Cook-Spillman are selectable but flagged: Glaso's Rs form here is non-standard and Beal-Cook-Spillman's saturated branch is simplified, so choosing them raises a warning in the results and you should verify against lab PVT. Gas Z-factor (Papay with Sutton pseudo-criticals), gas FVF and viscosity (Lee-Gonzalez-Eakin) and oil compressibility (Vasquez-Beggs) are always computed with standard correlations.",
  },
  {
    id: 'pvtcharts',
    icon: LineChart,
    title: 'Reading the PVT results',
    content:
      "The PVT tab shows four curves versus pressure, each with a dashed bubble-point line. Oil FVF (Bo) rises with dissolved gas up to Pb, then declines above it as the undersaturated oil is compressed. Solution GOR (Rs) climbs to Rsb at Pb and stays flat above it. Oil viscosity traces the classic V shape: falling as gas dissolves down to a minimum at Pb, then rising again above Pb and continuing to rise toward the dead-oil value near stock tank. Gas Z-factor shows real-gas deviation. The KPI row summarises bubble-point properties, and you can export the full table as CSV.",
  },
  {
    id: 'separator',
    icon: Layers,
    title: 'Separator train',
    content:
      "The separator train estimates how the produced GOR partitions across surface-separation stages. Enter each stage's pressure and temperature (an implicit stock-tank stage at 14.7 psia / 60 °F is always added) and a stock-tank oil basis rate used to report stage gas rates. In black-oil mode the engine liberates gas stage by stage from the correlations and the partition telescopes exactly back to Rsb. That is a staged-liberation screening approximation, and per-stage oil shrinkage volumes are deliberately not reported there because they cannot be defended from black-oil correlations alone. In compositional mode the same stage inputs also feed a rigorous per-stage EOS flash on the Compositional tab, which does report stage gas gravities, stock-tank API and a thermodynamic multistage Bo.",
  },
  {
    id: 'blending',
    icon: Combine,
    title: 'Blending two streams',
    content:
      "Enable blending to mix a second stream (Stream B) into Stream A by volume fraction. API is blended on a specific-gravity (density) basis rather than a linear API average, so the blended API is always physically correct and bounded between the two streams; GOR, gas SG, salinity and temperature are volume or mass weighted with clearly labelled proxies. The blend's bubble point is re-solved and the blended fluid flows through the same PVT and separator calculations. A screening Asphaltene Stability Index (ASI, 0 to 1) flags the classic risk of destabilising asphaltenes when a heavy crude meets a light paraffinic diluent: below 0.35 screens compatible, 0.35 to 0.60 marginal, above 0.60 high risk. ASI is an API-contrast heuristic, not a SARA/CII calculation. Confirm marginal or high-risk blends with an ASTM D7112 / D7157 bench test before commingling.",
  },
  {
    id: 'flowassurance',
    icon: Snowflake,
    title: 'Flow assurance: hydrates & WAT',
    content:
      "Paste a flowline pressure-temperature profile (one 'P_psia, T_F' pair per line) to screen for gas-hydrate risk. The engine draws the hydrate formation envelope with the Motiee (1991) gas-gravity correlation and checks each profile point: where the fluid is colder than the hydrate-formation temperature at that pressure (positive subcooling), it sits inside the hydrate region and is flagged red. Wax Appearance Temperature (WAT) is reported only if you supply a measured value or a wax content (a labelled screening estimate). It is never invented from API, because WAT is governed by wax content, not density. Asphaltene onset pressure (AOP) is shown as N/A because it needs SARA/compositional data. The hydrate correlation is a sweet-gas screening tool (valid for roughly 0.55 to 1.0 gas SG, within 5 to 8 °F, with no H2S/CO2/inhibitor or salt correction).",
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
      "Switch the fluid model selector to Compositional to add a Composition tab. Enter the feed in mole percent for the library components (N2 through nC6) plus a C7+ fraction described by molecular weight and specific gravity; the C7+ boiling point is optional and estimated from the Soreide correlation when blank. The engine characterizes the C7+ with the Kesler-Lee correlation set, then runs a stability-gated Peng-Robinson (1978) flash at your pressure and temperature. Results show the phase split, per-phase densities and viscosities, K values, interfacial tension and the characterized C7+ properties. The PT envelope traces in a background worker: bubble and dew branches, your flash conditions, and the saturation pressure at the flash temperature. The tab also runs your Separator Train stages as rigorous per-stage EOS flashes (stage GORs, gas gravities, stock-tank API, thermodynamic multistage Bo with a single-flash comparison) and builds an EOS black-oil table: a differential liberation at the flash temperature composited with your separator train by the standard laboratory adjustment, with Rs, Bo, Bg, gas Z and viscosities around the saturation pressure. The table exports as CSV in the Material Balance Studio lab-table schema, and the Integration Suite hands the EOS surface numbers and table to Pipeline Sizer. Every badge in these cards maps to a documented validation tier (see docs/scope/FluidStudio-TierMatrix.md in the repository): the flash, envelope, separator and liberation numbers are gated against an independent oracle and NIST data, the composite table follows the published separator-adjustment method, and viscosities are untuned screening estimates. The compositional path runs beside the black oil analysis and does not change any black oil result. Tuning the EOS to lab data is a planned follow-on.",
  },
  {
    id: 'saveload',
    icon: Save,
    title: 'Saving & loading projects',
    content:
      "Use the Project selector at the top of the left panel. Create a project with the plus button, switch projects from the dropdown, and delete the current one with the trash button. Once a project is open, your inputs autosave about ten seconds after you stop editing; the header indicator shows the save status and clicking it saves immediately. Only your inputs are stored, and results recompute automatically on load, so nothing can go stale. Projects are private to your account (enforced by row-level security). Projects saved with the older Save dialog load normally.",
  },
  {
    id: 'handoff',
    icon: Share2,
    title: 'Sending fluids to other apps',
    content:
      "The Integration Suite passes the computed fluid backbone (API, gas gravity, surface GOR, inlet temperature and the PVT table) to other Petrolord applications. 'Send to Pipeline Sizer' opens the Pipeline Sizer pre-loaded with these properties so you don't re-enter them. In compositional mode the backbone carries the EOS surface numbers and the EOS black-oil table instead of the correlation values. More handoffs will appear as connected apps come online.",
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Assumptions & limitations',
    content:
      "This studio is a screening and pre-lab tool, not a substitute for a laboratory PVT or flow-assurance study. In black-oil mode each correlation carries its own validity range, the separator partition is empirical, the hydrate and asphaltene checks are screening indicators, and WAT/AOP are reported only when they can be defended. In compositional mode the equation of state is validated against an independent oracle and reference data but is untuned: match it to lab PVT before using it for design decisions, and treat the LBC viscosities as screening numbers. The envelope trace truncates near the critical point where the stability test loses the boundary. Any approximation in play is surfaced as a warning banner, a tier badge, or a note on the relevant results tab. Validate critical decisions against lab data and rigorous simulation.",
  },
];

/**
 * Guide content only, for the Studio shell's help sheet (StudioHelp owns the
 * chrome). Replaces the pre-shell standalone Dialog.
 */
export const FluidStudioHelpContent = () => (
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
);

export default FluidStudioHelpContent;
