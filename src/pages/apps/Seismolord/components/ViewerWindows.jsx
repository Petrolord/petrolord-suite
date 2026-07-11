// ViewerWindows — window management for the interpretation viewports
// (Section / 3D / Map): tab bar, per-window open/close, and tiled
// layouts (side-by-side columns or stacked rows) so nobody scrolls the
// browser hunting for a window.
//
// Every OPEN window stays MOUNTED regardless of layout — inactive tabs
// are display:none, not unmounted — so cameras, WebGL state and caches
// survive tab switches; the viewports' ResizeObservers re-size their
// canvases when a window becomes visible again. Layout + open set are
// persisted per browser.

import React, { useEffect, useMemo, useState } from 'react';
import { AppWindow, Columns, Rows, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

const LS_KEY = 'seismolord.windows.v1';

const LAYOUTS = [
  { key: 'tabs', title: 'Tabs (one window at a time)', Icon: AppWindow },
  { key: 'columns', title: 'Tile horizontally (side by side)', Icon: Columns },
  { key: 'rows', title: 'Tile vertically (stacked)', Icon: Rows },
];

const loadState = (windowKeys, fallbackOpen) => {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    const open = (s.open || fallbackOpen).filter((k) => windowKeys.includes(k));
    return {
      layout: LAYOUTS.some((l) => l.key === s.layout) ? s.layout : 'tabs',
      open: open.length ? open : [...fallbackOpen],
      active: windowKeys.includes(s.active) ? s.active : open[0] || fallbackOpen[0],
    };
  } catch {
    return { layout: 'tabs', open: [...fallbackOpen], active: fallbackOpen[0] };
  }
};

/**
 * @param {Object} p
 * @param {Array<{key: string, title: string, icon: React.ComponentType,
 *   content: React.ReactNode}>} p.windows window registry, stable keys
 * @param {string[]} [p.defaultOpen] keys open on first ever visit
 * @param {?{key: string, seq: number}} [p.focus] focus request: each time
 *   `seq` bumps, the window `key` is opened and made the active tab (e.g.
 *   "a traverse was drawn — show its window")
 */
export default function ViewerWindows({ windows, defaultOpen, focus }) {
  const keys = useMemo(() => windows.map((w) => w.key), [windows]);
  const [state, setState] = useState(
    () => loadState(keys, defaultOpen || [windows[0]?.key].filter(Boolean)),
  );

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* private mode */ }
  }, [state]);

  useEffect(() => {
    if (!focus || !keys.includes(focus.key)) return;
    setState((s) => ({
      ...s,
      open: s.open.includes(focus.key) ? s.open : [...s.open, focus.key],
      active: focus.key,
    }));
  }, [focus, keys]);

  const { layout, open, active } = state;
  const openWindows = windows.filter((w) => open.includes(w.key));

  const activate = (key) => setState((s) => ({ ...s, active: key }));

  const toggleOpen = (key) => setState((s) => {
    if (s.open.includes(key)) {
      const nextOpen = s.open.filter((k) => k !== key);
      return {
        ...s,
        open: nextOpen,
        active: s.active === key ? (nextOpen[0] || null) : s.active,
      };
    }
    return { ...s, open: [...s.open, key], active: key };
  });

  const setLayout = (key) => setState((s) => ({ ...s, layout: key }));

  const tileClass = layout === 'columns'
    ? 'flex flex-col lg:flex-row gap-4 items-stretch'
    : 'flex flex-col gap-4';

  return (
    <div data-testid="viewer-windows">
      <div className="flex flex-wrap items-center gap-1 mb-2">
        {openWindows.map((w) => {
          const Icon = w.icon;
          const isActive = layout === 'tabs' && active === w.key;
          return (
            <div
              key={w.key}
              className={`flex items-center rounded-md border text-xs
                ${isActive
                ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800/60'}`}
            >
              <button
                type="button"
                className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5"
                onClick={() => activate(w.key)}
                title={layout === 'tabs' ? `Show ${w.title}` : w.title}
              >
                <Icon className="w-3.5 h-3.5" />
                {w.title}
              </button>
              <button
                type="button"
                className="pr-1.5 pl-0.5 py-1.5 text-slate-500 hover:text-red-400"
                onClick={() => toggleOpen(w.key)}
                title={`Close ${w.title}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" title="Open / close windows">
              <Plus className="w-4 h-4 mr-1" />
              <span className="text-xs">Windows</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>Viewer windows</DropdownMenuLabel>
            {windows.map((w) => (
              <DropdownMenuCheckboxItem
                key={w.key}
                onSelect={(e) => e.preventDefault()}
                checked={open.includes(w.key)}
                onCheckedChange={() => toggleOpen(w.key)}
              >
                {w.title}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-1">
          {LAYOUTS.map(({ key, title, Icon }) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              title={title}
              className={layout === key ? 'border-cyan-500/60 text-cyan-300' : ''}
              onClick={() => setLayout(key)}
            >
              <Icon className="w-4 h-4" />
            </Button>
          ))}
        </div>
      </div>

      {openWindows.length === 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-8
          text-center text-sm text-slate-500"
        >
          All windows are closed — open one from the Windows menu above.
        </div>
      )}

      <div className={layout === 'tabs' ? '' : tileClass}>
        {openWindows.map((w) => {
          const hidden = layout === 'tabs' && active !== w.key;
          return (
            <div
              key={w.key}
              data-testid={`window-${w.key}`}
              className={hidden ? 'hidden'
                : layout === 'columns' ? 'flex-1 min-w-0' : ''}
            >
              {w.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
