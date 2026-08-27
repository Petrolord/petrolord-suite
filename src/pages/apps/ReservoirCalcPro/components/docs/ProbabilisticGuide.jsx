import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Formula, Note, Table } from './DocParts';

const ProbabilisticGuide = () => (
  <Article
    title="Probabilistic Analysis (Monte Carlo)"
    lead="The three step wizard, the distributions behind it, the Gaussian copula that correlates them, and exactly which parameters are treated as uncertain in each input method."
  >
    <H2>1. The wizard</H2>
    <OL>
      <li>
        <strong>Distributions.</strong> Pick a shape and its parameters for each uncertain input. Each
        card shows the deterministic base value and offers a revert control that snaps the central
        value back onto it.
      </li>
      <li>
        <strong>Settings.</strong> Base case consistency mode and the iteration count.
      </li>
      <li>
        <strong>Simulation.</strong> Run the study. The run is asynchronous and reports progress at
        completion.
      </li>
    </OL>
    <P>
      The panel is bound to the deterministic base case. The linked base volume shown in the header is
      GIIP for a gas or oil plus gas case and STOOIP otherwise, displayed in millions.
    </P>

    <H2>2. Which parameters are uncertain</H2>
    <Note tone="danger" title="This depends on the input method, and it is the single most important thing on this page">
      The analytic method samples area and thickness. The structural methods do not. Under Hybrid or
      Surfaces, area and thickness are consequences of the mapped structure, so sampling them
      independently would double count geometry that the surface already fixes. The geometric
      uncertainty moves into the contact depths plus a GRV factor.
    </Note>
    <Table
      headers={['Input method', 'Parameters the engine may sample', 'GRV comes from']}
      rows={[
        ['Simple (analytic)', 'area, thickness, porosity, sw, fvf, bg, ntg', 'grv = area x thickness, sampled directly'],
        ['Hybrid or Surfaces (structural)', 'owc, goc, grvFactor, porosity, sw, fvf, bg, ntg', 'Hypsometric lookup against the sampled contacts, scaled by grvFactor'],
      ]}
    />
    <P>
      A parameter is only sampled when its distribution carries genuine spread. Triangular and uniform
      qualify when max is strictly greater than min. Normal and lognormal qualify when the standard
      deviation is strictly greater than zero. Everything else resolves to a single representative
      value: the mode for triangular, the midpoint for uniform, the mean for normal and lognormal, and
      the stated value for a constant.
    </P>
    <P>
      Net to gross is submitted by the panel as a constant taken from the base case, so it appears in
      the parameter list without contributing spread unless a caller supplies a distribution for it
      directly.
    </P>
    <P>
      Which cards appear also depends on fluid type. Bo appears for oil and for oil plus gas. Bg
      appears for gas and for oil plus gas. Under a structural method the GOC card appears only for
      oil plus gas, and the single contact card is labelled Gas Water Contact for a gas case and Oil
      Water Contact otherwise.
    </P>

    <H2>3. The four distributions</H2>
    <Table
      headers={['Type', 'Entered as', 'Sampled by', 'Notes']}
      rows={[
        ['Triangular', 'P90 (Min), P50 (Mode), P10 (Max)', 'Triangular inverse CDF', 'The three fields are the low, most likely and high values of the triangle. They are not fitted percentiles.'],
        ['Normal', 'Mean, Std Dev', 'mean + stdDev x x', 'Unbounded unless you supply truncation limits.'],
        ['Lognormal', 'Mean, Std Dev', 'exp(mu + sigma x x)', 'Parameterised by the arithmetic mean and standard deviation of the variable itself, converted internally.'],
        ['Uniform', 'Min, Max', 'min + Phi(x) x (max - min)', 'Flat across the interval.'],
      ]}
    />
    <Note tone="warn" title="Read the triangular labels carefully">
      The three triangular fields are labelled P90, P50 and P10 in the interface, and what the engine
      receives is a minimum, a mode and a maximum. The panel sorts the two outer values before
      submitting, so entering them in either order still yields a valid triangle. A true P90 of a
      triangular distribution sits inside the minimum, so treat the labels as a naming convention for
      the low, best and high estimates.
    </Note>
    <H3>Lognormal parameter conversion</H3>
    <P>
      Given an arithmetic mean m and standard deviation s of the variable, the underlying normal
      parameters are recovered as follows, which is the standard method of moments inversion.
    </P>
    <Formula>
      mu    = ln( m^2 / sqrt(m^2 + s^2) )
      sigma = sqrt( ln( 1 + s^2 / m^2 ) )
      value = exp( mu + sigma x x )
    </Formula>
    <H3>Triangular inverse CDF</H3>
    <Formula>
      if u &lt;= (c - a) / (b - a):   value = a + sqrt( u x (b - a) x (c - a) )
      otherwise:                  value = b - sqrt( (1 - u) x (b - a) x (b - c) )
    </Formula>
    <P>
      Here a is the minimum, c the mode and b the maximum. The standard normal CDF uses the
      Abramowitz and Stegun 7.1.26 error function approximation, with a maximum absolute error of
      1.5e-7, which is far below Monte Carlo sampling noise at any iteration count offered here.
    </P>

    <H2>4. Correlation through a Gaussian copula</H2>
    <P>
      Sampling each marginal independently would produce realisations where a 32 percent porosity sits
      next to a 55 percent water saturation, which no rock does. The engine correlates the draws
      before pushing them through their marginals.
    </P>
    <OL>
      <li>Build a correlation matrix C over the varying parameters, identity to start.</li>
      <li>Write the correlation entries into C, symmetric on both sides of the diagonal.</li>
      <li>Take the Cholesky factor L so that L times its transpose equals C.</li>
      <li>Per realisation, draw independent standard normals Z by Box Muller.</li>
      <li>Form the correlated normals X = L Z.</li>
      <li>Push each element of X through its own marginal.</li>
    </OL>
    <Formula>
      X[r] = SUM over c &lt;= r of  L[r][c] x Z[c]
    </Formula>
    <P>
      For normal and lognormal marginals X is already the standard normal quantile, so no inverse
      normal step is needed. For triangular and uniform marginals the value is pushed through the
      standard normal CDF first to get a uniform variate, then through the marginal inverse CDF. That
      pair of steps is the copula.
    </P>
    <Note tone="info" title="The built-in porosity to Sw correlation">
      Every run applies a correlation of <Code>-0.8</Code> between porosity and water saturation
      automatically, in both input methods, whenever both carry spread. Tighter rock holds more
      irreducible water, so a high porosity draw arrives with a low Sw draw. Caller supplied
      correlations are applied on top, and each is accepted only when the coefficient is finite and
      strictly between -1 and 1.
    </Note>
    <P>
      The Cholesky routine clamps the diagonal at zero, so a correlation set that is slightly outside
      positive definite degrades gracefully instead of producing NaN volumes. The trade is that the
      realised correlation structure will not match the requested one exactly in that case, so keep
      requested correlations physically consistent.
    </P>

    <H2>5. Truncation by rejection</H2>
    <P>
      Normal and lognormal marginals are unbounded, which will eventually draw a negative porosity or
      an absurd Bo. Supplying a finite min or max on those two shapes turns on truncation.
    </P>
    <P>
      Truncation is enforced by rejection of the entire realisation. If any one truncated parameter
      falls outside its bounds, the whole draw is discarded and no volume is recorded, which preserves
      the correlation structure across the surviving sample. The first ten out of bounds events are
      recorded in the diagnostics with the iteration index, the parameter key, the value and the
      bounds.
    </P>
    <Note tone="warn" title="The 5 percent rejection warning">
      After the loop, the rejection rate is computed against the requested iteration count. Above 5
      percent the engine warns: &quot;High rejection rate: NN.NN% of samples exceeded truncation
      bounds.&quot; A high rate means the marginal you specified disagrees with the bounds you
      imposed, and the surviving sample is a truncated distribution whose mean and P50 have both moved
      away from the numbers you typed. Widen the bounds or narrow the standard deviation.
    </Note>
    <P>
      Triangular and uniform marginals are bounded by construction and are never rejected.
    </P>

    <H2>6. Physical clamping</H2>
    <P>
      Three quantities are clamped into the range 0 to 1 on every surviving realisation, after
      sampling and before use: porosity, water saturation and net to gross. This prevents a negative
      hydrocarbon pore volume from a wide distribution tail. Fallback values when a resolved parameter
      is not finite are 1.0 for NTG, 0.20 for porosity, 0.30 for Sw, 1.2 for Bo, 0.005 for Bg, 1000
      for area and 50 for thickness.
    </P>
    <Note tone="warn" title="Clamping is a guard rather than a model">
      A distribution that clamps often is piling probability mass at 0 or 1, which distorts the
      histogram and flattens the sensitivity of that parameter. If the P10 realisation reports a
      porosity of exactly 1.000 or a Sw of exactly 0.000, narrow the distribution rather than
      accepting the result.
    </Note>

    <H2>7. Default distribution spreads</H2>
    <P>
      The panel seeds every card from the deterministic base case. Three seeding rules are used.
    </P>
    <Table
      headers={['Parameter class', 'Rule', 'Triangular seed', 'Normal seed']}
      rows={[
        ['Generic (porosity, Sw, area, thickness, Bo, Bg)', 'Multiplicative, plus or minus 20 percent', 'P90 = 0.8 v, P50 = v, P10 = 1.2 v', 'mean = v, stdDev = 0.1 v'],
        ['Contacts (OWC, GOC)', 'Additive, plus or minus 50 ft in field units or 15 m in metric', 'P90 = v - spread, P50 = v, P10 = v + spread', 'mean = v, stdDev = spread / 2'],
        ['GRV factor', 'Fixed structural multiplier', 'P90 = 0.85, P50 = 1.0, P10 = 1.15', 'mean = 1.0, stdDev = 0.1'],
      ]}
    />
    <Note tone="info" title="Why contacts get an additive spread">
      A percentage spread on a large depth is meaningless. Twenty percent of an OWC at 8,000 ft below
      datum is 1,600 ft of contact uncertainty, which would put the contact above the crest on one
      side and below the spill point on the other. Contact uncertainty is a seismic depth conversion
      and well pick question, and it is naturally expressed in feet or metres. The default of plus or
      minus 50 ft, or 15 m in metric, is a starting point that you should replace with your own depth
      conversion uncertainty.
    </Note>
    <P>
      The GRV factor is a direct multiplier on both zone volumes, floored at zero, that carries the
      structural uncertainty the contacts do not: map gridding choices, depth conversion of the
      surface itself, and interpretation of the closure. It defaults to a mild plus or minus 15
      percent around unity.
    </P>
    <P>
      Uniform seeds use the same plus or minus 20 percent bracket for generic parameters and the same
      additive bracket for contacts. When the unit system is toggled, the geometric distributions are
      rescaled by the same conversion the deterministic inputs use, so area moves between acres and
      km2 and thickness and contacts move between ft and m. Fractions and formation volume factors
      scale by 1.
    </P>

    <H2>8. Base case consistency mode</H2>
    <P>
      Consistency mode is on by default. It does two things.
    </P>
    <UL>
      <li>
        It recentres distributions on the deterministic base case. Whenever the base case changes, the
        central fields of every card are rewritten to the matching base input, both the triangular P50
        and the normal mean.
      </li>
      <li>
        It flags drift. A central value more than 5 percent away from the base value turns the field
        red and shows an inline warning on the card.
      </li>
    </UL>
    <P>
      The central value used for that comparison is the midpoint for a uniform distribution, the mean
      for normal and lognormal, and the P50 field for triangular.
    </P>
    <Note tone="success" title="Consistency mode never blocks a run">
      If any card is off centre when you press Run, the app shows a heads up toast saying some central
      values differ by more than 5 percent from the deterministic base case, and it runs anyway. A
      deliberately shifted distribution is a legitimate choice, for instance when the deterministic
      case was built on a conservative pick. The flag exists so the shift is a decision you made
      rather than one you inherited.
    </Note>
    <P>
      Switch consistency mode off when you want the distributions to stay exactly where you put them
      while you iterate on the deterministic case. The GRV factor card is always exempt from the
      check, because its natural centre is 1.0 rather than any base case input.
    </P>

    <H2>9. Iterations</H2>
    <P>
      Four choices are offered: 1,000, 5,000, 10,000 and 50,000. The default is 10,000. The engine
      floors whatever it receives at 100.
    </P>
    <P>
      More iterations buy smoother tails. The P50 stabilises quickly, and P90 and P10 are estimated
      from the tenth and ninetieth percentile of the sorted sample, so they need the sample size. At
      1,000 iterations each tail percentile rests on a neighbourhood of roughly a hundred realisations
      and will visibly move between reruns. At 10,000 it is stable to a couple of percent for a
      typical volumetric spread. Use 50,000 when you are reporting tail numbers or when the tornado
      deciles look noisy.
    </P>

    <H2>10. The realisation loop</H2>
    <H3>Analytic mode</H3>
    <Formula>
      grv  = area x thickness
      hcpv = grv x ntg x phi x (1 - sw)
    </Formula>
    <Formula>
      Field:  STOOIP = hcpv x fracOil x 7758 / Bo      GIIP = hcpv x fracGas x 43560 / Bg
      Metric: STOOIP = hcpv x fracOil x 1e6 / Bo       GIIP = hcpv x fracGas x 1e6 / Bg
    </Formula>
    <P>
      The metric factor of 1e6 appears here because the analytic GRV is left as km2 times m, so the
      conversion to cubic metres happens at the same point as the field constants. The zone fractions
      come from the gas cap fraction: a gas case is fracOil 0 and fracGas 1, an oil case is fracOil 1
      and fracGas 0, and oil plus gas with a valid fraction splits accordingly. Oil plus gas with no
      gas cap fraction warns and runs as undersaturated oil with GIIP zero.
    </P>
    <H3>Structural mode</H3>
    <Formula>
      { '{ grvOil, grvGas } = hypsometry.zoneVolumes(fluidType, owc_sampled, goc_sampled)' }
    </Formula>
    <Formula>
      gOil = grvOil x grvFactor        gGas = grvGas x grvFactor
      hcpvOil = gOil x ntg x phi x (1 - sw)
      hcpvGas = gGas x ntg x phi x (1 - sw)
    </Formula>
    <Formula>
      Field:  STOOIP = hcpvOil x 7758 / Bo       GIIP = hcpvGas x 43560 / Bg
      Metric: STOOIP = hcpvOil / Bo              GIIP = hcpvGas / Bg
    </Formula>
    <P>
      No metric 1e6 appears in the structural branch because the hypsometric volumes are already in
      acre-ft or cubic metres. Contacts that were not sampled fall back to the deterministic contact
      values carried in the run configuration.
    </P>
    <H3>The hypsometric shortcut</H3>
    <P>
      Before the loop starts, the app builds the integration grid once and precomputes a cumulative
      area against depth table over 1,024 depth levels between the shallowest top and the deepest
      base. Each realisation then evaluates a zone volume by interpolating that table, which is a
      constant time lookup rather than a fresh integration over tens of thousands of cells. That is
      what makes 50,000 structural realisations practical. The table is built with the same
      resolution, the same interpolation method, the same hull mask and the same AOI clipping as the
      deterministic structural run, so the two are integrating identical rock.
    </P>

    <H2>11. Outputs</H2>
    <P>
      The target volume recorded per realisation is GIIP for a pure gas case and STOOIP otherwise.
      Statistics are computed for both stooip and giip regardless, so an oil plus gas study reports
      both.
    </P>
    <Table
      headers={['Statistic', 'Definition']}
      rows={[
        ['p90', 'Value at the 10th percentile of the sorted realisations. The low case.'],
        ['p50', 'Value at the 50th percentile. The central case.'],
        ['p10', 'Value at the 90th percentile. The high case.'],
        ['mean', 'Arithmetic mean of the realisations. Sits above the P50 for a right skewed volumetric distribution.'],
        ['min, max', 'Extremes of the surviving sample.'],
        ['stdDev', 'Standard deviation of the realisations.'],
        ['cdf', 'Roughly 100 points along the cumulative curve, plus the endpoint.'],
        ['iterations', 'The requested iteration count.'],
        ['validCount', 'Realisations that survived truncation rejection.'],
        ['baseCaseValue', 'The linked deterministic volume, for the comparison banner.'],
      ]}
    />
    <Note tone="danger" title="The petroleum percentile convention">
      P90 is the low case and P10 is the high case. This is the reverse of the statistical reading of
      the same symbols. P90 means there is a 90 percent chance of at least this much volume, so it
      sits at the 10th percentile of the sorted values. Every chart, table and export in this app uses
      the petroleum convention consistently.
    </Note>
    <H3>Realisation tracking</H3>
    <P>
      The realisations are sorted by target volume and three of them are kept whole: the one at index
      floor(0.1 n) as the P90 case, floor(0.5 n) as the P50 case and floor(0.9 n) as the P10 case.
      Each carries the full input vector that produced it, which the Realization Tracker panel
      displays. This tells you what combination of porosity, saturation, contacts and PVT actually
      delivers your low case, which is the number that ends up on a reserves statement.
    </P>
    <H3>Diagnostics</H3>
    <UL>
      <li><Code>rejectedCount</Code> and the derived rejection rate.</li>
      <li><Code>outOfBounds</Code>, the first ten truncation events with values and bounds.</li>
      <li>
        A double counting warning when both pore volume and porosity are active uncertainties, since
        one contains the other.
      </li>
      <li>
        &quot;No valid realizations were generated, check distribution bounds&quot; when the surviving
        sample is empty. That is almost always truncation bounds that exclude the bulk of the
        marginal.
      </li>
    </UL>

    <H2>12. Reading the base case comparison</H2>
    <P>
      The results view reports how far the Monte Carlo P50 sits from the deterministic base case, and
      highlights the banner in amber past 40 percent. A gap is expected. The P50 of a product of
      distributions rarely equals the product of the base case inputs, because the product of several
      right skewed variables is itself skewed and its median moves away from the deterministic
      combination. A gap past 40 percent is worth investigating as a sign of off centre input
      distributions.
    </P>
  </Article>
);

export default ProbabilisticGuide;
