// Ribbon primitives (Petrel-2015-style top chrome): a tab strip and the
// active tab's row of grouped tool controls. Hand-rolled rather than
// Radix Tabs — every control carries its own disabled state and the
// active tab persists per browser.
//
// Layout contract: RibbonGroup children sit in one horizontal row with
// the group label centered underneath; groups separate with a border.

import React, { useEffect, useState } from 'react';

const LS_KEY = 'seismolord.ribbon.v1';

export function RibbonGroup({ label, children }) {
  return (
    <div className="flex flex-col justify-between px-2.5 border-r border-pl-border last:border-r-0">
      <div className="flex items-center gap-1.5 flex-wrap py-1">{children}</div>
      <div className="text-[10px] text-pl-muted text-center uppercase tracking-wider pb-0.5">
        {label}
      </div>
    </div>
  );
}

/** Icon-over-label ribbon tool button. `accent` tints an armed tool. */
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
      className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] px-1.5 py-1
        rounded-md border text-[11px] leading-tight whitespace-nowrap
        disabled:opacity-40 disabled:cursor-not-allowed
        ${active ? ACCENTS[accent] || ACCENTS.cyan
        : 'border-transparent text-pl-text hover:bg-pl-sunken/80 hover:border-pl-border'}`}
    >
      {Icon && <Icon className={`w-4.5 h-4.5 w-[18px] h-[18px] ${busy ? 'animate-spin' : ''}`} />}
      <span>{label}</span>
    </button>
  );
}

export function RibbonSelect({ label, value, onChange, children, disabled, title, className, testId }) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] text-pl-muted" title={title}>
      {label}
      <select
        className={`rounded-md bg-pl-surface border border-pl-border-strong text-pl-text
          px-1.5 py-1 text-xs disabled:opacity-40 ${className || ''}`}
        value={value}
        onChange={onChange}
        disabled={disabled}
        data-testid={testId}
      >
        {children}
      </select>
    </label>
  );
}

export function RibbonSlider({ label, min, max, step, value, onChange, disabled, className }) {
  return (
    <label className={`flex flex-col gap-1 text-[10px] text-pl-muted ${className || ''}`}>
      <span className="whitespace-nowrap">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full accent-pl-primary disabled:opacity-40"
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

  return (
    <div className="border-b border-pl-border bg-pl-sunken">
      <div className="flex items-center gap-0.5 px-2 pt-1">
        {corner}
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            data-tour={`ribbon-tab-${t.key}`}
            data-testid={`sl-ribbon-tab-${t.key}`}
            onClick={() => setActive(t.key)}
            className={`px-3 py-1 text-[13px] rounded-t-md border-x border-t
              ${t.key === activeTab?.key
              ? 'border-pl-border bg-pl-surface text-pl-primary-text font-medium'
              : 'border-transparent text-pl-muted hover:text-pl-text'}`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 pb-0.5">{trailing}</div>
      </div>
      <div className="flex items-stretch overflow-x-auto border-t border-pl-border bg-pl-surface px-1 min-h-[58px]">
        {activeTab?.content}
      </div>
    </div>
  );
}
