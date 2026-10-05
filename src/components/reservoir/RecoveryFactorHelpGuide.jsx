// Recovery Factor Estimator help content, rendered inside the StudioHelp
// sheet (the kit upgrade re-housed this from a standalone Dialog).
import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BookOpen, FolderOpen, Layers, Percent, Calculator, BarChart3, AlertTriangle } from 'lucide-react';

const helpContent = [
  {
    id: 'what',
    icon: BookOpen,
    title: 'What this estimates',
    content:
      'The Recovery Factor (RF) is the fraction of oil or gas in place, at stock-tank or standard conditions, that you expect to produce. This tool closes the volumetrics-to-reserves bridge: recoverable volume = RF x OOIP (or OGIP). It gives an RF from a drive-mechanism analog range or from a correlation, and the recoverable volume at the edges of the analog range. The recoverable volume is technically recoverable: no economic limit, development plan or PRMS reserves class is applied.',
  },
  {
    id: 'projects',
    icon: FolderOpen,
    title: 'Projects, sharing and auto-save',
    content:
      'Use the Project selector in the left rail to create a project. Once a project is open, every input, the identification and the sources auto-save about 10 seconds after each change; click the save indicator to save at once. Projects colleagues shared with your organisation are listed under your own. One shared for viewing opens read-only (Save a copy makes your own); one shared for editing is written only while you hold its check-out. Projects travel in a .pld package with their intake records.',
  },
  {
    id: 'sample',
    icon: Layers,
    title: 'The sample case',
    content:
      'A new case opens on the sample, a water-drive oil case, and says so: a banner on the right, "Sample value" under every field still holding a sample number, and "Sample value of the app, not a measurement" in the report. The Sample button in the header loads it again.',
  },
  {
    id: 'inplace',
    icon: Layers,
    title: 'Step 1: In-place volume (OOIP / OGIP)',
    content:
      'Choose the phase, oil or gas, because that choice drives the whole screen. Then enter the in-place volume directly, take it by id from another app, or use the volumetric calculator. For oil, OOIP = 7,758 A h NTG phi (1 - Sw) / Boi in STB (7,758 bbl per acre-ft). For gas, OGIP = 43,560 A h NTG phi (1 - Sw) / Bgi in scf, with Bgi in reservoir ft3 per scf (the same ratio as rm3/sm3; a value in RB/scf or bbl/Mscf is flagged). "Take by id" reads the OOIP or OGIP of a Material Balance case (its last completed run, contract mbal-1; a link with ?mbalCase= opens the picker on that case) or the deterministic result of a saved ReservoirCalc Pro project. The source is printed, an edit after the intake is said, and a later run of the case shows as "the source changed after the intake".',
  },
  {
    id: 'units',
    icon: Calculator,
    title: 'Display units',
    content:
      'A new project opens in the system your Suite unit profile leans to; a saved project keeps its own. Oilfield shows acres, ft, psia, RB/STB, ft3/scf, MMSTB and Bscf; SI shows ha, m, kPa (absolute), rm3/sm3 and 10^6 or 10^9 sm3. Values are stored in oilfield units and converted at each field, so switching converts the numbers and never relabels them. Permeability is typed in md in both systems.',
  },
  {
    id: 'analog',
    icon: Percent,
    title: 'Step 2: Method, drive-mechanism analog (default)',
    content:
      'Pick the reservoir\'s primary drive mechanism and the tool returns a low edge, a typical value and a high edge of a screening range. Five oil mechanisms: solution-gas drive 5 to 30%, gas-cap expansion 20 to 40%, water drive 35 to 75%, gravity drainage 40 to 80%, combination drive 20 to 50%. Two gas mechanisms: volumetric depletion 70 to 90% and water drive 35 to 75%, lower because an advancing aquifer traps gas behind the front. These ranges are transcribed from reservoir engineering texts and were not checked against a published table in this build; the typical value is the app\'s own central choice. The edges bound a range: they are not P90 and P10 of a distribution. This table is the one source of drive ranges in the Suite: Material Balance Studio reads its forecast reconciliation band from it (a partial water drive there reads the combination-drive range). When the in-place volume came from a Material Balance case, the drive its indices classify is suggested under the drive menu; it is a suggestion, and the choice stays yours.',
  },
  {
    id: 'correlations',
    icon: Calculator,
    title: 'Step 2 (alt): Correlations',
    content:
      'The method menu is filtered by phase. For oil, the API (Arps et al. 1967) solution-gas-drive and water-drive correlations. The published equations take permeability in darcies: type k in md and the estimator divides by 1,000 (before October 2026 it used md directly and the estimate was 1.7 to 2 times too high; a project saved before then says so when it opens). For gas, the exact p/z depletion relation RF = 1 - (pa/za)/(pi/zi), or the water-drive gas method RF = Ev (1 - Sgr/(1 - Swi)), which assumes the swept volume is abandoned at the initial pressure; choose "an abandonment pressure pa" to leave the trapped gas and the gas of the unswept volume at Bga, RF = 1 - (Bgi/Bga)[Ev Sgr/Sgi + (1 - Ev)]. For oil, "Displacement x sweep (kr-1)" takes the oil-water relative permeability of a SCAL Studio project by id and computes the Buckley-Leverett displacement efficiency ED by the Welge construction at the pore volumes injected you state (blank: the end point); RF = ED x Ev with the sweep Ev = EA x EI a stated input. In a gas case, zi, za and Bgi come from Dranchuk-Abou-Kassem on Sutton pseudo-criticals (the canonical engines) from the gas gravity and temperature; choose "Typed" to enter them, and a project saved before October 2026 keeps its typed values. In a new case porosity, Swi and Boi are one value per case: the method reads the volumetric values unless you untick the box to state others. Every input is checked against the domain of its method (abandonment below the bubble point or the initial pressure, fractions between 0 and 1, Sgr below 1 - Swi, z between 0.2 and 2), and a correlation used under another drive is flagged. A value outside 0 to 100 percent is withheld with its reason; it is never clamped.',
  },
  {
    id: 'pvt',
    icon: Calculator,
    title: 'PVT from Fluid Systems Studio',
    content:
      'Under the method inputs, "Take by id" reads the pvt-1 block of a saved Fluid Systems Studio project (or the one named with ?fluidProject=). For oil it takes pb, Bob and muob at the bubble point and Boi, muoi and muwi at the initial pressure pi; for gas, zi and Bgi at pi and za at pa. Values are read from the project table and never extrapolated. The shared PVT card shows the method of each value, "Edited after intake" when you change one, and when the Fluid project changed since. If you change pi or pa after the intake the case says the PVT was read at another pressure.',
  },
  {
    id: 'read',
    icon: BarChart3,
    title: 'Step 3: Read the result',
    content:
      'The cards show the RF with its method and basis, the analog range edges, the in-place volume and where it came from, and the recoverable volume. Flags and warnings sit under them. The chart shows the recoverable volume at the low edge, the estimate and the high edge, in the display unit.',
  },
  {
    id: 'uncertainty',
    icon: BarChart3,
    title: 'Uncertainty: RF x in-place volume',
    content:
      'Under the chart, switch on the uncertainty run. The recovery factor is drawn from a triangular on the analog range edges (with the typical value or the method\'s estimate as the mode) or one you state; the in-place volume is fixed, a triangular you state, the P90, P50 and P10 of ReservoirCalc Pro, or the 95 percent interval of a Material Balance history match read as a normal. The draws go through the Suite\'s canonical Monte Carlo module, seeded: the seed is drawn when you switch the run on, New seed draws another, and the seed and the realisation count are saved and printed. P90 is the low case and P10 the high case (probability of exceedance). Realisations outside the physical range are rejected and counted, never clamped.',
  },
  {
    id: 'send',
    icon: Percent,
    title: 'Send to ReservoirCalc Pro, and the decline cross-check',
    content:
      'Send to ReservoirCalc Pro saves the project and opens ReservoirCalc Pro with ?rfProject= so it reads the estimate by id (contract rf-1) with its method, basis, range and source. ReservoirCalc Pro keeps its own recovery factor until you press Use there; it then keeps the record, says when the value was edited after the intake and when the estimate here changed since. Under Cross-check, take the oil or gas forecasts of the reservoir\'s wells from Decline Curve Analysis (dca-forecast-1, by id): their EUR over the in-place volume is printed beside the estimate. It counts only the wells taken, so with wells missing it is a lower bound.',
  },
  {
    id: 'report',
    icon: BarChart3,
    title: 'The report',
    content:
      'The Report tab takes the identification (company, field, licence, reservoir, wells, analyst, data date, notes) and the source of each typed input, shows what the PDF prints and exports it. The report holds the headline with its basis, the in-place volume and the method by their parts (the factors of a correlation close on its product), every input with its unit and source, the method, its reference and its validation state, the basis and conventions, the limits and every flag, the records of the Material Balance or ReservoirCalc Pro and Fluid intakes, the uncertainty tables when the run is on, the decline cross-check, and the figures (three, plus the exceedance curve when the run is on).',
  },
  {
    id: 'reference',
    icon: Layers,
    title: 'The drive-mechanism reference table',
    content:
      'Below the chart, every mechanism of the phase is listed with its range and a note on what makes it efficient or inefficient: which mechanisms respond to pressure maintenance, where structural relief and vertical permeability matter, and why aquifer support helps an oil reservoir but hurts a gas one.',
  },
  {
    id: 'assumptions',
    icon: AlertTriangle,
    title: 'Assumptions and limitations',
    content:
      'This is a screening tool. It does not replace a reservoir simulation, a decline or material balance forecast, or a reserves study. Analog ranges are broad; the API correlations were fitted to a limited data set with wide scatter, and the data ranges of that set are not checked here. Recovery also depends on the development plan, well count, secondary and tertiary recovery and economics, none of which is modelled.',
  },
];

const RecoveryFactorHelpContent = () => (
  <Accordion type="single" collapsible className="w-full" defaultValue="what">
    {helpContent.map((item) => {
      const Icon = item.icon;
      return (
        <AccordionItem value={item.id} key={item.id}>
          <AccordionTrigger className="text-base hover:no-underline">
            <div className="flex items-center">
              <Icon className="w-5 h-5 mr-3 text-pl-muted" />
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

export default RecoveryFactorHelpContent;
