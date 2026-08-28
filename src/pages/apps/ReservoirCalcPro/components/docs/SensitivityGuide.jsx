import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Formula, Note, Table } from './DocParts';

const SensitivityGuide = () => (
  <Article
    title="Sensitivity, Tornado and Distribution Charts"
    lead="How the tornado is actually computed from the Monte Carlo realisations, what the histogram and expectation curve show, and how to read all three without over-reading them."
  >
    <H2>1. The tornado is conditional, and it uses no extra simulation</H2>
    <P>
      A conventional tornado is built by one factor at a time re-simulation: freeze every input at its
      base value, swing one input to its low and its high, record the output, repeat. This app does
      something different. It reuses the realisations the run already produced.
    </P>
    <P>
      For each sampled parameter, the engine sorts the realisations by that parameter&apos;s value,
      takes the bottom decile and the top decile, and reports the median output volume in each group.
      The bar spans those two conditional medians, centred on the overall P50 of the run.
    </P>
    <Formula>
      base = median( targetVol over all realisations )
    </Formula>
    <Formula>
      k = max(15, floor(n x 0.1))          n = number of valid realisations
    </Formula>
    <Formula>
      sortedByParam = realisations sorted ascending by inputs[param]
      lowInputVol   = median( targetVol of the first k )
      highInputVol  = median( targetVol of the last k )
    </Formula>
    <Formula>
      low  = min(lowInputVol, highInputVol)
      high = max(lowInputVol, highInputVol)
    </Formula>
    <P>
      Bars are sorted by swing width, widest first, which is what gives the chart its tornado shape.
      The engine keeps <Code>lowInputVol</Code> and <Code>highInputVol</Code> separately from
      <Code>low</Code> and <Code>high</Code> so the direction of the relationship survives the sort.
      For water saturation the low input decile produces the high volume, and that inversion is
      recorded rather than lost.
    </P>
    <Note tone="success" title="Why conditional deciles are the honest measure here">
      The realisations were drawn through a Gaussian copula with a porosity to water saturation
      correlation of -0.8 built in. One factor at a time re-simulation would break that structure: it
      would ask what happens when porosity goes high while Sw stays at its base value, which is a rock
      the sampler never drew and the reservoir does not contain. Conditioning on deciles of the actual
      sample keeps every correlation exactly as it was sampled, including any correlation you added
      yourself. It also costs nothing, because the realisations already exist.
    </Note>
    <H3>Guards</H3>
    <UL>
      <li>Fewer than 30 realisations returns no tornado at all.</li>
      <li>
        A parameter whose sampled series contains a non-finite value, or whose standard deviation is
        zero, is skipped. That is how constants such as a fixed net to gross drop off the chart
        automatically.
      </li>
      <li>
        The decile group size is floored at 15 realisations, so a small run still has a stable median
        in each tail group.
      </li>
    </UL>

    <H2>2. Reading the chart</H2>
    <P>
      The tornado is drawn as a self contained SVG rather than through a charting runtime, so it
      captures crisply into the slide PNG and the PDF report.
    </P>
    <Table
      headers={['Element', 'Meaning']}
      rows={[
        ['Dashed vertical axis', 'The overall P50 of the run, labelled with its value and unit at the top of the chart.'],
        ['Blue segment (#2563eb)', 'The part of the bar that falls below the P50.'],
        ['Emerald segment (#059669)', 'The part of the bar that falls above the P50.'],
        ['Bar ends', 'The conditional median volume when the parameter sits in its bottom decile and in its top decile, printed as numbers just outside each end.'],
        ['Parameter label', 'Left column, sorted widest swing at the top.'],
        ['NN% var annotation', 'The variance share for that parameter from the Pearson decomposition, shown under the label when the row is at least 26 pixels tall.'],
        ['Axis extent labels', 'Minimum and maximum of the plotted range along the bottom, with the volume unit in the centre.'],
      ]}
    />
    <P>
      Colour is never the only carrier of meaning. Which side of the dashed P50 axis a segment sits on
      says the same thing as its colour, so the chart survives greyscale printing and colour vision
      deficiency.
    </P>
    <P>
      Parameter labels come from the sampled input keys, so porosity appears as Porosity from the
      internal key <Code>phi</Code>, Bo from <Code>fvf</Code>, Bg from <Code>bg</Code>, and a
      structural run shows OWC, GOC and GRV Factor where an analytic run shows Area and Thickness.
    </P>

    <H2>3. The variance share annotation</H2>
    <P>
      The percentage under each parameter label comes from a separate calculation, a Pearson variance
      decomposition over the same realisations.
    </P>
    <OL>
      <li>For each sampled parameter, compute the Pearson correlation r between its sampled series and the target volume.</li>
      <li>Square it to get r squared, the share of output variance that parameter explains linearly.</li>
      <li>Normalise all the r squared values so they sum to 100 percent.</li>
      <li>Record the sign of r as the impact direction.</li>
    </OL>
    <Formula>
      contribution[i] = 100 x r2[i] / SUM over all parameters of r2
    </Formula>
    <P>
      The bar width and the percentage are measuring related things by different routes. The bar is a
      conditional median swing and makes no linearity assumption. The percentage is a linear variance
      share. They usually rank parameters the same way. When they disagree, trust the bar, because the
      volumetric response to a contact depth is distinctly nonlinear.
    </P>
    <Note tone="warn" title="Normalisation makes the percentages relative">
      The shares are normalised to sum to 100 across whatever parameters this run sampled. Removing a
      parameter from the study inflates everyone else&apos;s share without anything physical having
      changed. Compare shares within one run rather than across runs with different parameter sets.
    </Note>

    <H2>4. The legacy fallback</H2>
    <P>
      The conditional tornado needs the raw per realisation samples. Results saved before that array
      was stored contain only the variance decomposition, so those cases fall back to a different
      chart: horizontal bars on a 0 to 100 percent axis showing each parameter&apos;s variance share,
      coloured emerald where the impact direction is positive and red where it is negative, with a
      tooltip reading &quot;increases volume&quot; or &quot;decreases volume&quot;.
    </P>
    <P>
      If you open an old project and see percentage bars instead of a P50 centred tornado, that is
      what happened. Rerun the simulation to get the conditional version. When neither is available
      the panel shows &quot;Add at least one uncertainty variable to see sensitivity&quot;, which means
      no parameter in the run carried spread.
    </P>

    <H2>5. The histogram</H2>
    <P>
      The Volume Distribution chart bins the raw realisations of the target volume into 30 equal width
      bins spanning the sample minimum to the sample maximum. Values are scaled for display first,
      dividing by 1e6 for oil volumes and 1e9 for gas volumes, so the axis reads in MMstb, Bscf or
      MMsm3. Bin centres are plotted, and the top bin absorbs the maximum value so nothing falls off
      the end.
    </P>
    <P>
      Dashed reference lines mark P90, P50 and P10. The P50 line is emerald and the two tail lines are
      grey, which reinforces which one is the central estimate.
    </P>
    <H3>What to look for</H3>
    <UL>
      <li>
        A right skewed shape with a long high side tail is normal and expected. A product of several
        positive uncertain quantities is approximately lognormal, which is why the mean sits above the
        P50.
      </li>
      <li>
        A spike at one end usually means clamping. Porosity, Sw and NTG are forced into the range 0 to
        1 on every realisation, so a distribution that reaches past those limits piles mass at the
        boundary.
      </li>
      <li>
        A ragged, multi-peaked histogram at 10,000 iterations usually means one input distribution is
        so wide that it dominates and imprints its own shape on the output.
      </li>
      <li>
        A hard vertical edge in a structural run often means the sampled contact is hitting the spill
        point or the crest, so a whole range of contact draws returns the same GRV.
      </li>
    </UL>

    <H2>6. The cumulative expectation curve</H2>
    <P>
      The Cumulative Probability chart plots the empirical cumulative distribution of the same
      realisations. It is built from roughly 100 evenly spaced points along the sorted sample plus the
      endpoint, with the x axis in display volume units and the y axis as cumulative percent from 0 to
      100. Horizontal reference lines sit at 90, 50 and 10 percent.
    </P>
    <Note tone="danger" title="Read the axis in the statistical direction, then name the case in the petroleum direction">
      The y axis is a plain cumulative percentage, so 10 percent means 10 percent of realisations fall
      at or below that volume. That point is the P90 case in petroleum naming, because 90 percent of
      realisations exceed it. The reference lines are drawn at 90, 50 and 10 on the cumulative axis,
      so the low case is where the curve crosses the 10 percent line, and the high case is where it
      crosses the 90 percent line.
    </Note>
    <P>
      The expectation curve is the chart to use when someone asks a question the three percentile
      cards cannot answer, such as the probability of exceeding a commercial threshold. Find the
      threshold volume on the x axis, read the cumulative percent, and subtract from 100.
    </P>

    <H2>7. Practical reading guidance</H2>
    <H3>A wide bar</H3>
    <P>
      A wide bar means that moving that parameter from its low decile to its high decile moves the
      median outcome a long way. That is the parameter worth spending money on: another well, a better
      depth conversion, a core programme. Bar width is expressed directly in volume units, so you can
      compare it against the cost of reducing that uncertainty.
    </P>
    <H3>Why a parameter with a narrow input range can still dominate</H3>
    <P>
      The tornado ranks parameters by how much the output moves, and the output responds to each input
      with its own gearing. Three things combine.
    </P>
    <UL>
      <li>
        <strong>Multiplicative structure.</strong> Volume is a product. A plus or minus 20 percent
        swing on porosity moves volume by plus or minus 20 percent, regardless of how small the
        absolute porosity range looks.
      </li>
      <li>
        <strong>The saturation term.</strong> Sw enters as (1 - Sw). At Sw of 0.6, moving Sw by 0.05
        changes the hydrocarbon fraction from 0.40 to 0.35, which is a 12.5 percent swing in volume
        from a 5 saturation unit change.
      </li>
      <li>
        <strong>Structural gearing.</strong> A contact moving 50 ft over a broad, low relief structure
        sweeps an enormous area and can dominate everything else. The same 50 ft on a steep, narrow
        structure barely registers. This is why contacts get an additive spread rather than a
        percentage one.
      </li>
    </UL>
    <P>
      The corollary matters just as much. A parameter you assigned a wide range to, that shows a
      narrow bar, has little influence on the answer, and refining it further is wasted effort.
    </P>
    <H3>The limits of decile conditioning</H3>
    <UL>
      <li>
        <strong>The bar ends are not the input extremes.</strong> They are conditional medians over the
        outer tenth of the draws, so they sit inside the full range of outcomes. The tornado is
        deliberately narrower than the histogram. Never read a bar end as a P90 or P10 volume.
      </li>
      <li>
        <strong>Correlated parameters share credit.</strong> Porosity and Sw are correlated at -0.8 by
        default, so the porosity bar already includes the Sw movement that came with it. Their bars
        cannot be added together, and neither can two of your own correlated inputs.
      </li>
      <li>
        <strong>Non-monotonic responses are flattened.</strong> If an input moves the volume up and
        then back down, the two decile medians can land close together and the bar will look short
        even though the parameter matters. Check the histogram for multiple modes when a bar looks
        suspiciously narrow.
      </li>
      <li>
        <strong>Small runs mean noisy deciles.</strong> At 1,000 iterations each decile group is 100
        realisations, and rerunning will visibly shuffle bars of similar width. Run 10,000 or more
        before treating a ranking as a decision input.
      </li>
      <li>
        <strong>Only sampled inputs appear.</strong> Anything held constant contributes nothing to the
        chart by construction, and that includes a real uncertainty you forgot to give a distribution.
        The absence of a bar is not evidence that a parameter does not matter.
      </li>
      <li>
        <strong>Truncation rejection reshapes the sample.</strong> A run with a high rejection rate has
        a truncated sample whose deciles no longer represent the distributions you specified, so fix
        the rejection warning before reading the tornado.
      </li>
    </UL>

    <H2>8. Exports</H2>
    <P>
      All three charts are captured for the PDF report at 2x scale on a white background. The tornado
      is plain SVG, so it embeds at full resolution rather than being rasterised from a canvas. The
      report templates are selected next to the Export PDF control, and the realisation tracker cards
      for the P90, P50 and P10 cases travel with the technical template so a reader can see which
      input combination produced each headline number.
    </P>
  </Article>
);

export default SensitivityGuide;
