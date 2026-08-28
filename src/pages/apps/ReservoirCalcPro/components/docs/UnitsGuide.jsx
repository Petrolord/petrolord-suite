import React from 'react';
import { Article, H2, H3, P, OL, Formula, Note, Table } from './DocParts';

const UnitsGuide = () => (
  <Article
    title="Units and Conversions"
    lead="Every unit-bearing input carries its own unit dropdown, values are stored in a canonical unit behind the interface, and the Field and Metric toggle converts the case in place. This article gives the option lists, the canonical storage rules and the exact conversion factors."
  >
    <H2>Per-field units</H2>
    <P>
      You do not have to convert anything by hand before typing it in. Each unit-bearing input in the
      analytic panel has a dropdown to its right, and you pick the unit your source data is quoted in. The
      number you type is converted at the input boundary, so the calculation engines only ever see the
      canonical value.
    </P>
    <Table
      headers={['Field', 'Where it appears', 'Options in the dropdown']}
      rows={[
        ['Area', 'Geometry tab, Simple input method', 'acres, km2, ha, m2, ft2, mi2'],
        ['Gross Thickness', 'Geometry tab, Simple and Hybrid', 'ft, m'],
        ['Initial Pressure', 'Geometry tab, Reservoir Conditions', 'psi, bar, kPa, MPa'],
        ['Temperature', 'Geometry tab, Reservoir Conditions', 'F, C, K'],
        ['Gas FVF (Bg)', 'Fluid tab, Gas Properties', 'rcf/scf (= rm3/sm3), rb/scf, rb/Mscf'],
      ]}
    />
    <P>
      Changing a dropdown re-displays the same stored quantity in the new unit. It never rewrites the case.
      Type 2 and pick km2, then switch the dropdown to acres, and the box reads 494.21 for the same
      reservoir.
    </P>
    <Note tone="info" title="Fields without a dropdown">
      Net-to-gross, porosity and water saturation are fractions. Recovery factors are percentages. Bo is a
      reservoir-volume to standard-volume ratio. Permeability is millidarcies. None of these carry a unit
      choice, because there is only one convention in use for each.
    </Note>

    <H2>Canonical storage</H2>
    <P>
      Behind the interface, each input is stored in one canonical unit. The dropdown is a display choice
      layered on top.
    </P>
    <Table
      headers={['Field', 'Canonical in Field system', 'Canonical in Metric system']}
      rows={[
        ['area', 'acre', 'km2'],
        ['thickness, owc, goc', 'ft', 'm'],
        ['bg', 'rcf/scf', 'rcf/scf'],
        ['pressure', 'psi', 'psi'],
        ['temperature', 'F', 'F'],
      ]}
    />
    <P>
      Area and length are the only two that follow the unit system, because the volumetric constants depend
      on them: the field path multiplies acres by feet and folds acre-ft to barrels with 7758 bbl/acre-ft and
      to standard cubic feet with 43560 ft3/acre-ft, while the metric path works in km2, metres and m3.
    </P>
    <P>
      Bg, pressure and temperature are stored system-independently in rcf/scf, psi and F. That is what the
      fluid correlation library consumes: Standing takes temperature in Fahrenheit, and the real-gas Bg
      relation takes pressure in psia and temperature in Fahrenheit. Storing them that way removes a
      conversion step at every call site. Bg is also numerically identical in rcf/scf and rm3/sm3, so it
      needs no system-dependent canonical at all.
    </P>

    <H3>Default display units</H3>
    <Table
      headers={['Field', 'Field system default', 'Metric system default']}
      rows={[
        ['area', 'acres', 'km2'],
        ['thickness', 'ft', 'm'],
        ['bg', 'rcf/scf', 'rcf/scf'],
        ['pressure', 'psi', 'bar'],
        ['temperature', 'F', 'C'],
      ]}
    />
    <P>
      These defaults are applied when a project is created and again whenever the unit system toggles, so a
      metric project starts in km2, m, bar and C without any clicking. Any dropdown you then change is
      remembered with the reservoir case.
    </P>

    <H2>The Field and Metric toggle</H2>
    <P>
      The System selector sits in the Project Settings block at the top of the input panel and again in the
      probabilistic setup card. Switching it does three things.
    </P>
    <OL>
      <li>
        Converts the stored geometric inputs in place: area between acre and km2, and thickness, OWC and GOC
        between ft and m. The physical reservoir stays the same.
      </li>
      <li>Resets the per-field display units to the defaults for the new system.</li>
      <li>Rescales the probabilistic distribution parameters for those same fields by the same factors, covering p90, p50, p10, mean, standard deviation, min and max.</li>
    </OL>
    <Note tone="success" title="Correction to older guidance">
      Earlier documentation told users to pick one unit system at the start and stay in it, because toggling
      reinterpreted the numbers: 5000 acres became 5000 km2 and the volume jumped by a factor of about 247.
      That behaviour is gone. Toggling now converts the case, and converting there and back returns the
      original numbers to floating-point precision. Switch whenever it suits you.
    </Note>
    <P>
      What the toggle leaves alone: fractions and ratios (net-to-gross, porosity, water saturation, recovery
      factors, Bo), and the system-independent quantities (Bg, pressure, temperature). Their display unit may
      change to the new default, and their stored value does not move.
    </P>
    <Note tone="warn" title="Surfaces are not touched">
      An imported surface keeps the coordinate unit and depth convention declared at import, whatever the
      project unit system says. The contact volumetrics engine converts each surface at calculation time
      using its own recorded units, so a metric surface still works in a field-unit project. The contacts you
      type, however, follow the project unit system, and they must match the surface convention.
    </Note>

    <H2>Conversion factors</H2>
    <P>
      Factors are stored as units per base unit, with base units of ft, acre, psi and rcf/scf. A conversion
      divides by the source factor to reach the base and multiplies by the target factor.
    </P>

    <H3>Length (base: ft)</H3>
    <Table
      headers={['Unit', 'Per ft', 'Meaning']}
      rows={[
        ['ft', '1', 'base'],
        ['m', '0.3048', '1 ft = 0.3048 m exactly'],
        ['km', '0.0003048', '1 ft = 0.0003048 km'],
      ]}
    />

    <H3>Area (base: acre)</H3>
    <Table
      headers={['Unit', 'Per acre', '1 acre equals']}
      rows={[
        ['acre', '1', 'base'],
        ['ft2', '43560', '43560 ft2'],
        ['m2', '4046.8564224', '4046.8564224 m2'],
        ['ha', '0.40468564224', '0.40468564224 ha'],
        ['km2', '0.0040468564224', '0.0040468564224 km2'],
        ['mi2', '1 / 640', '1/640 of a square mile'],
      ]}
    />
    <P>
      So 1 km2 = 247.105 acres, and toggling a 5000 acre case to metric gives 20.2343 km2.
    </P>

    <H3>Pressure (base: psi)</H3>
    <Table
      headers={['Unit', 'Per psi', '1 psi equals']}
      rows={[
        ['psi', '1', 'base'],
        ['bar', '0.0689476', '0.0689476 bar'],
        ['kPa', '6.89476', '6.89476 kPa'],
        ['MPa', '0.00689476', '0.00689476 MPa'],
      ]}
    />

    <H3>Gas FVF (base: rcf/scf)</H3>
    <Table
      headers={['Unit', 'Per rcf/scf', 'Note']}
      rows={[
        ['rcf/scf', '1', 'base, identical to rm3/sm3'],
        ['rm3/sm3', '1', 'a volume ratio, so the number is the same as rcf/scf'],
        ['rb/scf', '1 / 5.614583', '5.614583 ft3 per barrel'],
        ['rb/Mscf', '1000 / 5.614583', 'the same, per thousand scf'],
      ]}
    />

    <H3>Temperature</H3>
    <P>Temperature converts through Celsius rather than through a multiplicative factor.</P>
    <Formula>
      C = (F - 32) * 5/9      C = K - 273.15{'\n'}
      F = C * 9/5 + 32        K = C + 273.15
    </Formula>

    <H2>Result display units</H2>
    <P>
      Engine outputs are canonical surface volumes: oil in STB and gas in scf in the field system, and both
      in sm3 in the metric system. The result cards carry their own compact dropdown so you can read those
      numbers in whatever magnitude suits the audience.
    </P>
    <Table
      headers={['Phase', 'Options', 'Default in field', 'Default in metric']}
      rows={[
        ['Oil (STOOIP and recoverable oil)', 'STB, MMSTB, sm3, MMsm3', 'STB', 'sm3'],
        ['Gas (GIIP and recoverable gas)', 'scf, MMscf, Bscf, sm3, MMsm3, Bsm3', 'Bscf', 'Bsm3'],
      ]}
    />
    <P>The two volume equivalences used are below.</P>
    <Formula>1 bbl = 0.158987 m3    1 scf = 0.0283168 m3</Formula>
    <Note tone="info" title="Display only">
      A result selector converts for the screen and never touches the stored result. The results object also
      remembers the unit system it was computed under, so the conversion always starts from the right
      canonical even after you toggle the project system. Values at or above 1000 are shown as whole numbers,
      and smaller values get up to three decimals, which is what makes MMSTB and Bscf readable.
    </Note>

    <H2>Worked example</H2>
    <OL>
      <li>A project is in the Field system. You have a mapped area of 8.5 km2 and a gross thickness of 22 m from a metric report.</li>
      <li>In the Area field type 8.5 and select km2. The stored canonical becomes 2100.4 acres.</li>
      <li>In the Gross Thickness field type 22 and select m. The stored canonical becomes 72.18 ft.</li>
      <li>Bg from the PVT report reads 0.85 rb/Mscf. Type 0.85 and select rb/Mscf. The stored canonical becomes 0.0047724 rcf/scf.</li>
      <li>Run the case. STOOIP comes back in STB. Switch the oil card selector to MMSTB for the summary slide.</li>
      <li>Switch the project to Metric later if you like. Area becomes 8.5 km2 again, thickness 22 m, and Bg stays at 0.0047724.</li>
    </OL>
  </Article>
);

export default UnitsGuide;
