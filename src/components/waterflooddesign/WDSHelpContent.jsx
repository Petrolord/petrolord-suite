// Help-sheet body for the Waterflood Design Studio (rendered inside
// StudioHelp). Sections carried over from the retired Fractional Flow help
// guide plus the new tabs, with the method citations.
import React from 'react';
import { GitMerge, Layers, TrendingUp, Dices, Activity, Camera, BookOpen, AlertTriangle, Share2, Gauge, FileText, Ruler } from 'lucide-react';

const Section = ({ icon: Icon, title, children }) => (
  <section className="bg-pl-surface p-4 rounded-lg border border-pl-border">
    <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-pl-text">
      <Icon size={16} className="text-pl-primary-text" aria-hidden="true" />
      <h3>{title}</h3>
    </div>
    <div className="text-xs text-pl-text leading-relaxed space-y-2">{children}</div>
  </section>
);

const WDSHelpContent = () => (
  <>
    <Section icon={GitMerge} title="Displacement (Buckley-Leverett)">
      <p>
        Build relative permeability from Corey endpoints and exponents, or paste a lab table (Sw, krw, kro).
        The engine constructs the water fractional flow curve, finds the Welge tangent from (Swc, 0), and reports
        the shock-front saturation, breakthrough pore volumes, and oil recovery vs PV injected.
      </p>
      <p>
        The dip/gravity switch adds the field-unit gravity term to fw (updip displacement positive; denser water
        moving updip delays breakthrough). The polymer switch multiplies water viscosity for mobility-control
        screening only.
      </p>
      <p>
        Sample loads a worked case so you can see the whole displacement solution before entering your own numbers,
        and Reset returns the panel to its defaults.
      </p>
    </Section>

    <Section icon={Layers} title="Layered sweep (Dykstra-Parsons and Stiles)">
      <p>
        Enter layers as thickness and permeability (or import CSV). The studio computes the Dykstra-Parsons
        permeability variation V from a log-normal fit, then runs both classic conformance methods: Dykstra-Parsons
        (mobility-dependent frontal positions, vertical coverage vs reservoir WOR) and Stiles (capacity-ordered
        breakthrough, coverage vs surface water cut).
      </p>
      <p>
        Both assume piston displacement in non-communicating layers with equal porosity and saturation change.
      </p>
    </Section>

    <Section icon={TrendingUp} title="Pattern forecast">
      <p>
        The forecast composes the Welge displacement solution with the published five-spot areal sweep correlations
        (Craig's breakthrough data via Willhite's regression; Dyes-Caudle-Erickson growth after breakthrough) into a
        material-balance-consistent rate-time forecast: oil and water rates, WOR, cumulative oil and EA vs time, with
        gas fill-up and a WOR economic limit.
      </p>
      <p>
        The areal sweep correlation is entered with Craig's mobility ratio: krw at the average water saturation
        behind the front at breakthrough, kro at Swc. That is the definition Craig's five-spot data were correlated
        on. The endpoint ratio (krw at Sor) is still shown and still drives the displacement and Dykstra-Parsons.
        Projects saved before October 2026 open on the endpoint basis they were computed with and say so; the switch
        under "Mobility ratio for the areal sweep" moves them to Craig. The panel under the KPIs splits the recovery
        into displacement efficiency ED, areal sweep EA and vertical sweep EV, closing on Np over the pattern OOIP.
      </p>
      <p>
        The flood pattern is chosen at the top of the Pattern tab: five-spot (the default), direct line drive or
        staggered line drive. The line drives take the areal sweep from Fassihi's regression of the Dyes, Caudle and
        Erickson charts (Ahmed, Reservoir Engineering Handbook, eq. 14-67): the sweep at breakthrough at a water cut
        of zero, then at each step the sweep that matches the water cut the pattern is producing. The spacing ratio
        of those models is not printed in the source, so it is not an input. A nine-spot is not offered because no
        published correlation for it could be read and checked.
      </p>
      <p>
        Export the annual oil profile as CSV and load it in NPV Scenario Builder for fiscal economics; this studio
        deliberately carries no valuation.
      </p>
    </Section>

    <Section icon={Dices} title="Uncertainty (Monte Carlo)">
      <p>
        Pick which inputs are uncertain, give each a distribution (triangular, uniform, normal or lognormal), and run.
        Every iteration samples the enabled parameters, substitutes them into the working case and reruns the full
        five-spot forecast. Results report the cumulative-oil distribution in the petroleum percentile convention
        (P90 is the low case), an exceedance curve, and a Spearman rank-correlation tornado showing which inputs
        drive Np.
      </p>
      <p>
        Physically invalid samples (for example a sampled Swc and Sor that leave no mobile saturation window) are
        rejected and counted, with none silently clamped; a high rejection rate means the distributions are too wide.
        The realizations are not saved; the summary of the last run (percentiles, counts, rejections) is saved with the
        project with a note of the inputs it was run on, so a reopened project says whether it still describes the
        working case. The distributions are entered in oilfield units whatever the display units.
      </p>
    </Section>

    <Section icon={Activity} title="Surveillance (operating floods)">
      <p>
        Import a field injection and production history (CSV, TSV or text). Columns are found by their headers in
        any order (date, well, daily oil, water and gas rates, water injection rate, optional injection pressure).
        A unit written in a header, such as "Oil rate (sm3/d)" or "Pressure (kPa)", is used; otherwise the units
        chosen above the Import button apply. Day-first and month-first dates and decimal commas are read; when the
        file cannot settle the date order you are asked. Volumes and cumulatives are refused by name, because the
        engine reads daily rates. After the import a read-back lists each column, its unit, the rows read and every
        row left out with its reason; the report prints the same. Totals and the cumulative VRR are calendar volumes
        (rate times the days to the next row), so weekly and monthly files add up correctly.
      </p>
      <p>
        State whether the pressure column is wellhead or bottomhole: the Hall plot integrates it as given, and the
        report names it. The Hall plot draws the baseline (first third) and recent (last third) windows with their
        least-squares lines; each slope is listed with its 95 percent interval.
      </p>
      <p>
        The engine cleans and classifies the data, then reports reservoir-barrel voidage replacement
        (daily, rolling and cumulative VRR with free-gas voidage from Bg and Rs), water cut and KPI trends, and
        capability-gated diagnostics: Hall plot injectivity (needs measured injection pressure), Chan water-control
        log-log WOR diagnostics, injector-producer response from time-lagged cross-correlation, and VRR-balanced
        injection recommendations.
      </p>
      <p>
        Diagnostics that need data your file does not carry state exactly what is missing and show no empty charts. Uploaded history saves with the project.
      </p>
    </Section>

    <Section icon={Share2} title="Data arriving from other studios">
      <p>
        Two studios can push their results straight into this one, so a design does not have to be re-keyed from
        another app's output.
      </p>
      <p>
        <strong>SCAL Studio</strong> sends a fitted relative permeability set. It lands on the Displacement panel and
        replaces the Corey endpoints and exponents, or the pasted table, with the curves you fitted to lab data. It
        also overwrites the water and oil viscosities on that panel whenever SCAL supplies them, so check those two
        fields after an arrival.
      </p>
      <p>
        <strong>Well Test Analysis Studio</strong> sends an interpreted permeability. It lands in the permeability
        field on the Displacement panel, which is the k used by the dip and gravity term. If the dip and gravity
        switch is off, the arriving value is stored and changes no result until you turn it on. The pattern forecast
        takes no permeability input at all.
      </p>
      <p>
        <strong>Fluid Systems Studio</strong>: on the Pattern or Surveillance tab choose a saved Fluid project, state
        the reservoir pressure (blank: the bubble point) and take the oil and water viscosities, Bo, Bw, Bg and Rs
        read from the project's own PVT table. One pressure serves the project; nothing is extrapolated outside the
        table. A link with ?fluidProject=&lt;id&gt; preselects the project.
      </p>
      <p>
        Both intake cards (relative permeability and PVT) read the source project again and say "Source changed since"
        when its content changed, and "Edited after intake" when you typed over a value here. The report prints the
        source project, its method and the edit.
      </p>
      <p>
        Both arrivals raise a notification naming what changed, so an overwrite is never silent.
      </p>
      <p>
        Each tab is also directly linkable, which is what the retired Waterflood Dashboard now redirects into, so a
        saved link opens on the tab you left it on.
      </p>
    </Section>

    <Section icon={Share2} title="Sending the forecast on">
      <p>
        On the Pattern tab, "Send this forecast" opens the pattern forecast in Forecast Scenario Hub as a case, or in
        Petroleum Economics Studio as a production file (open a case, then Production, Import from Waterflood Design
        Studio). Set the flood start date first: it puts the forecast on the calendar.
      </p>
      <p>
        The receiving app reads the saved project by its id (the wf-forecast-1 contract): the oil and water profile at
        stock-tank conditions, the sweep model and mobility ratio basis, the kr and PVT sources and the build. It keeps
        that record, prints where the numbers came from, and says when the project here has changed since.
      </p>
    </Section>

    <Section icon={Gauge} title="The diagnostics rail">
      <p>
        The rail down the right side shows the readout that belongs to the tab you are on: front diagnostics on
        Displacement, the heterogeneity measure on Layered Sweep, a pattern summary on Pattern Forecast, the last
        Monte Carlo run on Uncertainty, and a field summary on Surveillance. The scenario manager is the one part
        that stays with you across every tab.
      </p>
      <p>
        Because the rail follows the tab, checking whether a change on one tab has moved the answer on another means
        switching to that tab and reading it there. Saving a scenario before and after the change is the reliable way
        to compare, since the scenario table recomputes both.
      </p>
    </Section>

    <Section icon={FileText} title="The report">
      <p>
        The Report tab holds the identification (company, field, licence, reservoir, pattern, wells, analyst) and the
        source of each typed input, shows the rows the PDF prints, and exports the PDF: headline results, the recovery
        split, the mobility ratio by its parts, every input with its unit and source, the forecast year by year, the
        surveillance file as read with its wells, the Hall windows, the model, the basis and conventions, the limits
        and flags, the kr-1 and pvt-1 blocks, and up to eleven figures. A figure that does not apply says why.
      </p>
    </Section>

    <Section icon={Ruler} title="Units">
      <p>
        Choose Oilfield or SI under the project picker. A new project follows your Suite unit profile; a saved project
        keeps its own. Inputs, KPIs, axes and the report follow the choice; the project is stored in oilfield units.
        Formation volume factors are reservoir barrels per stock-tank barrel (rm3/sm3 in SI); Bg is per Mscf. The
        annual CSV for NPV Scenario Builder stays in stock-tank barrels.
      </p>
    </Section>

    <Section icon={Camera} title="Projects and scenarios">
      <p>
        Projects save automatically ten seconds after a change (and on the header save button). A project can be
        shared with your organisation for viewing or editing; a colleague edits one at a time after checking it
        out, and a read-only project offers "Save a copy". Scenarios snapshot
        the whole working case; the Scenarios tab recomputes every snapshot through the same engines for side-by-side
        comparison, and any snapshot can be applied back to the working case.
      </p>
    </Section>

    <Section icon={AlertTriangle} title="Assumptions and limits">
      <p>
        Screening-level analytical methods throughout: 1-D displacement with capillary pressure neglected, piston
        areal growth, non-communicating layers, constant injectivity, no pattern interference, five-spot and line drives
        only, the five-spot correlation valid for mobility ratios of 0.15 to 10 and the line drive regression
        fitted over about 0.1 to 10. Validate against
        simulation or surveillance before committing capital.
      </p>
    </Section>

    <Section icon={BookOpen} title="References">
      <p>
        Buckley &amp; Leverett (1942); Welge (1952); Dake, "Fundamentals of Reservoir Engineering", Ch.10;
        Willhite, "Waterflooding", SPE Textbook Vol.3; Dykstra &amp; Parsons (1950); Stiles (1949);
        Craig, "The Reservoir Engineering Aspects of Waterflooding", SPE Monograph Vol.1;
        Dyes, Caudle &amp; Erickson (1954); Ahmed, "Reservoir Engineering Handbook", Ch.14.
      </p>
    </Section>
  </>
);

export default WDSHelpContent;
