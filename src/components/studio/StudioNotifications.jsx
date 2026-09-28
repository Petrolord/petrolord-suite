// Studio shell notification stack — fixed top-right toasts, props-driven
// (generalized from DCANotifications; pairs with useStudioNotifications).
import React from 'react';
import { X } from 'lucide-react';
import { useDsTheme } from '@/design/themeContext';

// Theme roles inside an opted-in <ThemedApp> scope (status colours only for
// the status types); outside one the legacy classes render unchanged.
const THEMED_TONE = {
  error: 'bg-pl-danger-bg border-pl-danger/40 text-pl-danger-text',
  success: 'bg-pl-success-bg border-pl-success/40 text-pl-success-text',
  warning: 'bg-pl-warning-bg border-pl-warning/40 text-pl-warning-text',
  info: 'bg-pl-raised border-pl-border text-pl-text',
};

const StudioNotifications = ({ notifications = [], onDismiss }) => {
  const ds = useDsTheme();
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {notifications.map((note) => (
        <div
          key={note.id}
          className={ds
            ? `pointer-events-auto min-w-[min(300px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-3 rounded-lg shadow-pl-md border animate-in slide-in-from-right-full fade-in duration-300 flex items-start justify-between gap-3 ${THEMED_TONE[note.type] || THEMED_TONE.info}`
            : `pointer-events-auto min-w-[300px] p-3 rounded-lg shadow-lg border animate-in slide-in-from-right-full fade-in duration-300 flex items-start justify-between gap-3
            ${note.type === 'error' ? 'bg-red-950/90 border-red-800 text-red-200' :
              note.type === 'success' ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200' :
              note.type === 'warning' ? 'bg-amber-950/90 border-amber-800 text-amber-200' :
              'bg-slate-800/90 border-slate-700 text-slate-200'}`}
          {...(ds ? { role: note.type === 'error' ? 'alert' : 'status' } : {})}
        >
          <div className="text-sm">
            {note.message}
            {note.action && (
              <button
                onClick={() => {
                  note.action.onClick && note.action.onClick();
                  onDismiss && onDismiss(note.id);
                }}
                className="ml-3 font-semibold underline underline-offset-2 text-current hover:opacity-80"
              >
                {note.action.label}
              </button>
            )}
          </div>
          <button onClick={() => onDismiss && onDismiss(note.id)} className="text-current opacity-70 hover:opacity-100" {...(ds ? { 'aria-label': 'Dismiss' } : {})}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default StudioNotifications;
