import React from 'react';
import { Article, H2, H3, P, UL, Code, Formula, Note, Table } from './DocParts';

const InputMethodsGuide = () => (
  <Article
    title="Input Methods"
    lead="Input Method decides how gross rock volume is produced. simple is an analytic area times thickness calculation with no geometry. hybrid and surfaces both route to the contact grid integration engine, where the fluid contacts control the volume."
  >
    <H2>The choice in one table</H2>
    <Table
      headers={['', 'simple', 'hybrid', 'surfaces']}
      rows={[
        ['Requires', 'Area and gross thickness', 'A top surface and a gross thickness', 'A top surface and a base surface'],
        ['GRV comes from', 'Area times thickness', 'Grid integration on the top surface', 'Grid integration between the two surfaces'],
        ['Fluid contacts', 'Ignored entirely', 'Control the volume', 'Control the volume'],
        ['Active AOI', 'Ignored', 'Clips the integration', 'Clips the integration'],
        ['Thickness field shown', 'Yes', 'Yes', 'No, the base surface defines the interval'],
        ['Oil and gas split', 'Gas Cap Fraction of GRV', 'From the GOC', 'From the GOC'],
        ['Monte Carlo geometry variables', 'Area and Gross Thickness', 'Contacts plus a GRV Factor', 'Contacts plus a GRV Factor'],
      ]}
    />
    <P>
      You set the method in the <strong>Project Settings</strong> card in the left panel, on the three way
      radio row labelled Input Method. Changing it triggers a fresh deterministic run.
    </P>

    <H2>simple: the analytic method</H2>
    <P>
      The simple method multiplies the area you type by the thickness you type. No surface is read, no grid is
      built, and no depth reference exists anywhere in the calculation.
    </P>
    <Formula>Field:   GRV = Area [acres] x Thickness [ft]      (acre-ft)</Formula>
    <Formula>Metric:  GRV = Area [km2] x 1e6 x Thickness [m]    (m3)</Formula>
    <P>Everything downstream is the standard roll up.</P>
    <Formula>NRV  = GRV x NTG</Formula>
    <Formula>PV   = NRV x porosity</Formula>
    <Formula>HCPV = GRV_zone x NTG x porosity x (1 - Sw)</Formula>
    <Formula>STOOIP = HCPV_oil x 7758 / Bo      (field, 7758 bbl per acre-ft)</Formula>
    <Formula>GIIP   = HCPV_gas x 43560 / Bg     (field, 43560 ft3 per acre-ft)</Formula>
    <P>
      In metric the hydrocarbon pore volume is already in m3, so only the formation volume factor divides and no
      unit constant is applied. Recoverable volumes use the two recovery factors independently, oil at the oil
      recovery factor and gas at the gas recovery factor.
    </P>
    <Note tone="danger" title="simple ignores your fluid contacts">
      The OWC and GOC boxes stay visible for an oil case and their values are echoed into the results record, but
      the simple method has no depth reference, so a contact cannot cut anything. Moving the OWC in this method
      changes nothing about the volume. Reported HC Area is exactly the area you typed. If contacts matter to
      your answer, use hybrid or surfaces.
    </Note>
    <Note tone="warn" title="There is no GRV factor in this path">
      Earlier documentation described a GRV_Factor multiplier in the simple method. No such term exists in the
      engine. Gross rock volume here is area times thickness and nothing else. A GRV Factor does exist, but only
      as a Monte Carlo uncertainty multiplier on the structural methods.
    </Note>

    <H3>Splitting oil and gas without a GOC</H3>
    <P>
      For fluid type Oil + Gas on the simple method a field appears on the Fluid tab called{' '}
      <strong>Gas Cap Fraction of GRV</strong>, a number between 0 and 1. It is the analytic stand in for a GOC.
    </P>
    <Formula>GRV_gas = GRV x gasCapFraction        GRV_oil = GRV - GRV_gas</Formula>
    <P>
      Each zone then carries its own hydrocarbon pore volume, so oil and gas never draw on the same pore space.
      Leave the fraction unset and the case is modelled as undersaturated oil with no free gas cap, and the
      results carry a warning saying so.
    </P>

    <H2>hybrid and surfaces: contact grid integration</H2>
    <P>
      Both route to the same engine. The difference is only how the base of the reservoir column is defined.
    </P>
    <UL>
      <li><strong>hybrid.</strong> Base is the top surface offset downwards by the constant gross thickness you type. Structural relief is honoured and thickness variation is treated as constant.</li>
      <li><strong>surfaces.</strong> Base is a second imported surface. Both relief and thickness variation are honoured, and the Gross Thickness field disappears.</li>
    </UL>
    <Note tone="danger" title="hybrid thickness is added in the surface's own depth unit">
      The constant gross thickness is added to the top depth before the surface is scaled into the
      project unit system. That is correct whenever the surface's declared depth unit matches the
      project, which is the normal case. Where they differ, for example a surface declared in metres
      opened in a Field project, the thickness you typed in feet is added as though it were metres
      and the interval is silently wrong. Check the depth unit on the surface before trusting a
      hybrid volume, and prefer the surfaces method, or re-import the surface in the project unit,
      whenever the two disagree.
    </Note>
    <P>
      A regular grid is draped over the bounding box of the top surface. At each cell centre the top and base
      depths are interpolated, giving a reservoir column, and the engine sums the overlap of that column with each
      fluid zone window.
    </P>
    <Formula>GRV_zone = SUM over cells of  overlap([topZ, baseZ], [zoneTop, zoneBottom]) x cellArea</Formula>
    <P>
      This is why a domed top and a flat top with the same mean depth give different volumes, and why moving a
      contact by 20 ft changes the number. Depths are normalised internally so that depth increases downward,
      whichever convention the surface was imported with, and both depth and cell area are converted into the
      target units of the active unit system before any arithmetic. Cell areas are carried in the surface true XY
      units and converted to acres or m2.
    </P>

    <H3>Fluid zone windows</H3>
    <Table
      headers={['Fluid type', 'Gas zone', 'Oil zone', 'If a contact is missing']}
      rows={[
        ['Oil', 'None', 'Everything above the OWC', 'No OWC means the whole column counts as oil.'],
        ['Gas', 'Everything above the GWC', 'None', 'The GOC field is read as the GWC. With neither, the whole column counts as gas.'],
        ['Oil + Gas', 'Everything above the GOC', 'Between the GOC and the OWC', 'No GOC gives undersaturated oil with no gas cap, plus a warning.'],
      ]}
    />
    <P>
      If the OWC comes out shallower than the GOC the results carry a warning that the contacts look reversed.
      If the whole reservoir column lies below the OWC the volume is zero and the results say so rather than
      returning a silent zero.
    </P>

    <H3>Grid, masking and clipping</H3>
    <UL>
      <li>
        <strong>Resolution.</strong> Cells per axis comes from Workspace Tools then Settings then Grid Resolution:
        Coarse 80, Standard 150 (the default) or Fine 250. The engine clamps it between 20 and 600 and scales the
        other axis by the bounding box aspect ratio.
      </li>
      <li>
        <strong>Interpolation.</strong> Ordinary Kriging (the default) or Inverse Distance, also set in Settings.
        The same choice drives the map generator and the on-the-fly gridding behind the viewers.
      </li>
      <li>
        <strong>Hull masking.</strong> Cells whose nearest control point is farther than twice the mean sample
        spacing are dropped, so the engine does not extrapolate volume into empty parts of the bounding box.
      </li>
      <li>
        <strong>AOI clipping.</strong> Setting an AOI Active in the AOI tab clips the integration to that polygon.
        Coverage is fractional: a cell fully inside counts once, a cell fully outside is skipped, and an edge cell
        is estimated from a 4 by 4 subsample so the boundary is not stair stepped.
      </li>
    </UL>

    <H3>What the results add over the simple path</H3>
    <UL>
      <li>Productive area split by zone, plus average net pay for the oil and gas zones.</li>
      <li>The grid actually used: cell counts, cell dimensions, masked cell count and clipped cell count.</li>
      <li>The XY unit, depth unit and Z convention taken from the surface.</li>
      <li>A method tag of <Code>contact-grid</Code> in the results record.</li>
    </UL>

    <H2>What changes in probabilistic mode</H2>
    <P>
      The input method also decides which variables the Monte Carlo panel offers, because sampling free area and
      free thickness would throw away the structure you imported.
    </P>
    <Table
      headers={['', 'simple', 'hybrid and surfaces']}
      rows={[
        ['Geometry variables sampled', 'Area, Gross Thickness', 'OWC, GOC for oil and gas cases, and a GRV Factor'],
        ['GRV per realisation', 'Recomputed analytically from the sampled area and thickness', 'Read from a precomputed hypsometric curve at the sampled contact depth, then multiplied by the GRV Factor'],
        ['Default contact spread', 'Not applicable', 'Plus or minus 50 ft in field units, plus or minus 15 m in metric, applied additively'],
        ['Prerequisite', 'None beyond the inputs', 'A Top surface must be selected, and surfaces also needs a Base'],
      ]}
    />
    <P>
      The hypsometric curve is built once per run from the same grid the deterministic engine uses, which is what
      makes a 50,000 iteration structural study practical. The GRV Factor defaults to a triangular 0.85 / 1.00 /
      1.15 and carries the structural uncertainty that the contacts alone do not express.
    </P>

    <H2>Choosing a method</H2>
    <Table
      headers={['Situation', 'Use']}
      rows={[
        ['Screening or a quick sanity check, no mapped surface to hand', 'simple'],
        ['Reproducing someone else area times thickness number', 'simple'],
        ['A mapped top structure, thickness reasonably constant over the accumulation', 'hybrid'],
        ['A mapped top and base, or real thickness variation across the field', 'surfaces'],
        ['Contact depth is the uncertainty that matters', 'hybrid or surfaces, then a probabilistic run on the contacts'],
        ['Volumes needed for one licence block or one segment of the structure', 'hybrid or surfaces with an Active AOI'],
      ]}
    />

    <H2>Errors you may see</H2>
    <Table
      headers={['Message', 'Cause']}
      rows={[
        ['Select a Top structural surface for this input method.', 'hybrid or surfaces is selected with no Top surface assigned. Assign one on the Surf tab.'],
        ['Please select both Top and Base surfaces for calculation.', 'The surfaces method needs a Base as well as a Top.'],
        ['A top surface with at least 3 points is required for contact-based volumetrics.', 'The chosen surface has too few valid points to interpolate.'],
        ['Provide either a base surface or a positive gross thickness.', 'hybrid was run with a zero or blank thickness.'],
        ['No hydrocarbon-bearing cells found.', 'Contacts, surface and AOI together leave nothing to integrate.'],
        ['Select a Top structural surface before running a probabilistic study in this input method.', 'A structural Monte Carlo run was started with no Top surface.'],
      ]}
    />
    <Note tone="info" title="Thickness always means gross">
      In both simple and hybrid, the thickness you type is the gross interval. Net rock is derived as gross times
      Net-to-Gross. Entering net pay there with an NTG below 1 applies the net cut twice and understates the volume.
    </Note>
  </Article>
);

export default InputMethodsGuide;
