// QC & volumes view (Earth Modeling G8.2): the numbers behind the
// model, never silent — well-tie residuals, clamp report, population
// provenance (incl. every fallback), and the per-zone per-block volume
// tables. Tabular workstation surface; volumes in the chosen units
// (SI internal); contacts and FVF per zone since T1.

import React from 'react';
import { fmtVolume, volumeUnitLabel, fmtDepth } from '../services/units';
import { describeProvenance } from '../services/propertyKriging';
import { hasFluids } from '../services/modelBuild';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const th = 'px-2 py-1 text-left text-[10px] uppercase tracking-wider text-pl-muted font-medium';
const td = 'px-2 py-1 text-xs text-pl-text whitespace-nowrap';
const card = 'rounded border border-pl-border bg-pl-surface';


export default function QcPanel({ built, surfaceNames = [], depthUnit = 'm', volumeUnits = 'metric' }) {
  const u = depthUnit;
  const vu = (col) => volumeUnitLabel(col, volumeUnits);
  if (!built) {
    return (
      <div className="h-full flex items-center justify-center text-pl-muted text-sm" data-testid="em-qc-empty">
        Build the model to see QC and volumes.
      </div>
    );
  }
  const blockKeys = Object.keys(built.zones[0]?.volumes || { total: 1 })
    .sort((a, b) => (a === 'total' ? 1 : b === 'total' ? -1 : a.localeCompare(b)));

  return (
    <div className="h-full overflow-auto p-3 space-y-3" data-testid="em-qc">
      <div className="grid grid-cols-2 gap-3">
        <div className={card}>
          <div className="px-2 py-1.5 text-xs font-semibold text-pl-text border-b border-pl-border">Clamp report (stacking rule: depth-down monotonic)</div>
          <table className="w-full">
            <thead><tr><th className={th}>Surface</th><th className={th}>Clamped nodes</th></tr></thead>
            <tbody data-testid="em-clamps">
              {built.counts.map((c, i) => (
                <tr key={i} className="border-t border-pl-border">
                  <td className={td}>{surfaceNames[i] || `Surface ${i + 1}`}</td>
                  <td className={td} data-testid={`em-clamp-${i}`}>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={card}>
          <div className="px-2 py-1.5 text-xs font-semibold text-pl-text border-b border-pl-border">Fault blocks</div>
          <table className="w-full">
            <thead><tr><th className={th}>Block</th><th className={th}>Nodes</th></tr></thead>
            <tbody data-testid="em-census">
              {Object.entries(built.census).map(([lab, n]) => (
                <tr key={lab} className="border-t border-pl-border">
                  <td className={td}>{lab === '0' || lab === 0 ? 'Block 0 (outside polygons)' : `Block ${lab}`}</td>
                  <td className={td} data-testid={`em-census-${lab}`}>{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {((built.notes || []).length > 0 || (built.propertyClamps || []).length > 0) && (
        <div className={card} data-testid="em-build-notes">
          <div className="px-2 py-1.5 text-xs font-semibold text-pl-text border-b border-pl-border">Build notes: what the model assumed or held</div>
          <ul className="px-4 py-1.5 list-disc text-[11px] text-pl-text space-y-0.5">
            {(built.propertyClamps || []).map((c) => (
              <li key={`${c.zone}-${c.prop}`} className="text-pl-warning-text">{c.zone} {c.prop}: {c.nodes} node{c.nodes === 1 ? '' : 's'} extrapolated outside 0 to 1 and held at the limit (a trend or kriging beyond the wells).</li>
            ))}
            {(built.notes || []).map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      )}

      {built.adjustment && (
        <div className={card} data-testid="em-adjust-report">
          <div className="px-2 py-1.5 text-xs font-semibold text-pl-text border-b border-pl-border">
            Well adjustment: radius {fmtDepth(built.adjustment.radius, u, 0)} {u}
          </div>
          <table className="w-full">
            <thead><tr><th className={th}>Surface</th><th className={th}>Ties</th><th className={th}>Max residual before ({u})</th><th className={th}>After ({u})</th></tr></thead>
            <tbody>
              {built.adjustment.report.map((r) => (
                <tr key={r.surface} className="border-t border-pl-border">
                  <td className={td}>{surfaceNames[r.surface] || `Surface ${r.surface + 1}`}</td>
                  <td className={td}>{r.ties}</td>
                  <td className={td}>{fmtDepth(r.before, u, 2)}</td>
                  <td className={td} data-testid={`em-adjust-after-${r.surface}`}>{r.adjusted ? fmtDepth(r.after, u, 2) : 'not adjusted'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={card}>
        <div className="px-2 py-1.5 text-xs font-semibold text-pl-text border-b border-pl-border">
          Well ties: residual = pick TVDSS minus surface ({u}); positive means the pick is deeper than the surface
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Well</th><th className={th}>Top</th><th className={th}>MD ({u})</th>
              <th className={th}>TVDSS ({u})</th><th className={th}>Surface z ({u})</th>
              {built.adjustment && <th className={th}>Before ({u})</th>}
              <th className={th} data-testid="em-ties-unit">Residual ({u})</th>
            </tr>
          </thead>
          <tbody data-testid="em-ties">
            {built.ties.map((t) => (
              <tr key={`${t.well}-${t.top}`} className="border-t border-pl-border">
                <td className={td}>{t.well}</td>
                <td className={td}>{t.top}</td>
                <td className={td}>{fmtDepth(t.md, u, 1)}</td>
                <td className={td}>{fmtDepth(t.tvdss, u, 2)}</td>
                <td className={td}>{t.surfaceZ === null ? 'off grid' : fmtDepth(t.surfaceZ, u, 2)}</td>
                {built.adjustment && <td className={td}>{t.residualBeforeM === undefined || t.residualBeforeM === null ? EMPTY_VALUE : fmtDepth(t.residualBeforeM, u, 2)}</td>}
                <td className={`${td} ${t.residualM !== null && Math.abs(t.residualM) > 10 ? 'text-pl-warning-text' : ''}`}
                  data-testid={`em-tie-${t.well}-${t.top}`}>
                  {t.residualM === null ? EMPTY_VALUE : fmtDepth(t.residualM, u, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {built.zones.map((zone) => (
        <div className={card} key={zone.name}>
          <div className="px-2 py-1.5 text-xs font-semibold text-pl-text border-b border-pl-border">
            {zone.name}: volumes and population provenance
          </div>
          {Object.keys(zone.fluids?.blocks || {}).length > 0 && (
            <div className="px-2 py-1 text-[11px] text-pl-muted border-b border-pl-border" data-testid={`em-blockcontacts-${zone.name.replace(/\s+/g, '-').toLowerCase()}`}>
              Contacts per fault block: {Object.entries(zone.fluids.blocks).map(([lab, b]) => `block ${lab}${b.goc != null ? ` GOC ${fmtDepth(b.goc, u, 1)} ${u}` : ''}${b.owc != null ? ` OWC ${fmtDepth(b.owc, u, 1)} ${u}` : ''}`).join('; ')}. Other blocks use the zone contacts{Number.isFinite(zone.fluids?.owc) ? '' : ' (the zone has no OWC, so their whole column counts as hydrocarbon)'}.
            </div>
          )}
          {!Number.isFinite(zone.fluids?.owc) && !Object.values(zone.fluids?.blocks || {}).some((b) => Number.isFinite(b?.owc)) && (
            <div className="px-2 py-1 text-[11px] text-pl-warning-text border-b border-pl-border" data-testid={`em-nocontact-${zone.name.replace(/\s+/g, '-').toLowerCase()}`}>
              No OWC given: the whole zone counts as hydrocarbon. Enter the contacts in the dock for a true HCPV.
            </div>
          )}
          {zone.openEdge?.open && (
            <div className="px-2 py-1 text-[11px] text-pl-warning-text border-b border-pl-border" data-testid={`em-openedge-${zone.name.replace(/\s+/g, '-').toLowerCase()}`}>
              The hydrocarbon leg reaches the model edge at {zone.openEdge.nodes} node{zone.openEdge.nodes === 1 ? '' : 's'}: the accumulation is not closed inside the frame, so these volumes depend on where the frame or boundary stops. Tick bound the leg by the closure and spill in the dock, or check the spill point in Mapping &amp; Surface Studio.
            </div>
          )}
          {zone.fluids?.gasZone && (
            <div className="px-2 py-1 text-[11px] text-pl-muted border-b border-pl-border" data-testid={`em-gaszone-${zone.name.replace(/\s+/g, '-').toLowerCase()}`}>
              Gas zone (Bg with no Bo and no GOC): gas from the zone top down to the contact.
            </div>
          )}
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Block</th><th className={th}>Cells</th><th className={th} data-testid="em-vol-unit-bulk" title="Gross rock volume (GRV): zone thickness times cell area">Bulk ({vu('bulk_m3')})</th>
                <th className={th} title="Net rock volume (NRV): GRV times net to gross">Net ({vu('net_m3')})</th><th className={th} title="Pore volume: NRV times porosity">Pore ({vu('pore_m3')})</th><th className={th} data-testid="em-vol-unit-hcpv" title="Hydrocarbon pore volume at reservoir conditions: pore volume times (1 - Sw), above the contact">HCPV ({vu('hcpv_m3')})</th>
                {hasFluids(zone.fluids) && (
                  <>
                    <th className={th}>Gas HCPV ({vu('gas_hcpv_m3')})</th><th className={th}>Oil HCPV ({vu('oil_hcpv_m3')})</th>
                    {zone.fluids?.bo != null && <th className={th} data-testid="em-vol-unit-stoiip">STOIIP ({vu('stoiip_m3')})</th>}
                    {zone.fluids?.bg != null && <th className={th} data-testid="em-vol-unit-giip" title="Free gas initially in place (gas cap or gas zone); solution gas is not included">GIIP, free gas ({vu('giip_m3')})</th>}
                  </>
                )}
              </tr>
            </thead>
            <tbody data-testid={`em-vol-${zone.name.replace(/\s+/g, '-').toLowerCase()}`}>
              {blockKeys.filter((k) => zone.volumes[k]).map((k) => (
                <tr key={k} className={`border-t border-pl-border ${k === 'total' ? 'font-semibold text-pl-text' : ''}`}>
                  <td className={td}>{k === 'total' ? 'TOTAL' : `Block ${k}`}</td>
                  <td className={td}>{zone.volumes[k].cells}</td>
                  <td className={td} data-testid={`em-vol-${zone.name.replace(/\s+/g, '-').toLowerCase()}-${k}-bulk`}>{fmtVolume(zone.volumes[k].bulk_m3, 'bulk_m3', volumeUnits)}</td>
                  <td className={td}>{fmtVolume(zone.volumes[k].net_m3, 'net_m3', volumeUnits)}</td>
                  <td className={td}>{fmtVolume(zone.volumes[k].pore_m3, 'pore_m3', volumeUnits)}</td>
                  <td className={td} data-testid={`em-vol-${zone.name.replace(/\s+/g, '-').toLowerCase()}-${k}-hcpv`}>{fmtVolume(zone.volumes[k].hcpv_m3, 'hcpv_m3', volumeUnits)}</td>
                  {hasFluids(zone.fluids) && (
                    <>
                      <td className={td}>{fmtVolume(zone.volumes[k].gas_hcpv_m3, 'gas_hcpv_m3', volumeUnits)}</td>
                      <td className={td}>{fmtVolume(zone.volumes[k].oil_hcpv_m3, 'oil_hcpv_m3', volumeUnits)}</td>
                      {zone.fluids?.bo != null && <td className={td} data-testid={`em-vol-${zone.name.replace(/\s+/g, '-').toLowerCase()}-${k}-stoiip`}>{fmtVolume(zone.volumes[k].stoiip_m3, 'stoiip_m3', volumeUnits)}</td>}
                      {zone.fluids?.bg != null && <td className={td} data-testid={`em-vol-${zone.name.replace(/\s+/g, '-').toLowerCase()}-${k}-giip`}>{fmtVolume(zone.volumes[k].giip_m3, 'giip_m3', volumeUnits)}</td>}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {zone.range && (
            <div className="px-2 py-1 text-[11px] text-pl-text border-t border-pl-border" data-testid={`em-range-${zone.name.replace(/\s+/g, '-').toLowerCase()}`}>
              Property range from the kriging variance (fully correlated): HCPV P90 {fmtVolume(zone.range.p90.hcpv_m3, 'hcpv_m3', volumeUnits)},
              P50 {fmtVolume(zone.range.p50.hcpv_m3, 'hcpv_m3', volumeUnits)}, P10 {fmtVolume(zone.range.p10.hcpv_m3, 'hcpv_m3', volumeUnits)} {vu('hcpv_m3')}
              {zone.range.p50.stoiip_m3 != null && <>; STOIIP P90 {fmtVolume(zone.range.p90.stoiip_m3, 'stoiip_m3', volumeUnits)}, P50 {fmtVolume(zone.range.p50.stoiip_m3, 'stoiip_m3', volumeUnits)}, P10 {fmtVolume(zone.range.p10.stoiip_m3, 'stoiip_m3', volumeUnits)} {vu('stoiip_m3')}</>}
            </div>
          )}
          <div className="px-2 py-1.5 text-[11px] text-pl-muted border-t border-pl-border">
            {Object.entries(zone.provenance).map(([prop, rows]) => (
              <span key={prop} className={`block ${rows.some((r) => r.fellBack) ? 'text-pl-warning-text' : ''}`} data-testid={`em-prov-${zone.name.replace(/\s+/g, '-').toLowerCase()}-${prop}`}>
                <span className="text-pl-muted">{prop}:</span> {describeProvenance(rows)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
