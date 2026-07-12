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
    <div className="flex flex-col justify-between px-2.5 border-r border-slate-800 last:border-r-0">
      <div className="flex items-center gap-1.5 flex-wrap py-1">{children}</div>
      <div className="text-[10px] text-slate-500 text-center uppercase tracking-wider pb-0.5">
        {label}
      </div>
    </div>
  );
}

/** Icon-over-label ribbon tool button. `accent` tints an armed tool. */
export function RibbonButton({
  icon: Icon, label, onClick, active, disabled, title, accent = 'cyan', busy,
}) {
  const ACCENTS = {
    cyan: 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300',
    yellow: 'border-yellow-500/60 bg-yellow-500/10 text-yellow-300',
    orange: 'border-orange-500/60 bg-orange-500/10 text-orange-300',
    red: 'border-red-500/60 bg-red-500/10 text-red-300',
    emerald: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300',
  };
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] px-1.5 py-1
        rounded-md border text-[11px] leading-tight whitespace-nowrap
        disabled:opacity-40 disabled:cursor-not-allowed
        ${active ? ACCENTS[accent] || ACCENTS.cyan
        : 'border-transparent text-slate-300 hover:bg-slate-800/80 hover:border-slate-700'}`}
    >
      {Icon && <Icon className={`w-4.5 h-4.5 w-[18px] h-[18px] ${busy ? 'animate-spin' : ''}`} />}
      <span>{label}</span>
    </button>
  );
}

export function RibbonSelect({ label, value, onChange, children, disabled, title, className }) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] text-slate-500" title={title}>
      {label}
      <select
        className={`rounded-md bg-slate-950 border border-slate-700 text-slate-200
          px-1.5 py-1 text-xs disabled:opacity-40 ${className || ''}`}
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        {children}
      </select>
    </label>
  );
}

export function RibbonSlider({ label, min, max, step, value, onChange, disabled, className }) {
  return (
    <label className={`flex flex-col gap-1 text-[10px] text-slate-500 ${className || ''}`}>
      <span className="whitespace-nowrap">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full accent-cyan-500 disabled:opacity-40"
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
    <div className="border-b border-slate-800 bg-slate-900/80">
      <div className="flex items-center gap-0.5 px-2 pt-1">
        {corner}
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`px-3 py-1 text-[13px] rounded-t-md border-x border-t
              ${t.key === activeTab?.key
              ? 'border-slate-700 bg-slate-900 text-cyan-300 font-medium'
              : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 pb-0.5">{trailing}</div>
      </div>
      <div className="flex items-stretch overflow-x-auto border-t border-slate-800 bg-slate-900 px-1 min-h-[58px]">
        {activeTab?.content}
      </div>
    </div>
  );
}
