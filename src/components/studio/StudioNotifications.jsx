// Studio shell notification stack — fixed top-right toasts, props-driven
// (generalized from DCANotifications; pairs with useStudioNotifications).
import React from 'react';
import { X } from 'lucide-react';
import { THEMED_TONE } from './studioTheme';

// Design system: status roles inside a <ThemedApp> scope, legacy classes outside.
const THEMED_NOTE = { error: THEMED_TONE.danger, success: THEMED_TONE.good, warning: THEMED_TONE.warn };

const StudioNotifications = ({ notifications = [], onDismiss }) => {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {notifications.map((note) => (
        <div
          key={note.id}
          className={`pointer-events-auto min-w-0 w-[min(22rem,calc(100vw-2rem))] p-3 rounded-lg shadow-pl-md border animate-in slide-in-from-right-full fade-in duration-300 flex items-start justify-between gap-3 ${THEMED_NOTE[note.type] || 'bg-pl-raised border-pl-border text-pl-text'}`}
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
          <button onClick={() => onDismiss && onDismiss(note.id)} className="text-current opacity-70 hover:opacity-100" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default StudioNotifications;
