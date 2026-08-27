import React from 'react';
import { Article, H2, P, Code, Formula, Note, Table } from './DocParts';

const Glossary = () => (
  <Article
    title="Glossary"
    lead="Terms as ReservoirCalc Pro uses them. Where a term has several industry meanings, the definition here is the one the app implements."
  >
    <Note tone="warn" title="The P convention used throughout">
      ReservoirCalc Pro follows the petroleum convention, in which the P number is the probability of
      exceeding the value. P90 is therefore the LOW case, P50 the mid case and P10 the HIGH case. This is the
      reverse of the statistical percentile convention. The app labels them Proven, Probable and Possible in
      the result cards and reports for exactly this reason.
    </Note>

    <H2>Terms</H2>
    <Table
      headers={['Term', 'Meaning']}
      rows={[
        [
          'AOI (area of interest)',
          'A polygon in world XY coordinates that restricts a calculation to part of the mapped area. An active AOI clips the integration cells, and a partially covered cell contributes only its covered fraction. Structural methods honour it and the simple method ignores it.',
        ],
        [
          'Bg (gas formation volume factor)',
          'Reservoir gas volume per unit of surface gas volume. Canonical unit is rcf/scf, which equals rm3/sm3, and rb/scf and rb/Mscf can be selected at the input. GIIP divides hydrocarbon pore volume by Bg, so a Bg unit error scales GIIP inversely.',
        ],
        [
          'Bo (oil formation volume factor)',
          'Reservoir oil volume per stock tank barrel, in rb/stb or rm3/sm3. STOOIP divides hydrocarbon pore volume by Bo. A value below 1.0 is flagged as non-physical by the input validator.',
        ],
        [
          'Base case',
          'The deterministic run and the inputs that produced it, kept by the workspace so distribution editors can centre on it, revert to it, and flag drift from it, and so probabilistic results can be compared against it.',
        ],
        [
          'CRS (coordinate reference system)',
          'The projection and datum the surface coordinates are expressed in, recorded per surface at import. It is optional metadata in RCP and does not enter the arithmetic. Its job is to tell the next person whether two surfaces are in the same frame.',
        ],
        [
          'EPSG code',
          'The numeric identifier of a coordinate reference system, written as EPSG:32631 for WGS 84 UTM zone 31N. It is the form the import dialog expects in the CRS field, and it is auto-filled when the file carries it.',
        ],
        [
          'FVF (formation volume factor)',
          'The general term for the ratio of a fluid volume at reservoir conditions to its volume at surface conditions. In RCP it appears as Bo for oil and Bg for gas.',
        ],
        [
          'Gas cap fraction',
          'The fraction of gross rock volume assigned to a free gas cap in the simple analytic method, entered between 0 and 1. It is the analytic stand-in for a GOC. Leaving it unset on an oil and gas case models undersaturated oil with no gas cap, and GIIP comes back as zero.',
        ],
        [
          'GIIP (gas initially in place)',
          'The gas volume in the reservoir at discovery. In field units GIIP equals hydrocarbon pore volume times 43560 divided by Bg; in metric it is hydrocarbon pore volume divided by Bg. It is reported in Bscf or MMsm3.',
        ],
        [
          'GOC (gas oil contact)',
          'The depth separating the gas cap from the oil leg. In a structural method the engine splits the reservoir column at this depth so gas and oil occupy separate pore volume. Contacts are interpreted in the Z convention of the surface.',
        ],
        [
          'GRV (gross rock volume)',
          'The total rock volume between the top and base of the reservoir within the hydrocarbon-bearing zone. Reported in acre-ft or m3. In a structural method it is integrated cell by cell against the contacts, so the shape of the structure changes the answer.',
        ],
        [
          'GWC (gas water contact)',
          'The depth below which the reservoir is water bearing in a gas-only case. When the fluid type is gas, the contact field is labelled GWC and bounds the base of the gas column.',
        ],
        [
          'HCPV (hydrocarbon pore volume)',
          'The pore volume actually occupied by hydrocarbon. Computed as GRV times NTG times porosity times one minus Sw. It is the quantity both STOOIP and GIIP are derived from.',
        ],
        [
          'Hull masking',
          'The rule that discards an integration cell whose nearest surface control point lies further away than a hull radius, set at twice the mean sample spacing. It prevents the interpolator from inventing structure in parts of the bounding box the survey never covered.',
        ],
        [
          'Hypsometric curve',
          'The cumulative area against depth relationship of a surface, precomputed once as rock volume between the top surface and any depth level. It lets a Monte Carlo loop evaluate GRV for a sampled contact as a lookup rather than rebuilding the grid on every realisation.',
        ],
        [
          'IDW (inverse distance weighting)',
          'The fast interpolation option. Each grid node is a weighted average of nearby control points with weights falling off with distance. It carries no spatial model and is the sensible choice while iterating on a large surface.',
        ],
        [
          'Kriging (ordinary)',
          'The recommended interpolation option. It solves for weights using a variogram fitted from the data, spherical with zero nugget by default, which makes it exact at the control points and gives a smoother, better-behaved surface between them.',
        ],
        [
          'NRV (net rock volume)',
          'Gross rock volume reduced by net-to-gross, so the reservoir-quality rock only. Reported alongside GRV in the deterministic results and the PDF volumetrics table.',
        ],
        [
          'NTG (net to gross)',
          'The fraction of the gross interval that is reservoir quality rock, between 0 and 1. Enter gross thickness in the geometry input and let NTG make the net cut, otherwise the cut is applied twice.',
        ],
        [
          'OWC (oil water contact)',
          'The depth below which the reservoir is water bearing in an oil case. In a structural method it bounds the base of the oil column, and moving it moves the volume. In the simple method it has no effect.',
        ],
        [
          'P90, P50, P10',
          'The low, mid and high cases of a probabilistic study, on the petroleum convention where the P number is the probability of exceeding the value. P90 is the low or proven case, P50 the probable case and P10 the high or possible case.',
        ],
        [
          'P10 to P90 ratio',
          'The high case divided by the low case, printed in the technical and audit reports as a single-number measure of how wide the uncertainty is.',
        ],
        [
          'Pg (probability of geological success)',
          'The geologic chance of success, computed as the product of the independent risk factors for trap, reservoir, charge and seal, plus an optional other factor, each between 0 and 1. Risked mean volume is Pg times the unrisked mean.',
        ],
        [
          'Pore volume',
          'Net rock volume times porosity, so the total void space in the reservoir-quality rock, water and hydrocarbon together. Multiplying by one minus Sw gives hydrocarbon pore volume.',
        ],
        [
          'Realisation',
          'One iteration of a Monte Carlo run: a single correlated draw from every active distribution and the volume that draw produces. The audit report prints the inputs of the realisation sitting at the median of the sorted target volume.',
        ],
        [
          'Recovery factor',
          'The percentage of in-place volume expected to be produced, entered separately for oil and gas. Recoverable volume is in-place volume times the recovery factor over 100. Enter it as a percentage, so 25 means a quarter of the in-place volume.',
        ],
        [
          'STOOIP (stock tank oil originally in place)',
          'The oil volume in the reservoir at discovery, expressed at stock tank conditions. In field units it equals hydrocarbon pore volume times 7758 divided by Bo; in metric it is hydrocarbon pore volume divided by Bo. Reported in STB or MMstb.',
        ],
        [
          'Sw (water saturation)',
          'The fraction of pore space occupied by water, between 0 and 1. Hydrocarbon saturation is one minus Sw. An Sw of 1 or more leaves no hydrocarbon pore volume and is flagged by the validator.',
        ],
        [
          'TVDSS (true vertical depth subsea)',
          'Vertical depth measured downward from mean sea level, so deeper means a larger positive number. A surface in TVDSS is imported with the Depth convention.',
        ],
        [
          'TWT (two way time)',
          'Seismic travel time down to a reflector and back, in milliseconds. A TWT grid is not a length surface, so volumes derived from it are meaningless. The import dialog labels TWT candidates and warns before you use one.',
        ],
        [
          'Variogram',
          'The model of how surface values decorrelate with separation distance, described by a nugget, a sill and a range. Ordinary kriging fits a spherical variogram from the data by default, with the range set from the extent of the survey.',
        ],
        [
          'zConvention',
          'The per-surface declaration of what the Z values mean, recorded at import. Elevation means Z is negative downward, and depth means Z is positive downward as TVDSS. The engine converts both the surface and your contacts to a common downward depth using this setting, and it governs the calculation regardless of any label shown elsewhere in the interface.',
        ],
      ]}
    />

    <H2>The two expressions everything reduces to</H2>
    <P>
      Almost every term above appears in one of these two lines, which is the fastest way to see how they
      relate.
    </P>
    <Formula>HCPV = GRV x NTG x porosity x (1 - Sw)</Formula>
    <Formula>
      STOOIP = HCPV x 7758 / Bo (field) or HCPV / Bo (metric); GIIP = HCPV x 43560 / Bg (field) or HCPV / Bg (metric)
    </Formula>
    <P>
      The field constants convert acre-ft to surface units: 7758 barrels per acre-ft and 43560 cubic feet per
      acre-ft. In metric the hydrocarbon pore volume is already in cubic metres, so only the formation volume
      factor divides. See the Calculations reference for the full derivations, and note that the same two
      lines are printed in the methodology block of every generated report. Use <Code>Bg</Code> in the unit
      your PVT report quotes and let the app convert.
    </P>
  </Article>
);

export default Glossary;
