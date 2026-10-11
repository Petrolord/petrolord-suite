// Ribbon primitives (Petrel-2015-style top chrome): a tab strip and the
// active tab's row of grouped tool controls. Hand-rolled rather than
// Radix Tabs — every control carries its own disabled state and the
// active tab persists per browser.
//
// Layout contract (compact ribbon, owner review of the demo videos
// 2026-10-11): every RibbonGroup lays its children out in THREE 20 px rows
// that fill column by column (CSS grid, column flow), with a slim caption
// line underneath. Controls are one compact height (18 px): small 16 px
// icons with the label beside them, selects and inputs with their label to
// the left. The ribbon body therefore has a fixed height however
// many controls a tab carries; a tab wider than the window scrolls
// sideways behind overflow chevrons, so every command stays reachable.

import React, {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const LS_KEY = 'seismolord.ribbon.v1';

/** Shared compact control classes (one height for every ribbon control). */
export const RIBBON_FIELD = `h-[18px] rounded bg-pl-surface border border-pl-border-strong text-pl-text
  px-1 py-0 text-[11px] leading-none disabled:opacity-40`;
const RIBBON_LABEL = 'inline-flex items-center gap-1 text-[10px] leading-none text-pl-muted whitespace-nowrap';

export function RibbonGroup({ label, children }) {
  return (
    <div
      className="shrink-0 flex flex-col justify-between px-2 pt-0.5 border-r border-pl-border last:border-r-0"
      data-ribbon-group={label}
    >
      <div
        className="grid grid-flow-col grid-rows-[repeat(3,20px)] auto-cols-max items-center justify-items-start gap-x-1.5"
        data-ribbon-rows="3"
      >
        {children}
      </div>
      <div className="text-[9px] leading-[10px] text-pl-muted text-center uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

/** Compact ribbon tool button: 16 px icon with the label beside it.
 *  `accent` tints an armed tool. */
export function RibbonButton({
  icon: Icon, label, onClick, active, disabled, title, accent = 'cyan', busy, testId }) {
  const ACCENTS = {
    cyan: 'border-pl-primary/60 bg-pl-primary/10 text-pl-primary-text',
    yellow: 'border-pl-warning/60 bg-pl-warning-bg text-pl-warning-text',
    orange: 'border-pl-warning/60 bg-pl-warning-bg text-pl-warning-text',
    red: 'border-pl-danger/60 bg-pl-danger-bg text-pl-danger-text',
    emerald: 'border-pl-success/60 bg-pl-success-bg text-pl-success-text',
  };
  return (
    <button data-testid={testId}
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      data-ribbon-control="button"
      className={`inline-flex items-center gap-1 h-[18px] px-1 rounded border
        text-[11px] leading-none whitespace-nowrap
        disabled:opacity-40 disabled:cursor-not-allowed
        ${active ? ACCENTS[accent] || ACCENTS.cyan
        : 'border-transparent text-pl-text hover:bg-pl-sunken/80 hover:border-pl-border'}`}
    >
      {Icon && <Icon className={`w-4 h-4 shrink-0 ${busy ? 'animate-spin' : ''}`} />}
      <span>{label}</span>
    </button>
  );
}

/** Small text toggle (Reverse colors, SEG normal, AGC...) at ribbon height. */
export function RibbonToggle({
  on, onClick, disabled, title, children, testId,
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-ribbon-control="toggle"
      className={`h-[18px] px-1.5 text-[11px] leading-none whitespace-nowrap rounded border disabled:opacity-40 ${on
        ? 'border-pl-primary text-pl-primary-text' : 'border-pl-border text-pl-muted'}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

/** Label-left compact field wrapper (number and text inputs). */
export function RibbonField({ label, title, children, className }) {
  return (
    <label className={`${RIBBON_LABEL} ${className || ''}`} title={title}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function RibbonSelect({ label, value, onChange, children, disabled, title, className, testId }) {
  return (
    <label className={RIBBON_LABEL} title={title}>
      <span>{label}</span>
      <select
        className={`${RIBBON_FIELD} ${className || ''}`}
        value={value}
        onChange={onChange}
        disabled={disabled}
        data-testid={testId}
        data-ribbon-control="select"
      >
        {children}
      </select>
    </label>
  );
}

export function RibbonSlider({ label, min, max, step, value, onChange, disabled, className }) {
  return (
    <label className={`${RIBBON_LABEL} ${className || ''}`}>
      <span className="whitespace-nowrap">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={onChange}
        disabled={disabled}
        data-ribbon-control="slider"
        className="flex-1 min-w-0 h-[14px] accent-pl-primary disabled:opacity-40"
      />
    </label>
  );
}

/**
 * @param {Object} p
 * @param {Array<{key: string, label: string, content: React.ReactNode}>} p.tabs
 * @param {React.ReactNode} [p.corner] left corner (app name / brand)
 * @param {React.ReactNode} [p.trailing] right end of the tab strip
 */
export default function Ribbon({ tabs, corner, trailing }) {
  const [active, setActive] = useState(() => {
    try {
      const k = localStorage.getItem(LS_KEY);
      return tabs.some((t) => t.key === k) ? k : tabs[0]?.key;
    } catch {
      return tabs[0]?.key;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, active); } catch { /* private mode */ }
  }, [active]);

  const activeTab = tabs.find((t) => t.key === active) || tabs[0];

  // overflow chevrons: shown only when the active tab is wider than the window
  const bodyRef = useRef(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const overflowRef = useRef(overflow);
  const measure = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    const o = overflowRef.current;
    if (o.left === left && o.right === right) return; // never set unchanged state
    overflowRef.current = { left, right };
    setOverflow(overflowRef.current);
  }, []);
  // re-measure after every render (tab switch, controls appearing)
  useLayoutEffect(() => { measure(); });
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    window.addEventListener('resize', measure);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => { window.removeEventListener('resize', measure); if (ro) ro.disconnect(); };
  }, [measure]);
  const scrollBy = (dir) => {
    const el = bodyRef.current;
    if (el) el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.6), behavior: 'smooth' });
  };
  const chevron = 'absolute top-0 bottom-0 z-10 flex items-center px-0.5 bg-pl-surface border-pl-border text-pl-muted hover:text-pl-text hover:bg-pl-sunken';

  return (
    <div className="border-b border-pl-border bg-pl-sunken" data-testid="sl-ribbon" data-ribbon-density="compact">
      <div className="flex items-end gap-0.5 px-2 h-[22px]">
        {corner}
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            data-tour={`ribbon-tab-${t.key}`}
            data-testid={`sl-ribbon-tab-${t.key}`}
            onClick={() => setActive(t.key)}
            className={`px-2.5 h-5 text-xs leading-none rounded-t border-x border-t
              ${t.key === activeTab?.key
              ? 'border-pl-border bg-pl-surface text-pl-primary-text font-medium'
              : 'border-transparent text-pl-muted hover:text-pl-text'}`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto self-center flex items-center gap-1">{trailing}</div>
      </div>
      <div className="relative border-t border-pl-border bg-pl-surface">
        <div
          ref={bodyRef}
          onScroll={measure}
          className="flex items-stretch overflow-x-auto px-1"
          style={{ scrollbarWidth: 'none' }}
          data-testid="sl-ribbon-body"
        >
          <div className="flex items-stretch min-w-max">{activeTab?.content}</div>
        </div>
        {overflow.left && (
          <button
            type="button"
            className={`${chevron} left-0 border-r`}
            onClick={() => scrollBy(-1)}
            aria-label="Scroll the ribbon left"
            title="More commands to the left"
            data-testid="sl-ribbon-more-left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {overflow.right && (
          <button
            type="button"
            className={`${chevron} right-0 border-l`}
            onClick={() => scrollBy(1)}
            aria-label="Scroll the ribbon right"
            title="More commands to the right"
            data-testid="sl-ribbon-more-right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
