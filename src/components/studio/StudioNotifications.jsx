// Studio shell notification stack — fixed top-right toasts, props-driven
// (generalized from DCANotifications; pairs with useStudioNotifications).
import React from 'react';
import { X } from 'lucide-react';

const StudioNotifications = ({ notifications = [], onDismiss }) => {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {notifications.map((note) => (
        <div
          key={note.id}
          className={`pointer-events-auto min-w-[300px] p-3 rounded-lg shadow-lg border animate-in slide-in-from-right-full fade-in duration-300 flex items-start justify-between gap-3
            ${note.type === 'error' ? 'bg-red-950/90 border-red-800 text-red-200' :
              note.type === 'success' ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200' :
              'bg-slate-800/90 border-slate-700 text-slate-200'}`}
        >
          <div className="text-sm">{note.message}</div>
          <button onClick={() => onDismiss && onDismiss(note.id)} className="text-current opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default StudioNotifications;
