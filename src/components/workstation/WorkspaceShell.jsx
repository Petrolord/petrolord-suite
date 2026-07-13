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
 */
export default function WorkspaceShell({
  ribbon, explorer, center, dock, dockOpen, onDockOpenChange, statusBar,
  autoSaveId = 'seismolord.workspace.v1', minWidth = 1100,
}) {
  const dockRef = useRef(null);

  useEffect(() => {
    const panel = dockRef.current;
    if (!panel) return;
    if (dockOpen && panel.isCollapsed()) panel.expand();
    else if (!dockOpen && !panel.isCollapsed()) panel.collapse();
  }, [dockOpen]);

  return (
    // desktop-targeted: below the minimum width the workspace scrolls
    // instead of squeezing the viewports into unusable slivers
    <div className="h-full min-h-0 overflow-auto bg-slate-950">
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
          <ResizableHandle className="w-1 bg-slate-800/80 hover:bg-cyan-700/60 transition-colors" />
          <ResizablePanel id="center" order={2} defaultSize={82} minSize={30} className="min-w-0">
            {center}
          </ResizablePanel>
          <ResizableHandle
            className={dockOpen
              ? 'w-1 bg-slate-800/80 hover:bg-cyan-700/60 transition-colors'
              : 'w-0 pointer-events-none'}
          />
          <ResizablePanel
            ref={dockRef}
            id="dock" order={3}
            defaultSize={0} minSize={14} maxSize={40}
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
