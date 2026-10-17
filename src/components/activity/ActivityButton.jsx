// The Activity indicator (Guided Journey design 6.4): a count with a spinner
// while anything runs, and a list of the items with progress, actions and a
// link back to where each one came from. In the sidebar, the phone bar, and
// floating inside full-screen apps (where the sidebar is hidden).

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Loader2, Pause, Play, X, CheckCircle2, XCircle, ArrowRight,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useActivity, buildActivity } from '@/lib/activity/activity';

const STATE_WORDS = { running: 'Running', paused: 'Paused', failed: 'Stopped', done: 'Finished', dirty: 'Not saved yet' };

function ItemRow({ item, onGo }) {
  const a = item.actions || {};
  const tone = item.state === 'failed' ? 'text-pl-danger-text' : item.state === 'done' ? 'text-pl-success-text'
    : item.state === 'paused' || item.state === 'dirty' ? 'text-pl-warning-text' : 'text-pl-primary-text';
  return (
    <li className="py-2 border-b border-pl-border last:border-b-0" data-testid="activity-item">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 shrink-0 ${tone}`}>
          {item.state === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : item.state === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" />
              : item.state === 'failed' ? <XCircle className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-pl-text break-words">{item.title}</div>
          <div className="text-[11px] text-pl-muted">{item.appName} · {STATE_WORDS[item.state] || item.state}</div>
          {item.progress != null && (
            <div className="mt-1 h-1.5 rounded bg-pl-sunken overflow-hidden">
              <div className="h-full bg-pl-primary" style={{ width: `${Math.round(item.progress * 100)}%` }} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0 text-pl-muted">
          {a.pause && <button type="button" title="Pause" aria-label="Pause" className="p-0.5 hover:text-pl-text" onClick={a.pause}><Pause className="w-3.5 h-3.5" /></button>}
          {a.resume && <button type="button" title="Resume" aria-label="Resume" className="p-0.5 hover:text-pl-text" onClick={a.resume}><Play className="w-3.5 h-3.5" /></button>}
          {a.cancel && <button type="button" title="Cancel" aria-label="Cancel" className="p-0.5 hover:text-pl-text" onClick={a.cancel}><X className="w-3.5 h-3.5" /></button>}
          {a.dismiss && <button type="button" title="Dismiss" aria-label="Dismiss" className="p-0.5 hover:text-pl-text" onClick={a.dismiss}><X className="w-3.5 h-3.5" /></button>}
          {item.href && (
            <button type="button" title={`Open in ${item.appName}`} aria-label={`Open in ${item.appName}`} className="p-0.5 hover:text-pl-text" onClick={() => onGo(item.href)} data-testid="activity-go">
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * @param {{variant?: 'sidebar'|'bar'|'floating', collapsed?: boolean}} p
 */
export default function ActivityButton({ variant = 'sidebar', collapsed = false }) {
  const items = useActivity();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const a = buildActivity(items);
  if (variant === 'floating' && !items.length) return null;

  const trigger = variant === 'floating'
    ? 'flex items-center gap-1.5 rounded-full border border-pl-border bg-pl-surface px-3 py-1.5 text-xs text-pl-text shadow-lg hover:bg-pl-raised'
    : variant === 'bar'
      ? 'relative inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-pl-muted hover:bg-pl-raised hover:text-pl-text'
      : 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-pl-muted hover:bg-pl-raised hover:text-pl-text';
  const label = a.running ? `${a.count} running` : a.count ? `${a.count} to look at` : 'Activity';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={trigger} data-testid={`activity-button-${variant}`} aria-label={`Activity: ${label}`} title="Uploads, conversions, server jobs and unsaved work, in every app">
          {a.running ? <Loader2 className="h-4 w-4 animate-spin text-pl-primary-text" /> : <Activity className="h-4 w-4" />}
          {!(variant === 'sidebar' && collapsed) && <span>{variant === 'sidebar' ? 'Activity' : label}</span>}
          {a.count > 0 && variant === 'sidebar' && !collapsed && (
            <span className="ml-auto rounded-full bg-pl-primary px-1.5 text-[11px] text-pl-primary-fg" data-testid="activity-count">{a.count}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[92vw] p-3" align={variant === 'floating' ? 'end' : 'start'} side={variant === 'sidebar' ? 'right' : 'bottom'}>
        <div className="text-sm font-semibold text-pl-text mb-1">Activity</div>
        {items.length ? (
          <ul data-testid="activity-list">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} onGo={(href) => { setOpen(false); navigate(href); }} />
            ))}
          </ul>
        ) : (
          <div className="text-xs text-pl-muted" data-testid="activity-empty">
            Nothing is running. Uploads, conversions, server jobs and unsaved work show here, whichever app you are in.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
