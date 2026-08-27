import React from 'react';
import { Article, H2, H3, P, UL, Code, Formula, Note, Table } from './DocParts';

const FluidPropertiesGuide = () => (
  <Article
    title="Fluid Properties"
    lead="Fluid system selection, the built-in presets and what they actually write, the Standing correlation behind the Bo calculator, the three Bg conventions, the gas-cap fraction, and how fluid contacts are entered."
  >
    <H2>Fluid system</H2>
    <P>
      The fluid system is chosen in Project Settings at the top of the input panel and again in the
      probabilistic setup card. It is stored as <Code>fluidType</Code> and takes one of three values.
    </P>
    <Table
      headers={['Button', 'Stored value', 'What it changes']}
      rows={[
        ['Oil', 'oil', 'Oil properties card and an OWC field. Gas properties are hidden. The whole gross rock volume above the OWC becomes oil leg.'],
        ['Gas', 'gas', 'Gas properties card and one contact field, relabelled GWC. STOOIP mirrors GIIP in the results, and recoverable oil is zero.'],
        ['Oil + Gas', 'oil_gas', 'Both property cards, plus OWC and GOC. The gross rock volume is split between a gas cap and an oil leg.'],
      ]}
    />

    <H2>Quick presets</H2>
    <P>
      The Fluid tab shows preset buttons for the active fluid system. There are three oil presets and three
      gas presets. Their stored values are below.
    </P>
    <Table
      headers={['Preset', 'API', 'Gas gravity', 'Rs (scf/stb)', 'Temp (F)', 'Bo (rb/stb)', 'Viscosity (cp)']}
      rows={[
        ['Light Oil (above 35 API)', '40', '0.65', '500', '180', '1.25', '0.8'],
        ['Medium Oil (25 to 35 API)', '30', '0.70', '300', '160', '1.15', '2.5'],
        ['Heavy Oil (below 25 API)', '20', '0.75', '100', '140', '1.05', '10.0'],
      ]}
    />
    <Table
      headers={['Preset', 'Gas gravity', 'Temp (F)', 'Bg (rcf/scf)', 'Z factor', 'Yield (bbl/MMscf)']}
      rows={[
        ['Dry Gas', '0.60', '180', '0.0050', '0.90', '0'],
        ['Wet Gas', '0.75', '200', '0.0045', '0.85', '20'],
        ['Gas Condensate', '0.85', '220', '0.0040', '0.80', '100'],
      ]}
    />
    <Note tone="warn" title="A preset button writes two numbers only">
      Clicking a preset in the Fluid tab writes <Code>Bo</Code> (from the preset bo) and <Code>Bg</Code>
      (from the preset bg). Nothing else moves. The API gravity, gas gravity, solution GOR, temperature,
      viscosity, Z factor and yield shown above stay in the library and are never copied into your case.
      Oil presets carry no bg, so an existing Bg survives, and gas presets carry no bo, so an existing Bo
      survives.
    </Note>
    <Note tone="info" title="The Data Manager presets write more">
      The Fluid Library panel inside Workspace Tools uses the same preset table but applies more fields. Its
      oil entries write Bo, API, gas gravity and temperature. Its gas entries write Bg, gas gravity and
      temperature. Use that panel when you want the whole preset rather than the FVF alone.
    </Note>

    <H2>Oil formation volume factor (Bo)</H2>
    <P>
      Bo is entered directly in the Oil Properties card. The unit label follows the active unit system,
      showing rb/stb in field and rm3/sm3 in metric. Bo is a dimensionless reservoir-volume to
      standard-volume ratio, so those two labels are numerically the same number and switching unit system
      leaves the value alone.
    </P>
    <P>
      Validation flags a Bo below 1.0 rb/stb as non-physical and costs 15 points of the input quality score.
    </P>

    <H3>The Bo calculator (Standing, 1947)</H3>
    <P>
      The calculator icon in the Oil Properties card header opens a dialog with four inputs: oil gravity in
      API, gas gravity with air equal to 1, solution GOR in scf/stb and temperature in F. It opens
      prefilled with 35, 0.7, 500 and 160. Calculate Bo writes the result straight into the Bo field.
    </P>
    <Formula>
      gamma_o = 141.5 / (131.5 + API){'\n'}
      F = Rs * sqrt(gamma_g / gamma_o) + 1.25 * T{'\n'}
      Bo = 0.9759 + 0.00012 * F^1.2
    </Formula>
    <UL>
      <li>T is in degrees Fahrenheit and Rs in scf/stb. There is no unit dropdown inside this dialog.</li>
      <li>The result is rounded to four decimals and floored at 1.0, so the correlation can never return a non-physical Bo.</li>
      <li>If any of the four inputs is zero, blank or missing, the calculator returns 1.2 as a fallback instead of an error. Check the value it wrote.</li>
      <li>The four entries persist while the input panel stays mounted, so reopening the dialog shows what you last typed. They return to 35, 0.7, 500 and 160 when the app reloads.</li>
    </UL>
    <Note tone="info" title="Correlation range">
      Standing was fitted to California crudes. It behaves well for black oils in the range of the presets
      above. For volatile oils, very high GOR, or a case where you hold a laboratory PVT report, enter the
      measured Bo directly.
    </Note>

    <H2>Gas formation volume factor (Bg)</H2>
    <P>
      Bg has its own unit dropdown, because PVT reports quote it in at least three conventions and the
      difference between them is a factor of a thousand. The value stored on the case is always rcf/scf.
    </P>
    <Table
      headers={['Dropdown option', 'Meaning', 'Stored as rcf/scf', 'Example']}
      rows={[
        ['rcf/scf (= rm3/sm3)', 'Reservoir cubic feet per standard cubic foot. Identical numerically to reservoir m3 per standard m3.', 'Value used as typed', '0.005'],
        ['rb/scf', 'Reservoir barrels per standard cubic foot', 'Multiplied by 5.614583', '0.00089053'],
        ['rb/Mscf', 'Reservoir barrels per thousand standard cubic feet', 'Multiplied by 5.614583 / 1000', '0.89053'],
      ]}
    />
    <P>
      The single conversion constant is 5.614583 ft3 per barrel. All three rows of the table above are the
      same gas at the same conditions.
    </P>
    <Note tone="warn" title="The rb/Mscf trap">
      Typing an rb/Mscf number while the dropdown says rcf/scf inflates Bg by about 178 and collapses GIIP by
      the same factor. Validation catches this: a Bg above 0.1 rcf/scf raises a warning that says the value
      is non-physical for most reservoirs and suggests selecting the rb/Mscf or rb/scf option, and it costs
      10 points of the input quality score. A Bg of zero or below raises a separate warning worth 15 points.
      Typical reservoir Bg sits between 0.002 and 0.05 rcf/scf.
    </Note>

    <H3>The real-gas Bg relation</H3>
    <P>
      The fluid library also contains the standard real-gas relation, with standard conditions of 14.7 psia
      and 520 R.
    </P>
    <Formula>Bg = (14.7 / 520) * (z * (T_F + 459.67) / P)   [rcf/scf, P in psia, T in F]</Formula>
    <Note tone="warn" title="This one has no button">
      The Bo calculator dialog is the only fluid calculator wired to the interface. The Bg relation exists in
      the library, and no control in the app calls it. Compute Bg from
      your PVT report or from pressure, temperature and Z by hand, then type it in with the correct unit
      selected.
    </Note>

    <H2>Gas cap fraction of GRV</H2>
    <P>
      This field appears only when the fluid system is Oil + Gas and the input method is Simple. It accepts a
      fraction of gross rock volume between 0 and 0.99, stepping in 0.05.
    </P>
    <Formula>GRV_gas = GRV * gasCapFraction ;  GRV_oil = GRV - GRV_gas</Formula>
    <P>
      The Simple method has no structural surface and therefore no depth reference, so a GOC cannot be
      applied. The gas-cap fraction is the analytic stand-in for it. Splitting the volume this way keeps oil
      and gas from drawing on the same pore volume: each zone gets its own GRV, its own hydrocarbon pore
      volume, and its own recovery factor.
    </P>
    <Note tone="danger" title="Leaving it blank silently changes the case">
      With Oil + Gas selected and no gas-cap fraction set, the whole gross rock volume becomes oil leg, GIIP
      is zero, and the engine degrades the case to undersaturated oil. It records a warning saying so in the
      results panel. The Monte Carlo engine behaves the same way and adds its own warning. A value outside
      the range 0 to 1 raises a validation warning worth 10 points.
    </Note>
    <P>
      In the Hybrid and Surfaces input methods this field is hidden, because the contact volumetrics engine
      derives the split from the GOC by integrating each depth window cell by cell.
    </P>

    <H2>Fluid contacts</H2>
    <P>
      The Fluid Contacts card sits in the Geometry tab. Which fields appear depends on the fluid system.
    </P>
    <Table
      headers={['Fluid system', 'First field', 'Second field']}
      rows={[
        ['oil', 'OWC (Oil-Water)', 'hidden'],
        ['oil_gas', 'OWC (Oil-Water)', 'GOC (Gas-Oil)'],
        ['gas', 'hidden', 'GWC (Gas-Water), stored in the same goc slot'],
      ]}
    />
    <P>
      For a gas case the second field is relabelled GWC in the interface and continues to write the
      <Code>goc</Code> input. The engine reads it as the gas-water contact, and falls back to the OWC value
      when no GWC is entered.
    </P>

    <H3>How the fields commit</H3>
    <UL>
      <li>Typing updates the box only. The value reaches the case on blur, or when you press Enter, which also blurs the field.</li>
      <li>Clearing the box and committing stores null. An empty contact is a real state, distinct from zero.</li>
      <li>A contact that is null leaves that side of the fluid window open, so the whole reservoir column counts as hydrocarbon bearing. A blank OWC therefore gives a larger volume than a deep one.</li>
      <li>External changes, for example loading a project or switching reservoir, refresh the boxes only while they are not focused, so your typing is never overwritten mid-entry.</li>
    </UL>

    <H3>Convention and consistency</H3>
    <P>
      Contacts are typed in the same sign convention and the same length unit as the surface they apply to.
      The contact volumetrics engine converts them with the surface <Code>zConvention</Code> and
      <Code>depthUnit</Code>. With an elevation surface a deeper contact is a more negative number, so an OWC
      of -8000 lies below a GOC of -7000.
    </P>
    <Note tone="warn" title="Order check">
      In an Oil + Gas structural run, if the OWC comes out shallower than the GOC the engine keeps computing
      and adds a warning that the contact depths look reversed. Check the sign convention first when you see
      it.
    </Note>
    <P>
      Toggling the Field and Metric systems converts OWC and GOC in place along with thickness and area, so
      the physical case is preserved. See the Units and Conversions article.
    </P>

    <H2>Recorded but unused inputs</H2>
    <P>
      Some fluid and reservoir-condition fields are stored on the case and shown in reports, and they do not
      enter the volumetric equations: initial pressure, temperature, permeability, oil gravity in API and gas
      gravity. They are documentation of the case and the source data for the Bo calculator. The numbers
      that drive the volume are area, thickness, net-to-gross, porosity, water saturation, Bo, Bg, the
      recovery factors, the contacts and the gas-cap fraction.
    </P>
  </Article>
);

export default FluidPropertiesGuide;
