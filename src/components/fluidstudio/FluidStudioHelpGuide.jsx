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
      "Stream A is the primary reservoir fluid, described with standard black-oil parameters: API gravity (oil density), solution GOR Rsb (scf of gas dissolved per STB of oil at the bubble point), gas specific gravity (relative to air), reservoir temperature, and optional water salinity. Bubble point (Pb) is optional. Leave it blank and the engine solves it from your GOR so that Rs(Pb) exactly equals Rsb. Enter a measured Pb and the table honours it: below that pressure the Rs correlation is multiplied by one constant so that Rs reaches Rsb exactly at your Pb, and Rs, Bo and viscosity stay continuous there. The warning banner and the report state the multiplier and the bubble point the correlation alone would give. Salinity enters the water viscosity. The app opens on a sample fluid, marked as a sample until you edit a value or state its source. Every result updates live as you edit.",
  },
  {
    id: 'correlations',
    icon: SlidersHorizontal,
    title: 'Step 2: Choose PVT correlations',
    content:
      "Two choices drive the PVT: the Rs / Bo / Pb correlation and the oil-viscosity correlation. Standing (1947) and Beggs-Robinson (1975) are the audited defaults and suit most black oils; Vasquez-Beggs (1980) and Glaso (1980, North Sea crudes) are also available for Rs/Bo. Each Rs/Bo/Pb correlation was fitted over a data range (Standing: GOR 20 to 1425 scf/STB, 100 to 258 F, 16.5 to 63.8 API, gas gravity 0.59 to 0.95); an input outside the chosen correlation's range raises a warning that the result is extrapolated. Beal-Cook-Spillman is selectable but flagged: its saturated branch is simplified, so choosing it raises a warning and you should verify against lab PVT. Gas Z-factor (Papay with Sutton pseudo-criticals), gas viscosity (Lee-Gonzalez-Eakin), oil compressibility and undersaturated viscosity (Vasquez-Beggs), and water FVF and viscosity (McCain) are always computed with those correlations. The Report tab lists the method behind every property with its published range, and flags every input outside one.",
  },
  {
    id: 'pvtcharts',
    icon: LineChart,
    title: 'Reading the PVT results',
    content:
      "The PVT tab shows five curves versus pressure, each with a dashed bubble-point line labelled with its value. Oil FVF (Bo) rises with dissolved gas up to Pb, then declines above it as the undersaturated oil is compressed. Solution GOR (Rs) climbs to Rsb at Pb and stays flat above it. Oil viscosity traces the classic V shape: falling as gas dissolves down to a minimum at Pb, then rising again above Pb and continuing to rise toward the dead-oil value near stock tank. Gas Z-factor shows real-gas deviation, and the gas FVF (Bg) is drawn on a logarithmic scale. Above the bubble point Bo follows the oil compressibility the table prints: Bo = Bo(Pb) x (Pb / p) to the power A, the Vasquez-Beggs form. The KPI row summarises bubble-point properties. Export PVT CSV writes the table with Bw and water viscosity, the unit of every column in its header row, and above it the methods, the basis and the project the numbers came from.",
  },
  {
    id: 'separator',
    icon: Layers,
    title: 'Separator train',
    content:
      "The separator train estimates how the produced GOR partitions across surface-separation stages. Enter each stage's pressure and temperature (a stock-tank stage at standard conditions, 14.7 psia and 60 degF, is always added) and a stock-tank oil basis rate used to report stage gas rates. In black-oil mode the engine liberates gas stage by stage from the correlations and the partition telescopes exactly back to Rsb. That is a staged-liberation screening approximation, and per-stage oil shrinkage volumes are deliberately not reported there because they cannot be defended from black-oil correlations alone. In compositional mode the same stage inputs also feed a rigorous per-stage EOS flash on the Compositional tab, which does report stage gas gravities, stock-tank API and a thermodynamic multistage Bo.",
  },
  {
    id: 'blending',
    icon: Combine,
    title: 'Blending two streams',
    content:
      "Enable blending to mix a second stream (Stream B) into Stream A by volume fraction. API is blended on a specific-gravity (density) basis. A linear API average would be wrong, so the blended API is always physically correct and bounded between the two streams; GOR, gas SG, salinity and temperature are volume or mass weighted with clearly labelled proxies. The blend's bubble point is re-solved and the blended fluid flows through the same PVT and separator calculations. A screening Asphaltene Stability Index (ASI, 0 to 1) flags the classic risk of destabilising asphaltenes when a heavy crude meets a light paraffinic diluent: below 0.35 screens compatible, 0.35 to 0.60 marginal, above 0.60 high risk. ASI is an API-contrast heuristic. It is not a SARA/CII calculation. Confirm marginal or high-risk blends with an ASTM D7112 / D7157 bench test before commingling.",
  },
  {
    id: 'flowassurance',
    icon: Snowflake,
    title: 'Flow assurance: hydrates & WAT',
    content:
      "Paste a flowline pressure and temperature profile, one point per line, to screen for gas-hydrate risk. The door takes commas, semicolons, tabs or spaces, comma decimals when the columns are split by a semicolon or a tab, and a header line in either column order. Units named in the header are used (psia, psig, kPa, bar, MPa; degF, degC, K); with no header you choose them beside the box, and a gauge pressure is brought to absolute with 14.696 psi. Under the box the app says what it read: how many points, in which units, which column is which, and every line it did not read with the reason. The engine draws the hydrate formation envelope with the Motiee (1991) gas-gravity correlation and checks each profile point: where the fluid is colder than the hydrate-formation temperature at that pressure (positive subcooling), it sits inside the hydrate region and is flagged red. Wax Appearance Temperature (WAT) is reported only if you supply a measured value or a wax content (a labelled screening estimate). It is never invented from API, because WAT is governed by wax content. Density does not set it. Asphaltene onset pressure (AOP) is left blank because it needs SARA or compositional data. The hydrate correlation is a sweet-gas screening tool (valid for roughly 0.55 to 1.0 gas SG, within 5 to 8 °F, with no H2S/CO2/inhibitor or salt correction).",
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
      "Switch the fluid model selector to Compositional to add a Composition tab. Enter the feed in mole percent for the library components (N2 through nC6) plus a C7+ fraction described by molecular weight and specific gravity; the C7+ boiling point is optional and estimated from the Soreide correlation when blank. The engine characterizes the C7+ with the Kesler-Lee correlation set, then runs a stability-gated Peng-Robinson (1978) flash at your pressure and temperature. Results show the phase split, per-phase densities and viscosities, K values, interfacial tension and the characterized C7+ properties. The PT envelope traces in a background worker: bubble and dew branches, your flash conditions, and the saturation pressure at the flash temperature. The tab also runs your Separator Train stages as rigorous per-stage EOS flashes (stage GORs, gas gravities, stock-tank API, thermodynamic multistage Bo with a single-flash comparison) and builds an EOS black-oil table: a differential liberation at the flash temperature composited with your separator train by the standard laboratory adjustment, with Rs, Bo, Bg, gas Z and viscosities around the saturation pressure. The table exports as CSV in the Material Balance Studio lab-table schema, and the Integration Suite hands the EOS surface numbers and table to the receiving app. Every badge in these cards maps to a documented validation tier (see docs/scope/FluidStudio-TierMatrix.md in the repository): the flash, envelope, separator and liberation numbers are gated against an independent oracle and NIST data, the composite table follows the published separator-adjustment method, and viscosities are untuned screening estimates. The compositional path runs beside the black oil analysis and does not change any black oil result. When you have lab measurements, tune the fluid to them with the Lab tuning card below the flash results.",
  },
  {
    id: 'labtuning',
    icon: SlidersHorizontal,
    title: 'Tuning the EOS to lab data',
    content:
      "An untuned equation of state is a screening tool: expect saturation pressure off by 5 to 15 percent and stock-tank gravity several API points heavy. The Lab tuning card fixes that against your PVT report. Enter any of: measured saturation pressure (with its temperature), and the separator test's total GOR, stock-tank API and Bo. Separator measurements are read against the ENABLED stages on the Separators tab, exactly the same set the compositional separator results and the EOS black-oil table use, with the flash temperature and pressure taken as reservoir conditions, so set those to the lab test conditions first. A stage you have switched off takes no part in tuning, which means the train you are fitting to is always the train you can see. If the lab stock tank ran warmer than 60 F, add it as an explicit final stage; the report's volumes are still on the standard 60 F basis. Tuning regresses four bounded properties of the C7+ fraction only (critical temperature and pressure multipliers, the methane interaction coefficient, and the volume shift); library components are never altered. The before and after table shows exactly how well each measurement is matched. Matching everything at once is a balance: total GOR and stock-tank API both pull on the stock-tank oil volume, so with inconsistent measurements the fit splits the difference and tells you so. Applied tuning flows into every compositional result, the phase envelope, the EOS black-oil table and the handoffs, and it saves with your project together with the record of the fit: what was matched, the model before and after, and the errors. The report prints that record only while it describes the fluid. Change the composition, the reservoir conditions, the separator stages or a measured value after the fit and the report says the tuning no longer describes this fluid, until you tune again. The cards show the same: \"Tuned on earlier inputs\" replaces \"Lab tuned\" and the tuned C7+ properties stay applied until you tune again or reset. Measured values are also drawn against the model curves.",
  },
  {
    id: 'saveload',
    icon: Save,
    title: 'Saving & loading projects',
    content:
      "Use the Project selector at the top of the left panel. Create a project with the plus button, switch projects from the dropdown, and delete the current one with the trash button. Once a project is open, your inputs autosave about ten seconds after you stop editing; the header indicator shows the save status and clicking it saves immediately. The project stores your inputs, the identification and the input sources you typed on the Report tab, the display units, and the PVT block other apps read. Results recompute automatically on load. A project is private until you share it: the switch under the project selector shares it with your organisation, for colleagues to view or to edit one person at a time. Projects colleagues shared appear under Shared with me; one shared for viewing is never written to, and Save a copy makes your own. If someone saved a newer version while you had the project open, your save is refused and says who saved and when. A project saved by an earlier version opens as it was: in oilfield units, with n/a in the report for what it never held.",
  },
  {
    id: 'units',
    icon: Gauge,
    title: 'Display units',
    content:
      "The selector in the header switches every input, card, plot, table, CSV file and the report between oilfield units (psia, degF, scf/STB, RB/STB) and SI (kPa absolute, degC, m3/m3, mPa.s). A new workspace follows your Suite unit profile; a saved project keeps the units it was saved with. Switching converts the numbers on screen and leaves the stored values alone: what you type is converted at the field. Pressures are absolute throughout. The gas formation volume factor is shown in RB/Mscf (or m3/m3) on every screen, in both CSV files and in the report.",
  },
  {
    id: 'report',
    icon: Save,
    title: 'The report',
    content:
      "The Report tab is the door to the PDF. Fill in the identification (company, field, licence, well, reservoir, sample, sampling details, laboratory and report number, analyst, dates): it is saved with the project and a blank prints as n/a. State where each input came from: a lab measurement, a correlation, an offset well or an assumption, with a note such as the lab report number. The tab then shows what the PDF will print, row for row: headline results, every input with its unit and source, the method used for each property, the basis and conventions (liberation basis, standard conditions, how the bubble point was obtained), the separator stages with their total, the lab tuning record, the limits of the methods with each correlation's published range and every input outside one, the PVT table, and the plots. The plots are drawn from the same points as the screen charts. A plot that does not apply (no lab values, no composition, an envelope not traced yet) is listed with the reason. Trace the phase envelope on the Compositional tab before exporting if you want it in the PDF.",
  },
  {
    id: 'handoff',
    icon: Share2,
    title: 'Sending fluids to other apps',
    content:
      "The Integration Suite sends the fluid to the Line Sizing Studio and to Well Test Analysis Studio. With the values goes a block that says how they were obtained: the method behind every property, the units of every column, the standard and separator conditions, the liberation basis, how the bubble point was obtained, the lab tuning, the range flags and the table. The receiving app prints that as the source of each value it takes, and marks a value you later change there as edited. Save the fluid as a project before sending: the block is stored with the project, so the receiving app can read it again on a later visit, and its report can name the project. In compositional mode the handoff carries the EOS surface numbers and the EOS black-oil table in place of the correlation values.",
  },
  {
    id: 'limits',
    icon: AlertTriangle,
    title: 'Assumptions & limitations',
    content:
      "This studio is a screening and pre-lab tool. It does not substitute for a laboratory PVT or flow-assurance study. In black-oil mode each correlation carries its own validity range, the separator partition is empirical, the hydrate and asphaltene checks are screening indicators, and WAT/AOP are reported only when they can be defended. In compositional mode the equation of state is validated against an independent oracle and reference data; until you tune it to your lab report with the Lab tuning card, treat its absolute predictions as screening numbers, and treat the LBC viscosities as screening numbers in either case. The envelope trace truncates near the critical point where the stability test loses the boundary. Any approximation in play is surfaced as a warning banner, a tier badge, or a note on the relevant results tab. Validate critical decisions against lab data and rigorous simulation.",
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
              <Icon className="w-5 h-5 mr-3 text-pl-muted shrink-0" />
              {item.title}
            </div>
          </AccordionTrigger>
          <AccordionContent className="text-pl-text pl-8 leading-relaxed">
            {item.content}
          </AccordionContent>
        </AccordionItem>
      );
    })}
  </Accordion>
);

export default FluidStudioHelpContent;
