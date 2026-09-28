// Right dock chrome for the workspace (hosts the AI copilot). The dock
// panel itself lives in WorkspaceShell and collapses through the panel
// API — this component only draws the header + content column.

import React from 'react';
import { Sparkles, X } from 'lucide-react';

export default function RightDock({ title, icon: Icon = Sparkles, onClose, children }) {
  return (
    <div className="h-full min-h-0 flex flex-col bg-pl-surface border-l border-pl-border">
      <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border-b border-pl-border">
        <Icon className="w-4 h-4 text-pl-primary-text" />
        <span className="text-sm font-semibold text-pl-text truncate">{title}</span>
        <button
          type="button"
          title="Close dock"
          className="ml-auto p-1 rounded text-pl-muted hover:text-pl-danger-text hover:bg-pl-sunken"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
