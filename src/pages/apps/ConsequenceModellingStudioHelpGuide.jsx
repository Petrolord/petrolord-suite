// In-app help guide for the Consequence Modelling Studio (Process Safety PS2).
//
// Sourced from the engine itself (the basis strings engines/hse/consequence.js
// returns with every result) and from its validation record,
// packages/engines/tools/validation/hse/FINDINGS-consequence.md. Where this
// guide states an equation, a range, a refusal or an erratum, it is the
// engine's or the record's.
//
// Copy rule (owner): no em dashes and no contrastive negation phrasing.
import React from 'react';
import {
  AlertTriangle, BookOpen, Bomb, CheckCircle2, Droplets, FileWarning, Flame, HeartPulse, Library, Wind, Zap,
} from 'lucide-react';
import {
  Callout, Code, Formula, GuideSection, HelpGuideShell, Para, SectionHeading, Step, SubHeading, Table,
} from '@/components/helpguide/HelpGuideLayout';
import { CONSEQUENCE_STUDIO_ROUTE } from '@/utils/processSafety/consequenceStudy';

export const CONSEQUENCE_GUIDE_SECTIONS = [
  { id: 'overview', icon: BookOpen, title: 'What this does' },
  { id: 'scope', icon: AlertTriangle, title: 'Read this first' },
  { id: 'quickstart', icon: Zap, title: 'Quick start' },
  { id: 'source', icon: Droplets, title: 'Source term' },
  { id: 'dispersion', icon: Wind, title: 'Dispersion' },
  { id: 'fire', icon: Flame, title: 'Pool fire, solid flame' },
  { id: 'explosion', icon: Bomb, title: 'Explosion' },
  { id: 'harm', icon: HeartPulse, title: 'Harm: probits' },
  { id: 'errata', icon: FileWarning, title: 'Errata in the sources' },
  { id: 'validation', icon: CheckCircle2, title: 'How the engine was validated' },
  { id: 'sources', icon: Library, title: 'Sources' },
];

const ConsequenceModellingStudioHelpGuide = () => (
  <HelpGuideShell
    title="Consequence Modelling Studio Help Guide"
    subtitle="Source terms, dispersion, pool fire radiation, blast overpressure and probits"
    metaDescription="How to use the Consequence Modelling Studio: orifice discharge, pool evaporation, the Gaussian plume, the solid-flame pool fire, TNT equivalence with Kinney and Graham, and thermal, toxic and overpressure probits."
    backTo={CONSEQUENCE_STUDIO_ROUTE}
    backLabel="Back to Consequence Modelling Studio"
    icon={AlertTriangle}
    sections={CONSEQUENCE_GUIDE_SECTIONS}
  >
    <GuideSection id="overview">
      <SectionHeading icon={BookOpen}>What this does</SectionHeading>
      <Para>
        The studio follows a loss of containment through five steps. How fast does it come out? Where does the vapour
        go, and how strong is it downwind? If the pool ignites, how much heat reaches a person? If a cloud explodes,
        how hard is the blast at a distance? And what probability of fatality does each dose carry?
      </Para>
      <Para>
        Each step can take its input from the one before: the pool evaporation rate feeds the plume, the pool
        diameter feeds the fire, and the heat flux, concentration and overpressure feed the probits. A carried over
        value is shown in blue with where it came from. Studies are saved to your organization; only the inputs are
        stored, and every result is recomputed when a study opens.
      </Para>
    </GuideSection>

    <GuideSection id="scope">
      <SectionHeading icon={AlertTriangle}>Read this first</SectionHeading>
      <Callout tone="danger" title="What is not modelled">
        Two-phase (flashing) discharge; the instantaneous puff; urban dispersion coefficients; dense gas dispersion;
        jet fires; the TNO multi-energy method; Kingery-Bulmash blast curves; and unconfined pool spreading (a pool is
        either a bund or a stated thickness). Each was left out for want of a reproducible public closed form or a
        clean worked example: the Yellow Book two-phase and spreading models are numerical, the puff sigmas and the
        urban sigma y were in no source read, and the only worked jet fire example (Yellow Book 6.6.2) carries at
        least four internal inconsistencies, so a golden could not tell a right engine from a wrong one.
      </Callout>
      <Callout tone="warn" title="The Facilities point-source model is a separate screening model">
        The flare and pool fire radiation and setbacks in the Facilities apps come from a point-source model: the
        radiated fraction of the heat release spread over a sphere, K = tau F Q / (4 pi R^2), at the API 521
        customary levels. The NextGen courses FC1 and FC5 grade those outputs, and this studio does not re-expose
        them. This studio adds the solid-flame model, which that model states it does not provide (no view factor and
        no surface emissive power). The two give different distances for the same fire by design. The only piece they
        share is the still-air Thomas flame height, imported from the same function.
      </Callout>
      <Callout tone="warn" title="Every number is yours">
        The opening study follows a benzene release into a bund. Its fire step is the Yellow Book worked example 6.6.3
        and its gas release is the Yellow Book hydrogen case 2.6.2.1, reproduced as printed. The hole, the vapour
        pressure, the explosion charge and the exposure times are illustrative values chosen to carry one step into the
        next.
      </Callout>
    </GuideSection>

    <GuideSection id="quickstart">
      <SectionHeading icon={Zap}>Quick start</SectionHeading>
      <Step n={1} title="Source term">
        Describe the liquid release (hole, head, pressure) and the gas release (pressure, temperature, molar mass,
        gamma). Say how big the spill is and what contains it, then give the pool temperature and vapour pressure for
        the evaporation rate.
      </Step>
      <Step n={2} title="Dispersion">
        Choose what feeds the plume (the evaporation rate, the gas release or a typed rate), the wind, and a
        Pasquill-Gifford class or your own sigmas. Place a receptor, and give a target concentration for the distance
        search.
      </Step>
      <Step n={3} title="Fire">
        Take the pool diameter from the spill, pick the burning rate, flame length and emissive power methods, and set
        the target distance and transmissivity.
      </Step>
      <Step n={4} title="Explosion">
        Give the TNT equivalent of the fuel in the cloud, or a TNT mass, and a distance.
      </Step>
      <Step n={5} title="Harm">
        Pick a probit preset for each of heat, toxic gas and blast. The dose comes from the tab that computed it unless
        you type one.
      </Step>
      <Para>
        Units are on every field. Blank means absent: the engine then applies its documented default (the Schmidt
        number 0.8, the soot emissive power 20 kW/m2) or refuses and names the field. Nothing blank is read as zero.
        A refusal is printed in the engine&apos;s own words, starting with the engine&apos;s name for the field, and
        the field is outlined in red.
      </Para>
    </GuideSection>

    <GuideSection id="source">
      <SectionHeading icon={Droplets}>Source term</SectionHeading>
      <SubHeading>Liquid through a hole (Yellow Book 2.194 to 2.196)</SubHeading>
      <Formula>qS = Cd Ah sqrt(2 (P - Pa) rhoL),   P = rhoL g hL + PaL</Formula>
      <Para>
        Bernoulli with the initial liquid velocity neglected, g = 9.80665 m/s2. PaL is the absolute pressure above the
        liquid and hL the liquid height above the hole. A pressure at the hole at or below ambient is refused: nothing
        flows out. The Yellow Book recommends Cd 0.62 for a sharp orifice.
      </Para>
      <SubHeading>Gas through a hole (Yellow Book 2.22 to 2.26)</SubHeading>
      <Formula>qS = Cd Ah psi sqrt(rho0 P0 gamma (2/(gamma+1))^((gamma+1)/(gamma-1)))</Formula>
      <Para>
        Ideal gas upstream. The flow is <Code>CHOKED</Code> when Pa/P0 is at or below the critical pressure ratio
        (2/(gamma+1))^(gamma/(gamma-1)), and <Code>SUBSONIC</Code> above it, with psi from Yellow Book 2.25. A ratio
        exactly at the critical value counts as choked (the Yellow Book&apos;s test is P0/Pa at or above the critical
        value), and psi equals 1 there, so the regime flips with no jump in flow. The critical ratio is the one the
        Facilities relief engine uses.
      </Para>
      <SubHeading>Pool from a spill (Yellow Book 6.64, 6.65)</SubHeading>
      <Para>
        Confined: the pool covers the bund floor, the depth is V / A, and a depth above the bund wall height is refused
        because the bund overtops. Unconfined: A = V / delta at the thickness you state. Either way D = sqrt(4 A / pi).
        The spill volume can also be the liquid release held for a duration, which is the studio&apos;s own arithmetic
        (rate x duration / density) at the constant initial rate.
      </Para>
      <SubHeading>Evaporation, Mackay and Matsugu (Yellow Book 3.13, 3.24, 3.25)</SubHeading>
      <Formula>km = 0.004786 u10^0.78 (2r)^-0.11 Sc^-0.67;   q = km Pv mu / (R T) x A</Formula>
      <Para>
        For a non-boiling pool. Sc defaults to 0.8, the Yellow Book&apos;s value for gases and vapours in general. The
        pool temperature is yours (no heat balance). A vapour pressure at or above ambient is a boiling pool and is
        refused. A wind of 0 is refused too: the correlation gives zero evaporation in calm air, an artefact of its
        form with no physical meaning.
      </Para>
    </GuideSection>

    <GuideSection id="dispersion">
      <SectionHeading icon={Wind}>Dispersion</SectionHeading>
      <SubHeading>The plume (ALOHA Technical Documentation 4.3)</SubHeading>
      <Formula>
        C = Q / (2 pi sy sz u) exp(-y^2 / 2 sy^2) [exp(-(z - h)^2 / 2 sz^2) + exp(-(z + h)^2 / 2 sz^2)]
      </Formula>
      <Para>
        A continuous point source with total reflection at the ground (an image source at -h), the same expression the
        Purple Book uses in its Appendix 6.B. On the centreline at ground level it reduces to Q / (pi sy sz u)
        exp(-h^2 / 2 sz^2). The studio shows the centreline value (y = 0) and the value at your receptor (x, y, z), in
        mg/m3 and, with a molar mass, in ppm by volume. The wind cannot be 0: the plume divides by it and has no calm
        air form.
      </Para>
      <SubHeading>Briggs rural sigmas (ALOHA Table 13)</SubHeading>
      <Formula>sigma_y = sy1 x / sqrt(1 + sy2 x);   sigma_z = sz1 x (1 + sz2 x)^sz3</Formula>
      <Table
        headers={['Class', 'sy1', 'sy2', 'sz1', 'sz2', 'sz3']}
        rows={[
          ['A', '0.22', '0.0001', '0.2', '0', '0'],
          ['B', '0.16', '0.0001', '0.12', '0', '0'],
          ['C', '0.11', '0.0001', '0.08', '0.0002', '-0.5'],
          ['D', '0.08', '0.0001', '0.06', '0.0015', '-0.5'],
          ['E', '0.06', '0.0001', '0.03', '0.0003', '-1'],
          ['F', '0.04', '0.0001', '0.016', '0.0003', '-1'],
        ]}
      />
      <Para>
        The engine warns outside 100 m to 10 km, the range these curves are usually quoted for, and computes anyway.
        That range is quoted from memory of the standard texts and was not read in a source here. Sigmas you give are
        used as they stand, at one distance.
      </Para>
      <SubHeading>Distance to a concentration</SubHeading>
      <Para>
        On the centreline at the receptor height, for a stability class. A ground-level release falls monotonically
        with distance, so it has one root, the far one. An elevated release rises to a peak and falls, so it can have
        two: a near root and a far root. The engine reports <Code>REACHED</Code> with the roots,{' '}
        <Code>NOT_REACHED</Code> when the peak is below the target, and <Code>BEYOND_SEARCH_RANGE</Code> when the
        concentration is still above the target at 100 km. A target in ppm is converted by the engine first.
      </Para>
      <SubHeading>ppm and mg/m3</SubHeading>
      <Para>
        mg/m3 = ppm x M / Vm with Vm = R T / P, the ideal gas molar volume at the temperature and pressure you give. At
        25 C and 1 atm that is 24.465 L/mol; the 24.45 CCOHS and NIOSH print is its rounding.
      </Para>
    </GuideSection>

    <GuideSection id="fire">
      <SectionHeading icon={Flame}>Pool fire, solid flame</SectionHeading>
      <Formula>q = SEP x F x tau   (Yellow Book 6.4)</Formula>
      <Para>
        The flame is a cylinder of radius D/2 with the computed length and tilt. The heat flux uses Fmax, the vector sum
        of the vertical and horizontal view factors (Yellow Book 6.A.18), which is the most exposed target orientation.
        Fv and Fh are shown too. Wind elongation of the flame base (Yellow Book 6.18) is not applied, as in the Yellow
        Book&apos;s own example.
      </Para>
      <Table
        headers={['Step', 'Methods', 'Source']}
        rows={[
          ['Burning flux', 'Babrauskas m" = m"inf (1 - exp(-k beta D)) with a Table 6.5 fuel or your coefficients; Burgess m" = 0.001 dHc / (dHv + Cp (Tb - Ta))', 'Yellow Book 6.66, Table 6.5; 6.67'],
          ['Flame length', 'Thomas with wind L/D = 55 (m" / (rho_air sqrt(g D)))^0.67 u*^-0.21, u* = max(1, u10 / uc); Thomas still air L/D = 42 (m" / (rho_air sqrt(g D)))^0.61', 'Yellow Book 6.12 to 6.14; Thomas (1963)'],
          ['Tilt', 'tan(t)/cos(t) = 0.666 Fr10^0.333 Re^0.117', 'Yellow Book 6.16, 6.68 to 6.70'],
          ['Surface emissive power', 'Mudan 140e3 exp(-0.12 D) + 20e3 (1 - exp(-0.12 D)); SEPmax = Fs m" dHc / (1 + 4 L/D); with soot SEPmax (1 - soot) + SEPsoot soot', 'Yellow Book 6.19, 6.71, 6.20'],
          ['View factor', 'Mudan tilted cylinder (Raj at zero tilt), target at ground level', 'Yellow Book Appendix 6.1'],
          ['Transmissivity', 'Bagster tau = 2.02 (pw x)^-0.09, or a value you give', 'Yellow Book 6.29'],
        ]}
      />
      <Callout tone="warn" title="Refusals you may meet">
        Bagster is refused outside 1e4 &lt; pw x &lt; 1e5 N/m, where the Yellow Book advises against it (below about
        2.5e3 the fit exceeds 1); then give a transmissivity, for example from Hottel&apos;s charts. x is the path from
        the flame surface, X minus D/2. A tilted flame that reaches over the target (1 + (L/R) sin(tilt) at or above
        X/R) is refused: there the closed form counts flame surface behind the target as seen, and a numerical
        integration shows Fv wrong by 0.0063 to 0.070. A target at or inside the flame base is refused. Burgess with a
        boiling point below ambient is refused, because the printed form would then shrink its denominator.
      </Callout>
      <SubHeading>Distance to a heat flux</SubHeading>
      <Para>
        Found by bisection on the solid-flame heat flux from just outside the flame (past the overhang of a tilted
        flame) out to 10 km, with states <Code>REACHED</Code>, <Code>NOT_REACHED</Code> and{' '}
        <Code>BEYOND_SEARCH_RANGE</Code>. The search needs a fixed transmissivity, because a search over distance would
        walk out of Bagster&apos;s band. With Bagster selected, give the value to hold for the search.
      </Para>
      <SubHeading>The heat flux chart</SubHeading>
      <Para>
        Engine values at 80 distances outward from just outside the flame. With Bagster, distances where pw x leaves
        its band are refused by the engine and left as gaps in the curve.
      </Para>
    </GuideSection>

    <GuideSection id="explosion">
      <SectionHeading icon={Bomb}>Explosion</SectionHeading>
      <SubHeading>TNT equivalence (Yellow Book 5.1)</SubHeading>
      <Formula>Q_TNT = alpha_e Qf Emf / Em_TNT</Formula>
      <Para>
        The yield factor alpha_e is yours (the Yellow Book reports 0.02 to 0.2 in use). So is the TNT blast energy: the
        Yellow Book cites 4.19 to 4.65 MJ/kg in use and other texts use 4.68 to 4.69. A value outside 4.0 to 5.0 MJ/kg
        is refused to catch a units slip such as kJ/kg.
      </Para>
      <SubHeading>Kinney and Graham free-air overpressure</SubHeading>
      <Formula>
        Z = R / W^(1/3);   ps / pa = 808 [1 + (Z/4.5)^2] / (sqrt(1 + (Z/0.048)^2) sqrt(1 + (Z/0.32)^2) sqrt(1 + (Z/1.35)^2))
      </Formula>
      <Para>
        Peak side-on overpressure of a free-air TNT burst, from Kinney and Graham (1985) as Guzas and Earls (2010)
        print it. A surface (hemispherical) burst is outside the model; allow for it, if you need to, in the charge you
        give. The distance to an overpressure inverts the fit by bisection on Z.
      </Para>
      <Callout tone="warn" title="The Z range is a judgement">
        The fit is refused outside Z = 0.05 to 40 m/kg^(1/3). No range was found printed for the Kinney and Graham fit
        itself, so the span of the Kingery-Bulmash TNT compilation is borrowed. Beyond 40 the fit decays as 0.827 / Z;
        refusing there means the glass-breakage band (about Z 50 to 80) needs another method.
      </Callout>
    </GuideSection>

    <GuideSection id="harm">
      <SectionHeading icon={HeartPulse}>Harm: probits</SectionHeading>
      <Formula>P = Phi(Y - 5)   (Purple Book 5.1, Table 5.1)</Formula>
      <Table
        headers={['Harm', 'Probit', 'Presets']}
        rows={[
          ['Heat', 'Y = a + b ln(t I^(4/3)), t in s', <span key="t"><Code>eisenberg</Code>, <Code>tsao-perry</Code> and <Code>lees</Code> (I in kW/m2, OSD/30 Table 17); <Code>purple-book</Code> (I in W/m2, Purple Book 5.4)</span>],
          ['Toxic gas', 'Y = a + b ln(C^n t), t in min', <span key="x"><Code>pb-</Code> presets (C in mg/m3, Purple Book Table 5.2); <Code>lees-</Code> presets (C in ppm, Lees 2005 as OSD/30 Table 2 prints them)</span>],
          ['Blast', 'Y = a + b ln(P)', <span key="b"><Code>hsc</Code>, P in psig (OSD/30 Equation 4a, the HSC road and rail study)</span>],
        ]}
      />
      <Callout tone="info" title="Not every heat probit called TNO is Eisenberg">
        The Purple Book&apos;s -36.38 + 2.56 ln(Q^(4/3) t) with Q in W/m2 is Tsao and Perry: -12.8 - 2.56 ln(1e4) =
        -36.378. Tsao and Perry sits 2.1 probit units above Eisenberg, and at the Eisenberg 50 percent dose it gives about
        98 percent. The presets are named by origin so the two cannot be confused. Eisenberg in kW/m2 is identical to
        -14.9 + 2.56 ln(t q^(4/3) / 1e4) with q in W/m2.
      </Callout>
      <Para>
        A toxic concentration in a unit other than the preset&apos;s is converted by the engine at the stated
        temperature and pressure, which needs the molar mass. The plume is steady, so the dose is C^n t at a constant
        concentration and the exposure time is yours. Probabilities use the normal CDF of Abramowitz and Stegun 7.1.26,
        accurate to 1.5e-7 absolute; below about 1e-6 read the probability as effectively zero.
      </Para>
      <Para>
        Left out: the OSD/30 Table 17 TNO heat row (its printed lethal doses do not follow from its coefficients), and
        the lung haemorrhage and eardrum probits often quoted from the TNO Green Book (the source could not be read).
      </Para>
    </GuideSection>

    <GuideSection id="errata">
      <SectionHeading icon={FileWarning}>Errata in the sources</SectionHeading>
      <Para>Found while validating the engine. The ones that matter if you check the studio against a book:</Para>
      <Table
        headers={['Where', 'What it prints', 'What holds']}
        rows={[
          ['Yellow Book 6.6.3, Froude number', 'Fr10 = 0.0545', '5^2 / (9.80665 x 42.445) = 0.06006; the printed tilt 50.8286 degrees follows only from 0.06006'],
          ['Yellow Book 6.6.3, air viscosity', '7.5133e-6 m2/s for air at 15 C', 'Air at 15 C is about 1.48e-5. The studio opens on the printed value so the example reproduces; use the physical value for your own study'],
          ['Yellow Book 6.6.3, distances', '"50 m from the flame surface"', 'The steps compute with 100 m from the centre. Bagster\'s x is from the flame surface, so the engine uses X - D/2'],
          ['Yellow Book 6.6.2, jet flame', 'Bagster with exponent -0.08', 'The equation has -0.09, and pw x there is outside Bagster\'s range'],
          ['Yellow Book Table 6.A.1', '210 at (1.2, 0.1); 117 at (1.4, 0.2)', '201 and 177 follow from the table\'s own Fh and Fv'],
          ['Yellow Book Table 2.8, t = 0', '60.915 kg/s', 'Bernoulli gives 58.64 kg/s; the example\'s 500 s value (58.44 kg/s) reproduces'],
          ['Yellow Book pdf text, 6.A.14 and 6.A.15', 'square roots dropped; C = (1 + (b-1)^2 cos^2)', 'C = sqrt(1 + (b^2 - 1) cos^2 t), Mudan\'s form; the worked example reproduces only with it'],
          ['OSD/30 Equation 4', '95 percent at 43.5 psig', 'The probit gives 43.7 psig'],
          ['ALOHA Table 13 note', 'sz2 0.00015 printed in Briggs (1973) and later texts', '0.0015 (the rural class D row here)'],
          ['CBU 2020 Kinney-Graham paper', 'constants 800 and 0.049', 'Its own computed column follows 808 and 0.048'],
        ]}
      />
    </GuideSection>

    <GuideSection id="validation">
      <SectionHeading icon={CheckCircle2}>How the engine was validated</SectionHeading>
      <Para>
        The engine lives in the Petrolord engines repository (engines/hse/consequence.js) and was built validation
        first: an independent Python oracle (numpy and scipy) that never calls the engine writes the goldens, and the
        engine&apos;s gate calls every golden through the engine. Published values it reproduces include:
      </Para>
      <Table
        headers={['Published case', 'Printed', 'Engine']}
        rows={[
          ['Yellow Book 6.6.3 benzene pool fire, heat flux at 100 m', '4,581 W/m2', '4,582.5 W/m2'],
          ['Yellow Book 6.6.3 flame length, tilt', '46.7725 m, 50.8286 degrees', '46.7753 m, 50.8287 degrees'],
          ['Yellow Book 2.6.2.1 hydrogen, t = 0', '15.31 kg/s', '15.3118 kg/s (gamma 1.405 inferred)'],
          ['Yellow Book 2.6.4.1 acrylonitrile', '58.44 kg/s', '58.4296 kg/s'],
          ['Purple Book Appendix 6.B CO plume', '21.3 g/m3', '21.26 g/m3'],
          ['Purple Book Appendix 6.B CO probit', 'Pr 5.97, P 0.835', 'Pr 5.9677, P 0.8334'],
          ['OSD/30 Table 2, Lees toxic probits', '52 LC1 and LC50 values', 'all 52 reproduce'],
          ['CBU 2020 Kinney-Graham column', '5 values', 'all 5 to 5e-4'],
        ]}
      />
      <Para>
        Second routes check the closed forms: a 400 x 400 Gauss-Legendre integration over the visible flame surface for
        the view factor, an isentropic nozzle maximised over the throat pressure for the gas release, and the plume&apos;s
        mass flux integral for the ground reflection. Negative controls plant 48 defects one at a time; every engine
        and oracle plant turns the gate red. Three items rest on a single transcription with no public worked number to
        anchor them: Mackay and Matsugu, Bagster and Burgess. The Studio&apos;s own tests run the Yellow Book pool fire and
        the Purple Book CO case through the studio&apos;s import path.
      </Para>
    </GuideSection>

    <GuideSection id="sources">
      <SectionHeading icon={Library}>Sources</SectionHeading>
      <Table
        headers={['Key', 'Document']}
        rows={[
          ['YB', 'TNO Yellow Book, Methods for the calculation of physical effects, CPR 14E, 3rd ed., 2nd revised print (2005)'],
          ['PB', 'TNO Purple Book, Guidelines for quantitative risk assessment, CPR 18E (1999)'],
          ['OSD/30', 'UK HSE SPC/Tech/OSD/30, Indicative human vulnerability to the hazardous agents present offshore'],
          ['ALOHA', 'NOAA Technical Memorandum NOS OR&R 43, ALOHA Technical Documentation (2013)'],
          ['KG', 'Kinney and Graham (1985), Explosive Shocks in Air, 2nd ed., as printed by Guzas and Earls (2010), Steel and Composite Structures 10(5) eq. 5'],
          ['CCOHS', 'CCOHS OSH Answers, converting occupational exposure limits from mg/m3 to ppm'],
        ]}
      />
      <Para>
        Not obtained, so nothing here claims to reproduce them: Crowl and Louvar, the CCPS CPQRA guidelines, the TNO Green
        Book, Kinney and Graham&apos;s book itself, UFC 3-340-02 and Kingery and Bulmash ARBRL-TR-02555.
      </Para>
    </GuideSection>
  </HelpGuideShell>
);

export default ConsequenceModellingStudioHelpGuide;
