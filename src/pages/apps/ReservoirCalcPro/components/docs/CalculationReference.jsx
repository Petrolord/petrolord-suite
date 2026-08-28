import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Formula, Note, Table } from './DocParts';

const CalculationReference = () => (
  <Article
    title="Calculation Reference (Deterministic Analytic Path)"
    lead="Exactly what the Simple input method computes, term by term, in both unit systems. Every formula on this page is the code in VolumeCalculationEngine.calculateDeterministic."
  >
    <Note tone="info" title="Scope of this article">
      This page documents the analytic path only, which is the method selected as <Code>Simple</Code>.
      The Hybrid and Surfaces methods hand the whole calculation to a different engine that integrates
      gross rock volume cell by cell against the fluid contacts. That engine is described in the
      Contact Volumetrics guide. Monte Carlo is described in the Probabilistic guide.
    </Note>

    <H2>1. Gross rock volume</H2>
    <P>
      The analytic path multiplies a map area by a gross thickness. There is no structural geometry
      and no depth reference, so the result is a prism volume in whichever unit pair the active unit
      system uses.
    </P>
    <Formula>
      Field:  GRV [acre-ft] = area [acres] x thickness [ft]
    </Formula>
    <Formula>
      Metric: GRV [m3] = area [km2] x 1,000,000 [m2 per km2] x thickness [m]
    </Formula>
    <P>
      The metric factor of 1e6 converts km2 to m2 so that the product with a thickness in metres is a
      volume in cubic metres. Field units carry the acre-ft as a compound unit and defer the
      conversion to the in-place constants in step 4.
    </P>
    <P>
      Inputs are read with <Code>parseFloat</Code> and fall back to defaults when blank or
      unparseable: area 0, thickness 0, NTG 1.0, porosity 0.2, Sw 0.3, Bo 1.2, Bg 0.005,
      oil recovery 0 percent, gas recovery 0 percent.
    </P>

    <H2>2. Splitting GRV by fluid type</H2>
    <P>
      Before any pore volume arithmetic the engine divides the gross rock volume between an oil zone
      and a gas zone. This split is what stops oil and gas drawing on the same pore volume.
    </P>
    <Table
      headers={['fluidType', 'grvGas', 'grvOil', 'Behaviour']}
      rows={[
        ['gas', 'GRV', '0', 'The whole volume is the gas accumulation.'],
        ['oil', '0', 'GRV', 'The whole volume is the oil leg.'],
        ['oil_gas with a valid gasCapFraction', 'GRV x gasCapFraction', 'GRV minus grvGas', 'Explicit two zone split.'],
        ['oil_gas with no gasCapFraction', '0', 'GRV', 'Degrades to undersaturated oil and raises a warning.'],
      ]}
    />
    <P>
      A gas cap fraction counts as valid when it parses to a number strictly greater than 0 and
      strictly less than 1. Anything else, including a blank field, triggers the degradation path.
    </P>
    <Note tone="warn" title="Undersaturated oil degradation">
      When Oil plus Gas is selected and no gas cap fraction is set, the engine returns this warning
      verbatim: &quot;Oil+gas is selected but no gas-cap fraction is set, so the case is modelled as
      undersaturated oil with no free-gas cap. Set a gas-cap fraction of GRV, or use a structural
      method with a GOC, for a rigorous split.&quot; GIIP is zero in that case because grvGas is zero.
    </Note>

    <H2>3. Net, pore and hydrocarbon pore volume</H2>
    <P>
      Net volume and total pore volume are reported for the whole prism, so they use the full GRV.
      Hydrocarbon pore volume is computed per zone from that zone&apos;s share of GRV.
    </P>
    <Formula>
      netVolume    = GRV x NTG
    </Formula>
    <Formula>
      poreVolume   = netVolume x porosity = GRV x NTG x porosity
    </Formula>
    <Formula>
      hcpvOil      = grvOil x NTG x porosity x (1 - Sw)
    </Formula>
    <Formula>
      hcpvGas      = grvGas x NTG x porosity x (1 - Sw)
    </Formula>
    <Formula>
      hcPoreVolume = hcpvOil + hcpvGas
    </Formula>
    <P>
      The term <Code>(1 - Sw)</Code> is stored internally as <Code>soi</Code>. One porosity, one NTG
      and one Sw are applied to both zones, which is the standard analytic simplification. If the gas
      cap has a genuinely different Sw from the oil leg, run the two zones as separate reservoirs.
    </P>

    <H2>4. In-place volumes and the field constants</H2>
    <P>
      Two constants appear in the field unit expressions, and they are different numbers doing the
      same job of turning an acre-ft of hydrocarbon pore volume into a surface volume.
    </P>
    <Formula>
      Field:  STOOIP [STB] = hcpvOil [acre-ft] x 7758 / Bo [rb/stb]
    </Formula>
    <Formula>
      Field:  GIIP   [scf] = hcpvGas [acre-ft] x 43560 / Bg [rcf/scf]
    </Formula>
    <Formula>
      Metric: STOOIP [sm3] = hcpvOil [m3] / Bo [rm3/sm3]
    </Formula>
    <Formula>
      Metric: GIIP   [sm3] = hcpvGas [m3] / Bg [rm3/sm3]
    </Formula>
    <H3>Where 43560 comes from</H3>
    <P>
      An acre is 43,560 ft2 by definition, so an acre-ft is 43,560 ft3. Gas surface volumes are quoted
      in standard cubic feet, so the acre-ft of gas filled pore space becomes reservoir cubic feet by
      multiplying by 43,560, and Bg in rcf/scf then divides reservoir cubic feet down to standard
      cubic feet. The same number is doing double duty as both the ft2 per acre conversion and the ft3
      per acre-ft conversion, because the extra foot of thickness passes through untouched.
    </P>
    <H3>Where 7758 comes from</H3>
    <P>
      Oil surface volumes are quoted in stock tank barrels rather than cubic feet. One barrel is
      5.614583 ft3, so an acre-ft holds 43,560 / 5.614583 = 7,758.4 bbl. The engine uses the
      conventional rounded 7758. Bo in rb/stb then divides reservoir barrels down to stock tank
      barrels.
    </P>
    <P>
      In the metric system both constants are 1 because hydrocarbon pore volume is already in cubic
      metres and both Bo and Bg are quoted in rm3/sm3. Only the formation volume factor divides.
    </P>
    <Note tone="danger" title="Divide by zero guards">
      Before dividing, the engine substitutes <Code>Bo = 1</Code> when the entered Bo is zero or
      negative, and <Code>Bg = 0.001</Code> when the entered Bg is zero or negative. Those substitutes
      keep the run alive so you can see the warning text, and the number they produce is meaningless.
      Fix the PVT input and rerun.
    </Note>

    <H2>5. Pure gas cases</H2>
    <P>
      When fluidType is <Code>gas</Code>, the headline volume slot is reused so that the primary
      result mirrors GIIP: <Code>stooip = giip</Code>, and the reported volume unit becomes scf in
      field units or sm3 in metric. STOOIP is not a separate oil number in that case, it is the same
      gas number surfaced under the primary field.
    </P>

    <H2>6. Recovery</H2>
    <P>
      Oil and gas are recovered independently at their own recovery factors, each entered as a
      percentage and divided by 100 internally.
    </P>
    <Formula>
      recoverableOil = STOOIP x (recovery / 100)      (zero for a pure gas case)
    </Formula>
    <Formula>
      recoverableGas = GIIP x (recoveryGas / 100)
    </Formula>
    <Formula>
      recoverable    = recoverableGas for a pure gas case, otherwise recoverableOil
    </Formula>
    <P>
      For an oil plus gas case both recoverable numbers are returned and the headline
      <Code>recoverable</Code> tracks the oil leg. Read <Code>recoverableGas</Code> for the gas cap.
    </P>

    <H2>7. What the engine returns</H2>
    <Table
      headers={['Field', 'Meaning']}
      rows={[
        ['stooip, giip', 'In-place volumes, per the formulas above.'],
        ['recoverable, recoverableOil, recoverableGas', 'Recovery applied per phase.'],
        ['grv, grvOil, grvGas, bulkVolume', 'Gross rock volume total and the two zone shares. bulkVolume mirrors grv.'],
        ['netVolume, poreVolume, poreVolumeRes', 'Whole prism net and pore volume. poreVolumeRes mirrors poreVolume.'],
        ['hcPoreVolume, hcPoreVolumeOil, hcPoreVolumeGas', 'Hydrocarbon pore volume total and per zone.'],
        ['hcArea', 'Echo of the entered area. The analytic path has no productive area calculation.'],
        ['volumeUnit, volUnit, resVolUnit, areaUnit', 'Display labels for the active unit system.'],
        ['inputs', 'Echo of the parsed parameters so results tables render the case that was actually run.'],
        ['warnings, qualityScore', 'Output of validateInputs plus any split warning from step 2.'],
      ]}
    />

    <H2>8. Input validation and the quality score</H2>
    <P>
      Every deterministic run, analytic or structural, calls <Code>validateInputs</Code> first. It
      starts from a score of 100, subtracts a penalty for each failed check, floors the result at 0
      and rounds. The score is advisory and never blocks a calculation.
    </P>
    <Table
      headers={['Check', 'Fails when', 'Penalty', 'Applies to']}
      rows={[
        ['Porosity range', 'porosity is not strictly between 0 and 1', '20', 'All fluid types'],
        ['Porosity plausibility', 'porosity is above 0.4', '10', 'All fluid types'],
        ['Water saturation range', 'Sw is outside 0 up to but excluding 1', '20', 'All fluid types'],
        ['Net to gross range', 'NTG is outside greater than 0 up to and including 1', '15', 'All fluid types'],
        ['Geometry', 'area or thickness is zero or negative', '25', 'All fluid types'],
        ['Oil FVF', 'Bo is below 1.0 rb/stb', '15', 'oil and oil_gas'],
        ['Gas FVF sign', 'Bg is zero or negative', '15', 'gas and oil_gas'],
        ['Gas FVF magnitude', 'Bg is above 0.1 rcf/scf', '10', 'gas and oil_gas'],
        ['Gas cap fraction', 'a value is present and lies outside 0 up to but excluding 1', '10', 'oil_gas'],
      ]}
    />
    <H3>The warning text you will see</H3>
    <UL>
      <li>Porosity should be a fraction between 0 and 1.</li>
      <li>Porosity above 40% is unusually high, so verify the input.</li>
      <li>Water saturation should be a fraction between 0 and 1, because Sw at or above 1 leaves no hydrocarbon pore volume.</li>
      <li>Net-to-gross should be a fraction between 0 and 1.</li>
      <li>Area and thickness must both be positive.</li>
      <li>Oil FVF (Bo) below 1.0 rb/stb is non-physical.</li>
      <li>Gas FVF (Bg) must be positive.</li>
      <li>Gas FVF above 0.1 rcf/scf is non-physical for most reservoirs. If your PVT report quotes Bg in rb/Mscf or rb/scf, select that unit so it converts correctly.</li>
      <li>Gas-cap fraction must be a fraction between 0 and 1 of GRV.</li>
    </UL>
    <Note tone="warn" title="The Bg magnitude check is the one that catches real mistakes">
      Typical Bg runs 0.002 to 0.05 rcf/scf. A number roughly a hundred times larger almost always
      means an rb/Mscf value was typed into a field expecting rcf/scf. The unit selector on the Bg
      field converts correctly once you pick the unit your PVT report uses.
    </Note>
    <P>
      The geometry check is worth one extra note. It penalises a non-positive area or thickness even
      on a structural run, where area and thickness are derived from the surface rather than typed.
      Treat that warning as noise in structural mode and read the structural diagnostics instead.
    </P>

    <H2>9. Worked example, field units</H2>
    <P>
      Area 2,000 acres, gross thickness 60 ft, NTG 0.75, porosity 0.22, Sw 0.28, Bo 1.28 rb/stb,
      oil recovery 35 percent, fluid type oil.
    </P>
    <OL>
      <li>GRV = 2000 x 60 = 120,000 acre-ft. All of it is oil, so grvOil = 120,000 acre-ft.</li>
      <li>netVolume = 120,000 x 0.75 = 90,000 acre-ft.</li>
      <li>poreVolume = 90,000 x 0.22 = 19,800 acre-ft.</li>
      <li>hcpvOil = 120,000 x 0.75 x 0.22 x (1 - 0.28) = 14,256 acre-ft.</li>
      <li>STOOIP = 14,256 x 7758 / 1.28 = 86,405,850 STB, which is 86.41 MMSTB.</li>
      <li>recoverableOil = 86,405,850 x 0.35 = 30,242,048 STB, which is 30.24 MMSTB.</li>
    </OL>

    <H2>10. Limits of the analytic path</H2>
    <UL>
      <li>
        Contacts are ignored. OWC and GOC are stored and echoed back in the results, and they change
        nothing in the arithmetic, because a prism has no depth reference to compare them against.
        Moving the OWC by 200 ft moves the analytic answer by zero.
      </li>
      <li>
        The area of interest polygon is ignored. It is passed through to the structural engine only.
      </li>
      <li>
        The gas cap fraction is a stand in for a GOC. It states what share of the gross rock volume
        sits above the contact, and it cannot know whether the structure actually holds that share at
        that depth.
      </li>
      <li>
        A domed top and a flat top of the same mean depth and same mapped area give the same answer
        here. They give different answers in the structural engine, which is the point of that engine.
      </li>
    </UL>
    <Note tone="success" title="When the analytic path is the right choice">
      Screening and ranking work where no mapped surface exists yet, sensitivity scoping against a
      published analogue, and any case where you want a number you can reproduce by hand on a
      calculator. As soon as a top structure map exists, switch to Hybrid or Surfaces so the contacts
      start earning their place in the answer.
    </Note>
  </Article>
);

export default CalculationReference;
