// The Log view: the well as a strip log (depth downward) and the
// d-exponent surveillance beside it (upgrades U2-001 and U2-006). The
// depth winNow and the paper scale are chosen here; the tracks come from
// services/stripLog.js and the d-exponent from services/dexponent.js.

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import StripLog from './striplog/StripLog';
import { pxPerMetreAtScale } from './striplog/geometry';
import { fmtDepth, depthToDisplay, depthFromDisplay, parseFieldNumber } from '../services/units';
import { NORMAL_UNITS, normalFromKgM3, dxcSummary } from '../services/dexponent';

const SCALES = [{ key: 'fit', label: 'fit the window' }, { key: '200', label: '1:200' }, { key: '500', label: '1:500' }, { key: '1000', label: '1:1000' }, { key: '2000', label: '1:2000' }];

export default function LogView({ win, tracks, markers, dxc, dxcSettings, onSaveDxc, unit, onStatus, title = '', toolbarSlot = null, belowSlot = null }) {
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [scaleKey, setScaleKey] = useState('fit');
  const [normal, setNormal] = useState('');
  const [normalUnit, setNormalUnit] = useState('');
  const [trendFrom, setTrendFrom] = useState('');
  const [trendTo, setTrendTo] = useState('');
  const sel = 'bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-xs text-pl-text';
  const d = (m) => (Number.isFinite(m) ? depthToDisplay(m, unit).toFixed(unit === 'ft' ? 0 : 1) : '');

  const winNow = useMemo(() => {
    if (!win) return null;
    const f = fromText.trim() === '' ? NaN : depthFromDisplay(parseFieldNumber(fromText), unit);
    const t = toText.trim() === '' ? NaN : depthFromDisplay(parseFieldNumber(toText), unit);
    const topM = Number.isFinite(f) ? f : win.topM;
    const baseM = Number.isFinite(t) ? t : win.baseM;
    return baseM > topM ? { topM, baseM } : { ...win, error: 'The base of the depth winNow must be below its top.' };
  }, [win, fromText, toText, unit]);
  const heightPx = useMemo(() => {
    if (!winNow) return 0;
    if (scaleKey === 'fit') return 620;
    return Math.round(Math.max(200, Math.min(12000, (winNow.baseM - winNow.topM) * pxPerMetreAtScale(Number(scaleKey)))));
  }, [winNow, scaleKey]);

  const saveDxc = async () => {
    try {
      const v = normal.trim() === '' ? (dxcSettings ? dxcSettings.normalValue : NaN) : parseFieldNumber(normal);
      const u = normalUnit || (dxcSettings ? dxcSettings.normalUnit : '');
      const tf = trendFrom.trim() === '' ? (dxcSettings ? dxcSettings.trendFromMdM : null) : depthFromDisplay(parseFieldNumber(trendFrom), unit);
      const tt = trendTo.trim() === '' ? (dxcSettings ? dxcSettings.trendToMdM : null) : depthFromDisplay(parseFieldNumber(trendTo), unit);
      await onSaveDxc({ normalValue: v, normalUnit: u, trendFromMdM: tf, trendToMdM: tt });
      setNormal(''); setTrendFrom(''); setTrendTo('');
    } catch (e) { onStatus?.(e.message); }
  };
  const skippedText = dxc ? Object.entries(dxc.skipped).map(([why, n]) => `${n}: ${why}`).join('; ') : '';

  return (
    <div className="p-4 space-y-3" data-testid="ws-log">
      <div className="flex items-end gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-pl-text">Strip log</h2>
        <label className="text-[10px] text-pl-muted">From ({unit} MD)<br /><input className={`${sel} w-20`} inputMode="decimal" value={fromText} placeholder={winNow ? d(winNow.topM) : ''} onChange={(e) => setFromText(e.target.value)} data-testid="ws-log-from" /></label>
        <label className="text-[10px] text-pl-muted">To ({unit} MD)<br /><input className={`${sel} w-20`} inputMode="decimal" value={toText} placeholder={winNow ? d(winNow.baseM) : ''} onChange={(e) => setToText(e.target.value)} data-testid="ws-log-to" /></label>
        <label className="text-[10px] text-pl-muted">Vertical scale<br />
          <select className={sel} value={scaleKey} onChange={(e) => setScaleKey(e.target.value)} data-testid="ws-log-scale">{SCALES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </label>
        {toolbarSlot}
      </div>
      {winNow && winNow.error && <div className="text-[11px] text-pl-warning-text" data-testid="ws-log-window-error">{winNow.error}</div>}

      <section className="space-y-1" data-testid="ws-dxc">
        <h3 className="text-xs font-semibold text-pl-text">d-exponent</h3>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="text-[10px] text-pl-muted" title="The normal (hydrostatic) pore pressure gradient of the area, as a mud weight or a gradient">Normal pore pressure gradient<br />
            <input className={`${sel} w-20`} inputMode="decimal" value={normal} placeholder={dxcSettings ? String(dxcSettings.normalValue) : ''} onChange={(e) => setNormal(e.target.value)} data-testid="ws-dxc-normal" /></label>
          <label className="text-[10px] text-pl-muted">Unit<br />
            <select className={sel} value={normalUnit || (dxcSettings ? dxcSettings.normalUnit : '')} onChange={(e) => setNormalUnit(e.target.value)} data-testid="ws-dxc-normal-unit"><option value="">declare the unit</option>{Object.keys(NORMAL_UNITS).map((u) => <option key={u} value={u}>{u}</option>)}</select>
          </label>
          <label className="text-[10px] text-pl-muted" title="The interval you judge normally pressured; the trend is fitted through its dc points">Normal trend from ({unit} MD)<br />
            <input className={`${sel} w-20`} inputMode="decimal" value={trendFrom} placeholder={dxcSettings && Number.isFinite(dxcSettings.trendFromMdM) ? d(dxcSettings.trendFromMdM) : ''} onChange={(e) => setTrendFrom(e.target.value)} data-testid="ws-dxc-trend-from" /></label>
          <label className="text-[10px] text-pl-muted">to ({unit} MD)<br />
            <input className={`${sel} w-20`} inputMode="decimal" value={trendTo} placeholder={dxcSettings && Number.isFinite(dxcSettings.trendToMdM) ? d(dxcSettings.trendToMdM) : ''} onChange={(e) => setTrendTo(e.target.value)} data-testid="ws-dxc-trend-to" /></label>
          <Button size="sm" variant="outline" onClick={saveDxc} data-testid="ws-dxc-save">Record settings</Button>
        </div>
        {dxc && (
          <div className="text-[11px] text-pl-text space-y-0.5">
            <div data-testid="ws-dxc-settings">{dxcSettings ? `In force: normal gradient ${dxcSettings.normalValue} ${dxcSettings.normalUnit} (${normalFromKgM3(dxcSettings.normalMwKgM3, 'sg').toFixed(3)} sg)${Number.isFinite(dxcSettings.trendFromMdM) ? `, normal trend from ${fmtDepth(dxcSettings.trendFromMdM, unit)} to ${fmtDepth(dxcSettings.trendToMdM, unit)} MD` : ', no normal trend interval'}.` : 'No settings recorded: the d-exponent is shown uncorrected.'}</div>
            <div data-testid="ws-dxc-summary">{dxcSummary(dxc, (m) => fmtDepth(m, unit))}</div>
            {dxc.notes.map((n) => <div key={n} className="text-pl-warning-text" data-testid="ws-dxc-note">{n}</div>)}
            {skippedText && <div className="text-pl-muted" data-testid="ws-dxc-skipped">Rows not computed: {skippedText}.</div>}
            <div className="text-pl-muted">d is log(R / 60N) over log(12W / 10^6 D) (Jorden and Shirley); dc is d times the normal gradient over the mud weight in use (Rehm and McClendon). No pore pressure is computed here.</div>
          </div>
        )}
      </section>

      {winNow && !winNow.error && tracks.length > 0 ? (
        <div className="overflow-auto max-h-[75vh] max-w-full" data-testid="ws-log-scroll">
          <StripLog topM={winNow.topM} baseM={winNow.baseM} heightPx={heightPx} tracks={tracks} markers={markers} depthUnit={unit} toDisplay={(m) => depthToDisplay(m, unit)} title={title} />
        </div>
      ) : <div className="text-xs text-pl-muted" data-testid="ws-log-empty">Nothing to draw yet. Record bit depths, descriptions or tops, or import the mudlogging data.</div>}

      {dxc && dxc.flagged.length > 0 && (
        <table className="text-xs text-pl-text" data-testid="ws-dxc-flagged">
          <thead><tr className="text-[10px] uppercase text-pl-muted text-left"><th className="pr-3">Depth</th><th className="pr-3">d</th><th className="pr-3">dc</th><th className="pr-3">Normal dc</th><th className="pr-3">dc over normal</th></tr></thead>
          <tbody>{dxc.flagged.slice(0, 30).map((r) => <tr key={r.mdM}><td className="pr-3">{fmtDepth(r.mdM, unit)}</td><td className="pr-3">{r.d.toFixed(2)}</td><td className="pr-3">{r.dc.toFixed(2)}</td><td className="pr-3">{r.normalDc.toFixed(2)}</td><td className="pr-3">{r.ratio.toFixed(2)}</td></tr>)}</tbody>
        </table>
      )}
      {belowSlot}
    </div>
  );
}
