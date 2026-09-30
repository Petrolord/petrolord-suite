// SVG and PNG export of a stratigraphy chart with the reviewer header
// (STRAT-U1-014). `targetRef` points at an element holding the chart's <svg>.

import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { svgWithHeader, downloadSvg, downloadPng } from './chartExport';

const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';

/**
 * @param {Object} p
 * @param {React.RefObject<HTMLElement>} p.targetRef element containing the chart svg
 * @param {() => string[]} p.headerLines header lines at export time
 * @param {string} p.fileBase file name without extension
 * @param {(msg: string) => void} [p.onStatus]
 * @param {string} p.testIdPrefix
 * @param {boolean} [p.disabled]
 */
export default function ChartExportButtons({ targetRef, headerLines, fileBase, onStatus, testIdPrefix, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const page = () => {
    const svg = targetRef.current?.querySelector('svg');
    if (!svg) throw new Error('Nothing is drawn to export yet.');
    const width = Number(svg.getAttribute('width')) || svg.clientWidth || 600;
    const height = Number(svg.getAttribute('height')) || svg.clientHeight || 400;
    return svgWithHeader(svg.outerHTML, { width, height }, headerLines());
  };
  const run = async (kind) => {
    setBusy(true);
    try {
      const doc = page();
      if (kind === 'svg') downloadSvg(doc, `${fileBase}.svg`);
      else await downloadPng(doc, `${fileBase}.png`);
      onStatus?.(`Exported ${fileBase}.${kind} with its header (wells, terms, timescale, preparer, date, build).`);
    } catch (e) { onStatus?.(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-1" data-testid={`${testIdPrefix}-export`}>
      <button type="button" className={btnCls} disabled={disabled || busy} onClick={() => run('svg')} data-testid={`${testIdPrefix}-export-svg`} title="Vector chart with the reviewer header"><Download className="w-3.5 h-3.5" /> SVG</button>
      <button type="button" className={btnCls} disabled={disabled || busy} onClick={() => run('png')} data-testid={`${testIdPrefix}-export-png`} title="Image at twice screen resolution with the reviewer header and watermark"><Download className="w-3.5 h-3.5" /> PNG</button>
    </div>
  );
}
