// Area/depth table input and export (ReservoirCalc Pro upgrade U2-001).
// Paste the table (depth, top area, optional base area), or derive it from
// the selected top surface; the volumes integrate it against the contacts.
import React, { useState } from 'react';
import { saveAs } from 'file-saver';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { parseAreaDepthText, areaDepthCsv } from '../services/areaDepth';
import { ContactVolumetricsEngine } from '../services/ContactVolumetricsEngine';
import { loadSettings } from '../hooks/useReservoirSettings';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const fmt = (v, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)).toLocaleString('en-US') : EMPTY_VALUE);

export default function AreaDepthPanel() {
  const { state, updateInputs, logEvent } = useReservoirCalc();
  const ad = state.inputs.areaDepth || null;
  const field = state.unitSystem !== 'metric';
  const len = field ? 'ft' : 'm';
  const areaU = field ? 'acres' : 'km²';
  const [text, setText] = useState(ad?.text || '');
  const [msg, setMsg] = useState(null);

  const read = () => {
    const r = parseAreaDepthText(text);
    if (!r.ok) { setMsg({ error: true, lines: [r.reason] }); return; }
    updateInputs({ areaDepth: { ...(ad || {}), rows: r.rows, text } });
    setMsg({ error: false, lines: [`Read ${r.rows.length} rows${r.hasBase ? ' with a base area column' : ''}.`, ...r.notes] });
    logEvent?.('Area/depth table read', `${r.rows.length} rows`);
  };

  const fromSurface = () => {
    const top = state.surfaces?.[state.inputs.topSurfaceId];
    if (!top) { setMsg({ error: true, lines: ['Select a top surface in the Surf tab first; the table is measured from it.'] }); return; }
    const settings = loadSettings();
    const res = ContactVolumetricsEngine.areaDepthTable({
      topSurface: top, constantThickness: parseFloat(state.inputs.thickness), unitSystem: state.unitSystem,
      options: { resolution: settings.gridResolution, interpolation: settings.interpolationMethod },
    }, 40);
    if (res.error) { setMsg({ error: true, lines: [res.error] }); return; }
    const t = ['depth,area_top,area_base', ...res.rows.map((r) => `${+r.depth.toFixed(3)},${+r.areaTop.toPrecision(8)},${+r.areaBase.toPrecision(8)}`)].join('\n');
    setText(t);
    updateInputs({ areaDepth: { ...(ad || {}), rows: res.rows, text: t } });
    setMsg({ error: false, lines: [`Measured ${res.rows.length} levels from "${top.name}" with the gross thickness as the base (${res.gridding === 'lattice' ? 'on the registry grid\'s own nodes' : `gridded by ${res.gridding}`}).`] });
  };

  const exportCsv = () => {
    if (!ad?.rows?.length) return;
    saveAs(new Blob([areaDepthCsv(ad.rows, state.unitSystem)], { type: 'text/csv' }), `area_depth_${(state.reservoirName || 'reservoir').replace(/\s+/g, '_')}.csv`);
  };

  return (
    <div className="space-y-2" data-testid="rcp-areadepth">
      <Label className="text-xs font-bold text-pl-text">Area/depth table</Label>
      <p className="text-[10px] text-pl-muted">
        One row per depth: TVDSS elevation ({len}, negative below datum), area enclosed by the top ({areaU}), and optionally by the base.
        Without a base column the gross thickness below sets the base. The contacts cut the table.
      </p>
      <textarea
        data-testid="rcp-ad-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={`depth, area_top${'\n'}-1500, 0${'\n'}-1550, 120${'\n'}-1600, 410`}
        className="w-full rounded border border-pl-border bg-pl-surface px-2 py-1 font-mono text-[11px] text-pl-text"
      />
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" className="h-7 text-[11px]" data-testid="rcp-ad-read" onClick={read}>Read table</Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px]" data-testid="rcp-ad-from-surface" onClick={fromSurface}>From the top surface</Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px]" data-testid="rcp-ad-export" onClick={exportCsv} disabled={!ad?.rows?.length}>Export CSV</Button>
      </div>
      {msg && (
        <div data-testid="rcp-ad-msg" className={`text-[10px] rounded border px-2 py-1 ${msg.error ? 'border-pl-danger/40 text-pl-danger-text' : 'border-pl-border text-pl-muted'}`}>
          {msg.lines.map((l) => <p key={l}>{l}</p>)}
        </div>
      )}
      {ad?.rows?.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded border border-pl-border">
          <table className="w-full text-[10px]" data-testid="rcp-ad-table">
            <thead className="bg-pl-sunken text-pl-muted">
              <tr><th className="px-1 text-right">Depth ({len})</th><th className="px-1 text-right">Top ({areaU})</th><th className="px-1 text-right">Base ({areaU})</th></tr>
            </thead>
            <tbody>
              {ad.rows.map((r) => (
                <tr key={r.depth} className="border-t border-pl-border">
                  <td className="px-1 text-right font-mono">{fmt(r.depth, 1)}</td>
                  <td className="px-1 text-right font-mono">{fmt(r.areaTop, field ? 1 : 4)}</td>
                  <td className="px-1 text-right font-mono">{r.areaBase === null || r.areaBase === undefined ? EMPTY_VALUE : fmt(r.areaBase, field ? 1 : 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
