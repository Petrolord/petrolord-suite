// Help-sheet body for the Waterflood Design Studio (rendered inside
// StudioHelp). Sections carried over from the retired Fractional Flow help
// guide plus the new tabs, with the method citations.
import React from 'react';
import { GitMerge, Layers, TrendingUp, Dices, Activity, Camera, BookOpen, AlertTriangle } from 'lucide-react';

const Section = ({ icon: Icon, title, children }) => (
  <section className="bg-slate-900/50 p-4 rounded-lg border border-slate-800">
    <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-blue-400">
      <Icon size={16} />
      <h3>{title}</h3>
    </div>
    <div className="text-xs text-slate-300 leading-relaxed space-y-2">{children}</div>
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

    <Section icon={TrendingUp} title="Pattern forecast (five-spot)">
      <p>
        The forecast composes the Welge displacement solution with the published five-spot areal sweep correlations
        (Craig's breakthrough data via Willhite's regression; Dyes-Caudle-Erickson growth after breakthrough) into a
        material-balance-consistent rate-time forecast: oil and water rates, WOR, cumulative oil and EA vs time, with
        gas fill-up and a WOR economic limit.
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
        rejected and counted rather than silently clamped; a high rejection rate means the distributions are too wide.
        Results are not saved with the project and go stale when any input changes.
      </p>
    </Section>

    <Section icon={Activity} title="Surveillance (operating floods)">
      <p>
        Import a field injection/production history CSV (date, well, oil_bbl, water_bbl, gas_mcf, inj_bbl, optional
        whp_psi). The engine cleans and classifies the data, then reports reservoir-barrel voidage replacement
        (daily, rolling and cumulative VRR with free-gas voidage from Bg and Rs), water cut and KPI trends, and
        capability-gated diagnostics: Hall plot injectivity (needs measured injection pressure), Chan water-control
        log-log WOR diagnostics, injector-producer response from time-lagged cross-correlation, and VRR-balanced
        injection recommendations.
      </p>
      <p>
        Diagnostics that need data your file does not carry state exactly what is missing instead of showing empty
        charts. Uploaded history saves with the project.
      </p>
    </Section>

    <Section icon={Camera} title="Projects and scenarios">
      <p>
        Projects save automatically ten seconds after a change (and on the header save button). Scenarios snapshot
        the whole working case; the Scenarios tab recomputes every snapshot through the same engines for side-by-side
        comparison, and any snapshot can be applied back to the working case.
      </p>
    </Section>

    <Section icon={AlertTriangle} title="Assumptions and limits">
      <p>
        Screening-level analytical methods throughout: 1-D displacement with capillary pressure neglected, piston
        areal growth, non-communicating layers, constant injectivity, no pattern interference. Validate against
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
