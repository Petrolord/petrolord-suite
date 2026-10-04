// VRR Monitor help content, rendered inside the StudioHelp sheet (V1 of the
// VRR upgrade re-housed this from a standalone Dialog).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BookOpen, Droplets, Table2, LineChart, Scale, Upload, AlertTriangle, FolderOpen, Gauge, Network, FileText, Ruler, FlaskConical, MapPin, Send, Flame, Database } from 'lucide-react';

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
    title: 'Projects, sharing and auto-save',
    content:
      'Use the Project selector in the left rail to create a project. Once a project is open, everything you enter auto-saves about 10 seconds after each change, and the save indicator in the header shows when the last save happened. Click the indicator to save immediately. Projects your colleagues share with the organisation are listed under Shared with me: one shared for viewing opens read-only (Save a copy makes your own), one shared for editing can be checked out by one person at a time from the sharing bar. Material Balance Studio reads the pressure surveys of a saved project by its id, so delete a project only when no case uses it. Projects travel in a .pld project package.',
  },
  {
    id: 'pvt',
    icon: Droplets,
    title: 'Step 1: Set PVT / formation volume factors',
    content:
      'All volumes are converted to reservoir volume before the ratio is taken, so the analysis needs Bo (oil FVF), Bw (water FVF), Bg (gas FVF, RB/Mscf in oilfield units) and Rs (solution GOR). This constant set applies to every period unless you override it. A blank or mistyped value (for example 1,25) stops the VRR and says why; it is never read as zero. Click "State where these values came from" to record a source (lab, correlation, offset well, assumed) and a note for each; the report prints it, and a starting value nobody changed prints as an assumption. Where fluid properties have moved over the life of the record, switch on the PVT override columns in the period grid and give a period its own Bo, Bw, Bg and Rs; any period you leave blank falls back to the constant set. Solution gas (Rs times Np) is already carried in Bo, so only free produced gas above solution adds to voidage; the engine subtracts it automatically.',
  },
  {
    id: 'fluid',
    icon: FlaskConical,
    title: 'FVFs from a Fluid Systems Studio project',
    content:
      'Under the constant set, choose a saved Fluid Systems Studio project (or open the app with ?fluidProject= and its id) and click Take the PVT table. The app keeps the table of the pvt-1 block with this project (Bg converted from RB/scf to RB/Mscf), fills the constant set at the pressure you state (blank: the bubble point) and switches the FVF mode to Fluid table: each period with a pressure then takes its Bo, Bw, Bg and Rs from the table at that pressure. A period outside the table keeps the constant set and is named; the table is never extrapolated. The intake card says where the fluid came from, the method of each value, "Edited after intake" when you change a value, and "Source changed since" when the Fluid project now says something different; Read it again takes the new block.',
  },
  {
    id: 'units',
    icon: Ruler,
    title: 'Units',
    content:
      'The Oilfield and SI switch in the header changes every field, table, chart, report and CSV: STB, bbl, Mscf, RB and psia, or sm3, 10^3 sm3, rm3 and kPa. A new project opens in the system of your Suite unit profile; a saved project keeps its own. Values are saved in oilfield units whatever you display, so other apps that read the project (Material Balance reads its pressure surveys) always get psia. In SI, Bo and Bw keep their number (rm3/sm3) and Bg is 0.0056146 times its RB/Mscf value.',
  },
  {
    id: 'periods',
    icon: Table2,
    title: 'Step 2: Enter production and injection by period',
    content:
      'On the Data & PVT tab, add one row per surveillance period (typically a month). Enter oil produced (Np, STB), water produced (Wp, STB), gas produced (Gp, Mscf), water injected (Wi, bbl) and gas injected (Gi, Mscf). Produced voidage = Np·Bo + Wp·Bw + free-gas·Bg; injected voidage = Wi·Bw + Gi·Bg. Leave a cell blank and it counts as zero.',
  },
  {
    id: 'read',
    icon: LineChart,
    title: 'Step 3: Read the VRR trend',
    content:
      "The VRR Dashboard tab plots instantaneous VRR (this period alone), rolling VRR (a trailing multi-period window that smooths month-to-month allocation noise) and cumulative VRR (all periods to date) against a reference line at VRR = 1 and your shaded operator target band. The instantaneous line tells you what is happening right now; the cumulative line reflects the reservoir's overall voidage balance since the start of the record. Set the band and rolling window under Analysis Settings; periods outside the band flag as Under or Over. The download button on the chart saves it as a PNG.",
  },
  {
    id: 'pressure',
    icon: Gauge,
    title: 'Pressure tab: the maintenance proof',
    content:
      'VRR is a means to an end; the end is reservoir pressure. On the Pressure tab, enter or import pressure surveys (date and psia) and the app interpolates them onto each period, overlays pressure on the VRR trend, shows dp/dt in the tooltip, and marks fill-up where cumulative VRR first reaches 1. A VRR near 1 with steady pressure is the proof of pressure maintenance; a VRR near 1 with falling pressure suggests out-of-zone injection or unaccounted voidage. Enter surveys as absolute average reservoir pressure, or import a table: the door reads the unit from the header (psia, psig, kPa, bar, MPa; a gauge reading gets the atmosphere added) and asks what the file cannot settle. State the datum depth the surveys are quoted at; it is printed, and no correction is applied. With Pressure track mode on, Bo, Bw, Bg and Rs are derived per period from black-oil correlations (Standing, Dranchuk-Abou-Kassem Z from the engines library as in Fluid Systems Studio, McCain Bw) at the interpolated pressure, once every fluid input is typed; Fluid table reads them from a Fluid Systems Studio table instead. That matters most below the bubble point where gas properties move quickly. Patterns and their injection advice use the same per-period FVFs as the field. The chart is withheld with a stated reason until pressure actually attaches to your periods.',
  },
  {
    id: 'patterns',
    icon: Network,
    title: 'Patterns tab: allocation factors and per-pattern VRR',
    content:
      'A field-level VRR of 1 can hide one flooded-out pattern and one starved one. On the Patterns tab (available with an imported per-well ledger), define patterns as sets of producers, then fill the allocation matrix: for each injector, the fraction of its volume reaching each producer. Rows should sum to 1; a shortfall counts as out-of-zone injection and the audit line accounts for every barrel. The fractions are your judgement (from streamline runs, interference tests or geometry); the app never assumes even splits on its own, though an Even split button is there when that is your call. Each pattern then gets its own VRR trend, band flags, and a water-injection recommendation that scales recent allocated injection by target over current rolling VRR, split per injector by allocated share. Recommendations with an implausibly large step are clamped and flagged; treat that as a prompt to re-check allocation and PVT before acting on it. The KPI row above the trend names the weakest pattern in the field, which is the one furthest below your target band, so the pattern that most needs attention is on screen without hunting through the list. Each pattern can have its own target band (blank follows the field band): its flags and its water injection advice then use it.',
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
      'The Data & PVT tab imports real allocation files: one row per well per date (daily or monthly), with columns for date, well, oil, water and gas produced, and water and gas injected, in any order. The import door reads any separator (comma, semicolon, tab) and either decimal mark, skips text above the table, totals rows and comment lines, and shows what it read before anything changes: each field\'s column, its unit and where the unit came from. A header that names injection (Water Inj, gas_injected, BWIPD) is always an injection column. Units come from the header (bbl, Mbbl, sm3, Mscf, MMscf, 10^3 sm3) or are chosen at the door; a column with no unit is read in your display units and said so. A daily rate (BOPD, Mscf/d) is turned into each row\'s volume by the days of its period: one day for daily rows, the calendar month for monthly rows. When nothing in the file settles whether 01/02/2025 is the 1st of February or the 2nd of January, the door asks. Rows left out are listed with the reason. Daily rows aggregate to calendar months. Download the Template for the schema, or click Sample wells to load a worked 3-month, 4-well example. Wells that ever inject classify as injectors, including gas injectors.',
  },
  {
    id: 'u2-import',
    icon: Upload,
    title: 'Workbooks and rates per producing day',
    content:
      'The ledger door and the pressure door also read Excel workbooks (xlsx, xlsm, xls): the sheets are tried in order until one holds the table, a title line above the header is fine, Excel dates read as dates, and the sheet used is named in the read-back and in the report. When the ledger has a producing-time column (Days On, Producing days, Hours on and similar), a rate such as BOPD is read per producing day: the row volume is the rate times the producing days of the row (hours over 24). Choose "rates are calendar-day averages" at the door if your file quotes calendar-day rates; then the column is not used. A producing time above the days of the period is capped at the period and counted, a blank uses the calendar days and is counted, and with volume columns the column is listed as not needed.',
  },
  {
    id: 'demo',
    icon: Database,
    title: 'The demo field (a second sample)',
    content:
      'Demo field (24 months) on the import door loads an illustrative field built by a stated rule: 6 producers, 3 water injectors and a gas injector from January 2024 to December 2025, free gas once the producing GOR rises above Rs, one producer below its solution GOR, gas injection from the ninth month, quarterly surveys, two patterns with an allocation, a stated datum and well locations for the map. Sample wells keeps the 3-month template the engine tests pin.',
  },
  {
    id: 'freegas',
    icon: Flame,
    title: 'Free gas, field level and well by well',
    content:
      'The headline nets free gas at field (or pattern) level: produced gas above Rs times oil for the whole month, never below zero. A well producing below its solution GOR then offsets a well producing free gas. With an imported ledger the app also floors each well on its own, month by month at that month\'s FVF set, and prints that figure beside the field one: on the KPI rail ("Free gas well by well"), in the report headline with its produced voidage and cumulative VRR, and in the Voidage by well table. The per-well figure is never below the field figure; the headline stays at field level.',
  },
  {
    id: 'map',
    icon: MapPin,
    title: 'Map tab: voidage by well on the well locations',
    content:
      'The Map tab places each ledger well at the surface location of a well in the wells registry (Well Data Manager), sized by its produced voidage (producers) or injected volume (injectors) over the record, with each pattern\'s cumulative VRR at the centre of its producers. Match the wells first: the table proposes a registry well with the same name, the same UWI, or the same letters and digits (check those), and you choose or change each one. Nothing is placed until you click Confirm the match table, and a well you leave unmatched is listed, never placed by guess. The confirmed coordinates are kept with the project; Read the registry again names a well that moved since. Wells in two coordinate systems give no map until they are reprojected. The report draws the same map as a figure and prints the table behind it.',
  },
  {
    id: 'send',
    icon: Send,
    title: 'What other apps read from a project (the vrr-1 contract)',
    content:
      'A saved project sends one contract, vrr-1, read by its id: the per-well ledger by month and the dated pressure rows (absolute psia, with the datum as stated and not corrected). Waterflood Design Studio takes the ledger as its surveillance history from Send to Waterflood Design Studio (and the surveys for FVF by period); Material Balance Studio takes the pressure rows onto the dated rows of a case from its Data tab. A project with a period grid sends its pressure rows only. Both apps say when the project changes after they took it.',
  },
  {
    id: 'data',
    icon: Table2,
    title: 'Manual entry, sample and export',
    content:
      'Without an import, enter monthly field totals directly in the period grid; label periods YYYY-MM so they carry a date (pressure surveys and the calendar figures need it). Click Sample to load a 6-month waterflood dataset, Export to download the grid with the units in its headers, and Import on the grid toolbar to load that same format back in. When a per-well import is active, the grid is replaced by the read-only monthly ledger; clear the import to return to manual entry.',
  },
  {
    id: 'report',
    icon: FileText,
    title: 'Report tab: the PDF and the ledger CSV',
    content:
      'The Report tab holds the identification a reviewer signs against (company, field, licence, reservoir, pattern area, data source, analyst) and shows the report model: headline results, every input with its unit and source, the voidage ledger by period and by term (oil, water and free gas produced; water and gas injected; all in reservoir volume) closing on its totals, and the limits of the analysis. Export PDF prints that with the FVFs of every period, the patterns, the basis and conventions, and figures on a calendar axis (VRR with the 1.0 line and the target band, voidage by term, pressure history, rates, FVFs by period, pattern VRR); a figure that does not apply says why. Ledger CSV writes the same ledger with a provenance header.',
  },
  {
    id: 'assumptions',
    icon: AlertTriangle,
    title: 'Assumptions and limitations',
    content:
      'VRR is a material-balance surveillance ratio. It does not replace a full reservoir simulation. It assumes your FVFs are representative for the period and that reported volumes are allocated correctly to this pattern or reservoir. Free gas is computed per period at field (or pattern) level, so a well producing below its solution GOR offsets one producing free gas; injected water and gas are converted at the produced-water Bw and produced-gas Bg. Pressures are used as given at the datum you state; no correction to datum is applied. VRR says nothing about sweep efficiency or where injected fluid actually goes; a VRR of 1 with poor conformance can still leave oil behind, and a VRR of 1 with falling pressure points to out-of-zone injection or unmeasured voidage. Use it alongside pressure data and pattern analysis.',
  },
];

// Design system: inside the VRR theme scope the accordion (not yet adapted
// in @/components/ui) takes theme roles through class overrides.
const VrrHelpContent = () => {
  return (
  <Accordion type="single" collapsible className="w-full" defaultValue="what">
    {helpContent.map((item) => {
      const Icon = item.icon;
      return (
        <AccordionItem value={item.id} key={item.id} className="border-pl-border">
          <AccordionTrigger className="text-base text-left text-pl-text hover:no-underline hover:text-pl-primary-text">
            <div className="flex items-center">
              <Icon className="w-5 h-5 mr-3 shrink-0 text-pl-primary-text" />
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
};

export default VrrHelpContent;
