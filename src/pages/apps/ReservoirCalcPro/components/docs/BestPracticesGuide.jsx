import React from 'react';
import { Article, H2, P, UL, OL, Code, Note, Table } from './DocParts';

const BestPracticesGuide = () => (
  <Article
    title="Best Practices"
    lead="Habits that make a ReservoirCalc Pro volume trustworthy: declare your surface metadata carefully, prefer the method that uses the structure you actually have, converge the grid before you believe the third digit, and leave a trail behind the number."
  >
    <H2>At import: declare the metadata carefully</H2>
    <P>
      Two fields chosen in the import dialog drive everything downstream, and neither can be corrected later
      without re-importing.
    </P>
    <UL>
      <li>
        <strong>XY unit.</strong> Feet or metres. Cell footprints, and therefore every area and every volume,
        are scaled by this. Getting it wrong scales the answer by about 10.76 in one direction or the other,
        and nothing else in the run looks unusual.
      </li>
      <li>
        <strong>Z convention.</strong> Elevation means Z is negative downward, depth means Z is positive
        downward as TVDSS. The engine converts the surface and your contacts to a common downward depth using
        this setting, so it decides whether an OWC sits below the crest or above it.
      </li>
    </UL>
    <P>
      Record the CRS as well when you know it. It is optional and does not affect the arithmetic, but it is
      what tells the next person whether two surfaces are in the same projection.
    </P>
    <Note tone="info" title="Verify what you declared">
      The Data Manager prints every surface as point count, Z range, XY unit, Z convention and CRS on one
      line. Read that line once after each import. It takes seconds and catches the errors that are expensive
      later.
    </Note>

    <H2>QC every surface in 3D before you trust a volume</H2>
    <P>
      Look at the surface in the 3D view before running anything. You are checking for spikes, holes, a
      contact plane sitting somewhere implausible, and edges where the interpolator has been left to guess.
      A single bad control point can dominate a gross rock volume, and it is obvious on screen while being
      invisible in a table of results.
    </P>

    <H2>Choose the method that matches your data</H2>
    <P>
      The three input methods are not interchangeable, and the one you pick decides whether contacts do
      anything at all.
    </P>
    <Table
      headers={['Method', 'Use when', 'What drives GRV']}
      rows={[
        [
          <Code key="s">simple</Code>,
          'You have a mapped area and an average thickness and no surface',
          'Area times thickness. Contacts and AOIs are ignored because there is no depth reference.',
        ],
        [
          <Code key="h">hybrid</Code>,
          'You have a top surface and a reasonable constant gross thickness',
          'The top surface integrated cell by cell against the contacts, with a uniform thickness below it.',
        ],
        [
          <Code key="f">surfaces</Code>,
          'You have both a top and a base surface',
          'Both surfaces integrated cell by cell against the contacts, so thickness varies across the map.',
        ],
      ]}
    />
    <P>
      Prefer a structural method whenever you have a surface and a contact. It is the difference between a
      volume that responds to the shape of the structure and one that does not. A domed top and a flat top at
      the same mean depth give the same simple answer and very different structural answers, and the
      structural answer is the one worth reporting.
    </P>

    <H2>Converge the grid before you believe the answer</H2>
    <P>
      Grid resolution is a setting, offered as Coarse at 80 cells per axis, Standard at 150 and Fine at 250.
      It controls the integration grid for contact-based volumetrics, for the hypsometric curve used by
      structural Monte Carlo runs, and for the 3D grid.
    </P>
    <OL>
      <li>Do all exploratory work at Standard. It is the default for a reason.</li>
      <li>
        When the case is settled, re-run once at Fine and compare. If the volume moves by less than your
        reporting precision, Standard was enough and you can stay there.
      </li>
      <li>
        If it is still moving, the geometry is under-resolved. Stay at Fine, and treat the residual movement
        as a real component of the uncertainty.
      </li>
    </OL>
    <P>
      Interpolation method is a related setting. Ordinary kriging is the recommended default. Inverse
      distance is faster and is the sensible choice while you are still iterating on a large surface.
    </P>

    <H2>Use an AOI for a lowest known oil</H2>
    <P>
      When the trap is not a simple flat contact, draw an AOI and exclude the area below the lowest known
      oil. The AOI clips the integration cells, and partially covered cells contribute only their covered
      fraction, so the boundary is honoured smoothly rather than as a staircase.
    </P>
    <P>
      Two disciplines make this reliable. Name AOIs for what they represent, for example <em>LKO limit</em> or
      <em> fault block A</em>, since the name is what appears in the audit trail. And deselect the AOI when you
      want the unclipped case, since an AOI left active is the most common cause of a gross rock volume that
      is quietly too small.
    </P>

    <H2>Set a gas cap fraction on any oil with a gas cap</H2>
    <P>
      With fluid type set to oil and gas in the simple method, leaving the gas cap fraction empty means the
      case is modelled as undersaturated oil with no free gas cap at all. GIIP comes back as zero and the run
      warns you about it, but the STOOIP still looks perfectly reasonable.
    </P>
    <UL>
      <li>
        In the simple method, set the gas cap fraction as a fraction of gross rock volume between 0 and 1.
        The two zones then get separate pore volumes and never draw on the same rock.
      </li>
      <li>
        In a structural method, provide a GOC instead. The engine splits the column at that depth and derives
        the gas cap from the geometry, which is the rigorous version of the same thing.
      </li>
    </UL>

    <H2>Run the base case before the Monte Carlo</H2>
    <P>
      Run the deterministic case first, every time. It gives you three things the probabilistic study needs.
    </P>
    <OL>
      <li>A quality score and a warnings list on the inputs, before those same inputs become distributions.</li>
      <li>A base case the distribution editors can centre on and revert to, one parameter at a time.</li>
      <li>A reference value that the probabilistic results compare their P50 against.</li>
    </OL>
    <P>
      Leave base-case consistency mode on. It flags any distribution whose central value sits more than 5
      percent from the matching deterministic input, and it never blocks a run. A deliberate shift is fine,
      and the warning is there to catch the shift you did not intend.
    </P>
    <Note tone="info" title="Expect a gap between the two P50s">
      The Monte Carlo P50 will not equal the deterministic answer, because the median of a product of
      distributions is not the product of the medians. A modest gap is normal. A gap above 40 percent is
      flagged in the results header and is worth investigating as off-centre input distributions.
    </Note>

    <H2>Use reservoir cases for alternative interpretations</H2>
    <P>
      A project holds several reservoirs, and each entry is a complete workspace snapshot with its own
      inputs, surfaces, AOIs, maps and results. Switching folds the live workspace back into its entry first,
      so nothing is lost in the swap.
    </P>
    <P>
      That makes reservoir entries the right home for competing readings of the same tank: an optimistic and
      a pessimistic contact, two structural interpretations, a with-AOI and without-AOI pair. All of them
      save together, export together, and can be compared without juggling separate project files.
    </P>

    <H2>Save snapshots before major changes</H2>
    <P>
      Save before anything that replaces the live workspace: switching reservoirs, loading another project,
      or starting a new one. Every save increments the project version, and the version number appears in the
      audit trail entry and in the export filename, so the version is a usable label on its own.
    </P>
    <P>
      Keep the naming pattern explicit, for example <Code>North Dome Run 1</Code>
      and <Code>North Dome Run 2</Code>, when you want two states side by side rather than one state with a
      history.
    </P>

    <H2>Keep the audit trail with the project</H2>
    <P>
      The trail records surface imports with point counts, AOI creation, map generation, saves and loads,
      reservoir changes, and both kinds of run with their iteration counts and GRV mode. It persists inside
      the project and travels in an exported workspace file, capped at the most recent 200 entries.
    </P>
    <P>
      Do not clear it to tidy up. Export the CSV alongside a Detailed Audit PDF and keep both with the
      project file. That pair is what lets someone else trace a reported volume back to the run that produced
      it and the data that went into it.
    </P>

    <H2>On unit systems</H2>
    <P>
      Mixing units across a project is no longer a hazard. Switching between Field and Metric converts the
      stored case rather than reinterpreting the numbers, so 5000 acres does not become 5000 square
      kilometres. Per-field display units are a display layer over a canonical stored value, so choosing
      rb/Mscf for Bg or bar for pressure is exact and reversible.
    </P>
    <P>
      Enter each quantity in the unit your source document actually quotes and select that unit. Converting
      by hand before typing is where errors enter, and the app no longer requires it.
    </P>
    <Note tone="success" title="The short version">
      Declare XY unit and Z convention correctly. QC in 3D. Use a structural method when you have a surface.
      Converge Standard against Fine. Run deterministic first. Save often, and keep the trail.
    </Note>
  </Article>
);

export default BestPracticesGuide;
