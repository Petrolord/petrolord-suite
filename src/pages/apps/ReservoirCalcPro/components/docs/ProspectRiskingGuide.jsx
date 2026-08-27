import React from 'react';
import { Article, H2, H3, P, UL, OL, Code, Formula, Note, Table } from './DocParts';

const ProspectRiskingGuide = () => (
  <Article
    title="Prospect Risking"
    lead="Prospect Risking puts a geological chance of success on top of the volumes RCP already computes, keeps an inventory of prospects in the database, and rolls the inventory up into portfolio expectations. It deliberately refuses to report a single risked P50, and this article explains why that refusal is correct."
  >
    <H2>Where it lives</H2>
    <P>
      Press <strong>Tools</strong> in the header to open the Workspace Tools panel, then choose the
      <strong> Prospect Risking</strong> tab. The panel has four parts stacked down the page: the chance of
      success sliders, the unrisked volume box, the live risked readout, and the inventory with its portfolio
      roll-up.
    </P>

    <H2>Chance of success</H2>
    <P>
      Four sliders set the four canonical geological risk factors. Each runs from 0 to 1 in steps of 0.05 and
      shows its value as a percentage. Geological chance of success is their product.
    </P>
    <Formula>Pg = trap x reservoir x charge x seal</Formula>
    <P>
      The engine also accepts an optional catch-all multiplier called <Code>other</Code>, for things like
      data quality or timing that do not belong in the four canonical factors.
    </P>
    <Formula>Pg = trap x reservoir x charge x seal x other</Formula>
    <UL>
      <li>Every factor is clamped into the range 0 to 1 before multiplying.</li>
      <li>
        A factor that is absent defaults to 1, meaning no risk from that element. An empty factor set gives
        Pg of 1.
      </li>
      <li>Any factor at 0 drives Pg to 0, which is what a fully condemned element should do.</li>
      <li>
        The <Code>other</Code> multiplier is supported by the engine and stored if present, and the panel has
        no slider for it in the current build. The four canonical sliders are what you can set here.
      </li>
    </UL>
    <P>
      The panel opens at trap 0.60, reservoir 0.70, charge 0.80, seal 0.70, which multiply to a Pg of 23.5
      percent and a probability of failure of 76.5 percent. Those defaults are a starting position rather
      than a recommendation. Move every one of them consciously.
    </P>

    <H3>Choosing factor values</H3>
    <P>
      Each factor is the probability that its element works, judged independently of the others. Judge the
      element, then read the number off, rather than picking a Pg you like and reverse engineering the
      factors to reach it.
    </P>
    <Table
      headers={['Factor', 'The question it answers', 'What pushes it down']}
      rows={[
        ['Trap', 'Is there a valid closure with sufficient relief at the target level?', 'Closure defined on a single line, poor imaging at the crest, dependence on a fault that may not seal, depth conversion uncertainty comparable to the relief.'],
        ['Reservoir', 'Is reservoir quality rock present at the target with useful porosity and permeability?', 'No penetration in the play, facies change away from the nearest well, diagenetic risk at depth, thin or discontinuous sands.'],
        ['Charge', 'Has a mature source rock generated and migrated hydrocarbons into this trap?', 'Unproven kitchen, no established migration route, timing of trap formation after peak generation, breached traps nearby.'],
        ['Seal', 'Is there a top seal and, where needed, a fault seal capable of holding the column?', 'Thin or absent regional seal, column height exceeding what the seal capacity supports, juxtaposition against reservoir across the bounding fault.'],
      ]}
    />
    <UL>
      <li>
        <strong>Anchor to outcomes.</strong> If your basin has drilled ten similar prospects and three
        worked, a Pg near 0.3 is your base rate. A prospect claiming 0.6 needs a stated reason why it beats
        the base rate.
      </li>
      <li>
        <strong>Do not double count.</strong> A weak seal argument should reduce the seal factor once. Also
        marking trap down for the same reason squares the penalty.
      </li>
      <li>
        <strong>Watch the product.</strong> Four apparently confident factors of 0.8 multiply to 0.41. Four
        of 0.9 give 0.66. The product punishes optimism spread across several elements, which is the point.
      </li>
      <li>
        <strong>Values above 0.9 need proof.</strong> Reserve them for elements demonstrated by penetration
        in the same trap or by a direct hydrocarbon indicator you trust.
      </li>
    </UL>

    <H2>Unrisked volume</H2>
    <P>
      The right-hand box holds the success-case volume distribution: mean, P90, P50 and P10. Its heading
      tells you which source it is on.
    </P>
    <UL>
      <li>
        <strong>From last run.</strong> When a Monte Carlo study has been run in this workspace, the panel
        seeds the four fields from it automatically, rounded to whole numbers. It searches the result for the
        first block carrying a finite mean and P50, trying STOOIP, then GIIP, then the oil block, then the
        gas block, then the flat result.
      </li>
      <li>
        <strong>Typed by hand.</strong> Any field can be overwritten, and with no Monte Carlo result present
        all four start empty and you type them. A deterministic case can be entered as a mean alone.
      </li>
    </UL>
    <P>
      Only the mean is required. The percentiles are carried through to the display and into the saved
      snapshot, and they play no part in Pg or in the risked mean. Clear the mean and the risked readout
      disappears and the Add button refuses to save.
    </P>
    <Note tone="warn" title="The panel records no unit">
      Nothing in this panel labels a unit. Whatever the seeded run was in, STB or standard cubic metres,
      barrels or millions of barrels, the inventory just stores numbers. Fix one unit basis for the whole
      inventory before you add the first prospect, and put it in the prospect name if there is any chance of
      ambiguity, because the portfolio roll-up will happily add barrels to cubic metres.
    </Note>

    <H2>Risked mean and success case, kept apart</H2>
    <P>
      For a prospect with unrisked mean volume V, the engine reports two things and never blends them.
    </P>
    <Formula>riskedMean = Pg x V</Formula>
    <Formula>successCase = the unrisked P90, P50, P10 and mean, unscaled</Formula>
    <P>
      The risked mean is the expected value across both outcomes, averaging the dry hole in at zero. It is
      the number that belongs in an expected monetary value calculation, and the panel labels it as the EMV
      basis. The success case is the volume distribution given that a discovery is made, which is the number
      that belongs in a development concept, a facilities sizing or a well count.
    </P>
    <P>
      A worked example. Take a prospect with the default factors, so Pg is 0.235, and a Monte Carlo result of
      P90 10, P50 25, P10 60, mean 30.
    </P>
    <Table
      headers={['Reported', 'Value', 'Use it for']}
      rows={[
        ['Pg', '23.5 percent', 'Ranking, portfolio expectations, drill or drop decisions'],
        ['P(failure)', '76.5 percent', 'The blunt statement of how likely a dry hole is'],
        ['Risked mean', '7.1', 'Expected monetary value, portfolio sums'],
        ['Success case P90 / P50 / P10', '10 / 25 / 60', 'Development planning if the well finds hydrocarbons'],
        ['Success case mean', '30', 'The unrisked expectation given discovery'],
      ]}
    />

    <H3>Why there is no risked P50</H3>
    <P>
      A risked volume is a mixture of two outcomes: a spike of probability mass sitting exactly at zero with
      weight 1 minus Pg, and the success-case distribution carrying the remaining weight Pg. Risking does no
      shifting of a single smooth curve. That mixture is bimodal, and a percentile taken across it behaves in
      a way that misleads almost everyone who reads it.
    </P>
    <UL>
      <li>
        <strong>When Pg is below 0.5 the true risked median is exactly zero.</strong> More than half the
        probability sits on the dry hole, so the median outcome is a dry hole. A tool that printed
        &ldquo;risked P50 = 11.8&rdquo; for our example, from 0.235 times 50, would be printing a number that
        no outcome of the well can ever produce.
      </li>
      <li>
        <strong>When Pg is above 0.5 the true risked median is a success-case quantile,</strong> the one at
        probability level (Pg minus 0.5) divided by Pg. It moves non-linearly with Pg and has nothing to do
        with Pg times the unrisked P50.
      </li>
      <li>
        <strong>Pg times a percentile is not a percentile of anything.</strong> Multiplying every percentile
        by Pg produces a curve that is neither the risked distribution nor the success case. It understates
        the discovery you would actually develop and overstates the outcome you would actually see, in one
        number.
      </li>
      <li>
        <strong>Risked percentiles do not add up.</strong> Portfolio percentiles need the full distributions
        and their dependence structure. Risked means add, which is why the roll-up is built on means.
      </li>
    </UL>
    <Note tone="info" title="The rule to carry away">
      Mean is the only volume statistic that survives risking as a simple multiplication, because expectation
      is linear and the failure branch contributes zero. Percentiles do not survive it. Report the risked
      mean for value, report the success case for design, and state Pg beside both.
    </Note>

    <H2>The prospect inventory</H2>
    <P>
      Type a name and press <strong>Add to inventory</strong>. The row is written to the
      <Code>rcp_prospects</Code> table with four pieces: the name, the Pg factor set, the input volumes, and
      the risked outputs as computed at the moment you saved. The list below reloads and shows name, Pg,
      unrisked mean and risked mean, newest first, with a delete button on each row.
    </P>
    <UL>
      <li>
        <strong>Saving needs a signed-in session</strong> and refuses with a message if there is none. Both a
        name and a finite unrisked mean are required.
      </li>
      <li>
        <strong>Rows are owner scoped.</strong> Row level security limits select, insert, update and delete
        to the rows you own, so you see your prospects and nobody else's.
      </li>
      <li>
        <strong>The inventory is per user rather than per project.</strong> It is not attached to the RCP
        project you save, it does not travel in a project export, and switching project does not change what
        the list shows. Name prospects so you can tell which study they came from.
      </li>
      <li>
        <strong>Adding always creates a new row.</strong> The panel has no edit action, so adding a prospect
        whose name already exists gives you two rows. To revise a prospect, delete the old row and add the
        corrected one.
      </li>
      <li>
        <strong>The Pg shown in the table is recomputed</strong> from the stored factors each time the list
        renders, and the risked mean falls back to Pg times the stored mean if the stored risked block is
        missing.
      </li>
    </UL>

    <H2>The portfolio roll-up</H2>
    <P>
      Once the inventory has at least one row, a summary block appears headed with the prospect count and the
      words &ldquo;treated independently&rdquo;. Four numbers are reported.
    </P>
    <Table
      headers={['Number', 'Definition', 'What it means']}
      rows={[
        ['Expected risked volume', 'sum of Pg x mean over all prospects', 'The volume you should expect from drilling the whole inventory once. The portfolio value number.'],
        ['Expected discoveries', 'sum of Pg', 'The expected count of successful wells. A fractional number is normal and correct.'],
        ['Success-case total', 'sum of the unrisked means', 'The volume if every prospect works. The absolute upside bound, and a very unlikely outcome.'],
        ['P(at least one discovery)', '1 minus the product of (1 - Pg)', 'The probability that the campaign is not a complete failure.'],
      ]}
    />
    <P>
      A worked example with two prospects. Prospect A has Pg 0.5 and unrisked mean 100. Prospect B has Pg 0.2
      and unrisked mean 200.
    </P>
    <Formula>expected risked volume = 0.5 x 100 + 0.2 x 200 = 90</Formula>
    <Formula>expected discoveries = 0.5 + 0.2 = 0.7</Formula>
    <Formula>success-case total = 100 + 200 = 300</Formula>
    <Formula>P(at least one) = 1 - (1 - 0.5)(1 - 0.2) = 0.60</Formula>

    <H3>The independence assumption</H3>
    <P>
      Every one of those formulas treats the prospects as geologically independent. The probability of at
      least one discovery in particular is exactly the calculation you may not perform when the prospects
      share a risk element.
    </P>
    <UL>
      <li>
        <strong>Shared charge is the usual offender.</strong> Four prospects on the same kitchen do not fail
        independently. If the kitchen is immature they all fail together, and the real probability of at
        least one discovery is far lower than the independent formula reports.
      </li>
      <li>
        <strong>The same applies to a shared reservoir fairway or a shared regional seal.</strong> Common
        risk raises the chance of a total campaign failure and also raises the chance of a clean sweep. It
        squeezes the middle outcomes out.
      </li>
      <li>
        <strong>The two sums are safe.</strong> Expected risked volume and expected discoveries are sums of
        expectations, and expectation is linear whether or not the prospects are correlated. Those two
        numbers hold up under shared risk. The probability of at least one discovery does not.
      </li>
      <li>
        <strong>The engine carries no shared-risk model.</strong> There is no place to declare a common risk
        factor. If your prospects share an element, treat the reported probability of at least one discovery
        as an optimistic ceiling and reason about the common factor separately.
      </li>
    </UL>

    <H2>What these numbers do not tell you</H2>
    <UL>
      <li>
        <strong>Nothing about money.</strong> There is no well cost, no development cost, no price deck and
        no discount rate here. The risked mean is a volume on an expected value basis. Take it into
        Petroleum Economics Studio to turn it into an expected monetary value.
      </li>
      <li>
        <strong>Nothing about recoverability past what you fed in.</strong> The volume is whatever you seeded
        or typed. If that was in place volume, the risked mean is a risked in place volume.
      </li>
      <li>
        <strong>Nothing about the spread of a portfolio outcome.</strong> A sum of means gives no P90 and no
        P10 for the campaign. Producing those needs a Monte Carlo over the whole inventory with its
        dependence structure, which this tool does not run.
      </li>
      <li>
        <strong>Nothing about drilling order or option value.</strong> A cheap early well that tests a shared
        charge risk can be worth more than its own risked volume suggests, because of what it tells you about
        the rest of the inventory. That judgement stays with you.
      </li>
      <li>
        <strong>Nothing about whether the volumes are comparable.</strong> The roll-up adds whatever numbers
        are in the rows. Mixed units or a mix of in place and recoverable volumes produce a total that looks
        perfectly reasonable and means nothing.
      </li>
    </UL>
    <Note tone="success" title="A defensible way to use the panel">
      Run the Monte Carlo study first so the unrisked volumes are seeded from a documented run. Set the four
      factors with a written reason for each. Add the prospect. Repeat for the rest of the inventory on the
      same unit basis and the same volume definition. Then quote three numbers together: Pg, the risked mean,
      and the success-case P90 to P10 range. Those three carry the full picture without hiding the dry hole.
    </Note>
  </Article>
);

export default ProspectRiskingGuide;
