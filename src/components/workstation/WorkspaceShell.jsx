// Full-viewport workstation layout (Petrel-style): ribbon on top, a
// resizable explorer tree on the left, the viewport windows in the
// center, a collapsible right dock and a status bar at the bottom.
//
// SHARED workstation primitive (Geoscience-ROADMAP.md §3: extract shell
// primitives at the second consumer — moved out of Seismolord when Well
// Data Manager became that consumer, G1.3).
// Pure layout — every region is a slot. The three panels have stable
// ids/orders and the dock collapses through the panel API instead of
// conditional rendering, so the center subtree (WebGL canvases) is
// NEVER remounted by opening/closing the dock or resizing.

import React, { useEffect, useRef } from 'react';
import {
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
} from '@/components/ui/resizable';
import { useDsTheme } from '@/design/themeContext';

// Design system (pilot 4, Seismolord): inside an opted-in <ThemedApp> scope
// the shell uses the theme roles; every workstation that has not migrated
// keeps the legacy classes byte for byte
// (src/components/workstation/__tests__/sharedShellsOptIn.test.jsx).
const LEGACY = {
  root: 'h-full min-h-0 overflow-auto bg-slate-950',
  handle: 'w-1 bg-slate-800/80 hover:bg-cyan-700/60 transition-colors',
};
const THEMED = {
  root: 'h-full min-h-0 overflow-auto bg-pl-bg',
  handle: 'w-1 bg-pl-border hover:bg-pl-primary/40 transition-colors',
};

/**
 * @param {Object} p
 * @param {React.ReactNode} p.ribbon top tool strip
 * @param {React.ReactNode} p.explorer left data tree
 * @param {React.ReactNode} p.center viewport windows (stays mounted)
 * @param {React.ReactNode} [p.dock] right dock content (AI copilot)
 * @param {boolean} [p.dockOpen] whether the right dock is expanded
 * @param {(open: boolean) => void} [p.onDockOpenChange] drag-collapse sync
 * @param {React.ReactNode} p.statusBar bottom readout row
 * @param {string} [p.autoSaveId] panel-size persistence key — give each
 *   app its own (the default keeps Seismolord's pre-extraction key)
 * @param {number} [p.minWidth] px below which the workspace scrolls
 * @param {number} [p.dockDefaultSize] initial dock size in % — pass a
 *   nonzero value when the app wants the dock OPEN on first mount
 *   (mount-time expand() of a 0-size panel is not reliable; the
 *   default keeps Seismolord's closed-at-start behaviour)
 */
export default function WorkspaceShell({
  ribbon, explorer, center, dock, dockOpen, onDockOpenChange, statusBar,
  autoSaveId = 'seismolord.workspace.v1', minWidth = 1100, dockDefaultSize = 0,
}) {
  const dockRef = useRef(null);
  const cls = useDsTheme() ? THEMED : LEGACY;

  useEffect(() => {
    const panel = dockRef.current;
    if (!panel) return;
    if (dockOpen && panel.isCollapsed()) panel.expand();
    else if (!dockOpen && !panel.isCollapsed()) panel.collapse();
  }, [dockOpen]);

  return (
    // desktop-targeted: below the minimum width the workspace scrolls
    // instead of squeezing the viewports into unusable slivers
    <div className={cls.root}>
      <div className="h-full min-h-0 flex flex-col" style={{ minWidth }}>
        <div className="shrink-0">{ribbon}</div>

        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId={autoSaveId}
          className="flex-1 min-h-0"
        >
          <ResizablePanel
            id="explorer" order={1}
            defaultSize={18} minSize={12} maxSize={35}
            className="min-w-0"
          >
            {explorer}
          </ResizablePanel>
          <ResizableHandle className={cls.handle} />
          <ResizablePanel id="center" order={2} defaultSize={82 - dockDefaultSize} minSize={30} className="min-w-0">
            {center}
          </ResizablePanel>
          <ResizableHandle
            className={dockOpen
              ? cls.handle
              : 'w-0 pointer-events-none'}
          />
          <ResizablePanel
            ref={dockRef}
            id="dock" order={3}
            defaultSize={dockDefaultSize} minSize={14} maxSize={40}
            collapsible collapsedSize={0}
            onCollapse={() => onDockOpenChange && onDockOpenChange(false)}
            onExpand={() => onDockOpenChange && onDockOpenChange(true)}
            className="min-w-0"
          >
            {dock}
          </ResizablePanel>
        </ResizablePanelGroup>

        <div className="shrink-0">{statusBar}</div>
      </div>
    </div>
  );
}
