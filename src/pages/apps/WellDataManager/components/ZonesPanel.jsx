// Petrophysics zones of a well, read-only in Well Data Manager
// (AppUpgrade WDM-U2-008). Zones and their published summaries are
// written by Petrophysics Studio (geo_wells_zones.properties, only by an
// explicit Publish); here they are shown beside the rest of the well so
// the data manager sees what the interpretation produced. Depths in the
// display unit; averages as published, net-thickness weighted.

import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fmtDepth, unitText } from '../engine/displayUnits';
import { appPath } from '@/components/wells/appLinks';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const thCls = 'text-left font-medium text-pl-muted pr-4 pb-1 whitespace-nowrap';
const tdCls = 'pr-4 py-0.5 text-pl-text whitespace-nowrap';
const frac = (v, d = 3) => (Number.isFinite(Number(v)) && v !== null ? Number(v).toFixed(d) : EMPTY_VALUE);

export default function ZonesPanel({ zones, well, tops = [], unit = 'm', appPaths = {} }) {
  const topName = (id) => (id ? (tops || []).find((t) => t.id === id)?.name || 'a top no longer on the well' : 'TD');
  const u = unitText(unit);
  const petroHref = `${appPath('petrophysics-studio', appPaths)}?well=${encodeURIComponent(well.id)}`;
  if (zones === null) return <Loader2 className="w-4 h-4 animate-spin text-pl-muted" />;
  return (
    <div className="space-y-2" data-testid="wdm-zones-tab">
      <p className="text-[11px] text-pl-muted">
        Zones are defined and published in Petrophysics Studio; they are read-only here.{' '}
        <Link to={petroHref} className="text-pl-primary-text hover:underline" data-testid="wdm-zones-open-petro">Open in Petrophysics Studio</Link>
      </p>
      {!zones.length ? <p className="text-xs text-pl-muted">No zones on this well.</p> : (
        <table className="text-xs" data-testid="wdm-zones-table">
          <thead>
            <tr>
              <th className={thCls}>Zone</th>
              <th className={thCls}>Top ({u} MD)</th>
              <th className={thCls}>Base ({u} MD)</th>
              <th className={thCls}>Gross ({u})</th>
              <th className={thCls}>Net ({u})</th>
              <th className={thCls}>N/G</th>
              <th className={thCls} title="Net-weighted average effective porosity">PHIE avg</th>
              <th className={thCls} title="Net-weighted average water saturation">Sw avg</th>
              <th className={thCls} title="Net-weighted average shale volume">Vsh avg</th>
              <th className={thCls} title="Geometric mean permeability over net">k (mD)</th>
              <th className={thCls}>Published</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => {
              const p = z.properties || {};
              const published = !!p.published_at;
              return (
                <tr key={z.id} data-testid="wdm-zone-row" data-zone={z.name}>
                  <td className={tdCls} title={p.from_tops ? `Cut from ${topName(p.from_tops.top)} to ${topName(p.from_tops.base)}` : ''}>{z.name}</td>
                  <td className={tdCls}>{fmtDepth(z.top_md_m, u)}</td>
                  <td className={tdCls}>{fmtDepth(z.base_md_m, u)}</td>
                  <td className={tdCls}>{published ? fmtDepth(p.gross_m, u, 2) : EMPTY_VALUE}</td>
                  <td className={tdCls}>{published ? fmtDepth(p.net_m, u, 2) : EMPTY_VALUE}</td>
                  <td className={tdCls}>{published ? frac(p.ntg, 2) : EMPTY_VALUE}</td>
                  <td className={tdCls}>{published ? frac(p.phi_avg) : EMPTY_VALUE}</td>
                  <td className={tdCls}>{published ? frac(p.sw_avg) : EMPTY_VALUE}</td>
                  <td className={tdCls}>{published ? frac(p.vsh_avg) : EMPTY_VALUE}</td>
                  <td className={tdCls}>{published && p.k_gm_md != null ? frac(p.k_gm_md, 1) : EMPTY_VALUE}</td>
                  <td className={`${tdCls} text-pl-muted`} data-testid={`wdm-zone-published-${z.name}`}>
                    {published ? `${String(p.published_at).slice(0, 10)}${p.interpretation_name ? `, ${p.interpretation_name}` : ''}` : 'not published'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {zones.some((z) => z.properties?.cutoffs) && (
        <p className="text-[11px] text-pl-muted">
          Net uses each zone's published cutoffs (porosity, shale volume and water saturation); hover a zone name to see the tops it was cut from.
        </p>
      )}
    </div>
  );
}
