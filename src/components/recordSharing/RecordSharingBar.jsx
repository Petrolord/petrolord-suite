// The one sharing control every Geoscience app shows on a saved record
// (docs/scope/OrgSharing-DESIGN-AND-STATUS.md):
//   owner      "Share with my organisation" switch, then "Colleagues can view" / "can edit"
//   everyone   who is editing, Start editing / Done editing, Take over (owner),
//              Save a copy, last saved by, History
// Before the migration is applied the control is replaced by a short note and
// saves work as before. Sharing state comes from useRecordSharing; the
// database enforces every rule shown here.

import React, { useState } from 'react';
import { Users, Lock, Pencil, History as HistoryIcon, Copy, RefreshCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { messages, whenText, COLLEAGUE } from '@/lib/recordSharing/rules';
import RecordHistoryPanel from './RecordHistoryPanel';

/**
 * @param {{
 *   sharing: Object,          the object returned by useRecordSharing
 *   label?: string,           what the record is called in the app ("model", "section")
 *   onSaveCopy?: () => void,  "Save a copy" as the user's own record
 *   onReload?: () => void,    reopen the record from the database (after a newer version)
 *   fieldLabels?: Object,     column name -> words, for the history
 *   className?: string,
 * }} props
 */
export default function RecordSharingBar({ sharing: s, label = 'record', onSaveCopy = null, onReload = null, fieldLabels = {}, className = '' }) {
  const [showHistory, setShowHistory] = useState(false);
  if (!s?.sharing || !s.ready) return null;
  const { access } = s;

  if (!s.available) {
    if (!access.isOwner) return null;
    return (
      <div data-testid="record-sharing-bar" className={`rounded-md border border-pl-border bg-pl-surface px-3 py-2 text-xs text-pl-muted ${className}`}>
        <span data-testid="sharing-unavailable" className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden />{messages.notAvailable()}</span>
      </div>
    );
  }

  const noOrg = !s.organizationId;
  const shared = access.shared;
  const owner = s.ownerName || COLLEAGUE;
  const editor = s.editorName || COLLEAGUE;

  let line = null;       // the status sentence
  if (access.lock.live && access.lock.mine) line = `You are editing this ${label}. Colleagues see it read-only until you finish.`;
  else if (access.lock.live) line = `Being edited by ${editor} since ${whenText(access.lock.since)}.`;
  else if (access.sharedEdit) line = `Shared for editing, one person at a time. Start editing to make changes.`;
  else if (!access.isOwner && shared) line = `Shared by ${owner} for viewing.`;

  return (
    <div data-testid="record-sharing-bar" data-mode={access.mode} className={`rounded-md border border-pl-border bg-pl-surface px-3 py-2 text-xs text-pl-text ${className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {access.isOwner ? (
          <label className="inline-flex items-center gap-2" title={noOrg ? messages.noOrganisation() : undefined}>
            <Switch
              data-testid="share-switch"
              aria-label="Share with my organisation"
              checked={shared}
              disabled={s.busy || noOrg}
              onCheckedChange={(on) => s.share({ shared: on, access: on ? access.orgAccess : 'view' })}
            />
            <span className="font-medium">Share with my organisation</span>
          </label>
        ) : (
          <span data-testid="shared-by" className="inline-flex items-center gap-1.5 font-medium"><Users className="h-3.5 w-3.5" aria-hidden />Shared by {owner}</span>
        )}
        {access.isOwner && noOrg && <span data-testid="share-no-org" className="text-pl-muted">{messages.noOrganisation()}</span>}
        {access.isOwner && shared && (
          <NativeSelect
            compact
            data-testid="share-access"
            aria-label="What colleagues can do"
            className="w-auto"
            value={access.orgAccess}
            disabled={s.busy}
            onChange={(e) => s.share({ shared: true, access: e.target.value })}
          >
            <option value="view">Colleagues can view</option>
            <option value="edit">Colleagues can edit</option>
          </NativeSelect>
        )}
        <span className="ml-auto inline-flex flex-wrap items-center gap-2">
          {access.canTake && !access.lock.live && (
            <Button type="button" size="sm" variant="outline" data-testid="start-editing" disabled={s.busy} onClick={() => s.startEditing()}>
              <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />Start editing
            </Button>
          )}
          {access.lock.mine && (
            <Button type="button" size="sm" variant="outline" data-testid="done-editing" disabled={s.busy} onClick={() => s.stopEditing()}>Done editing</Button>
          )}
          {access.canTakeOver && (
            <Button type="button" size="sm" variant="outline" data-testid="take-over" disabled={s.busy} onClick={() => s.takeOver()} title="Ends the colleague's editing session. The take-over is recorded in the history.">Take over</Button>
          )}
          {onSaveCopy && !access.isOwner && (
            <Button type="button" size="sm" variant="outline" data-testid="save-copy" onClick={onSaveCopy}><Copy className="mr-1 h-3.5 w-3.5" aria-hidden />Save a copy</Button>
          )}
          <Button type="button" size="sm" variant="ghost" data-testid="history-button" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            <HistoryIcon className="mr-1 h-3.5 w-3.5" aria-hidden />History
          </Button>
        </span>
      </div>
      {line && (
        <p data-testid="sharing-banner" className="mt-2 inline-flex items-center gap-1.5 text-pl-muted">
          {access.lock.live && !access.lock.mine ? <Lock className="h-3.5 w-3.5" aria-hidden /> : null}{line}
        </p>
      )}
      {s.sharing.updated_by && s.sharing.updated_at && (
        <p data-testid="last-saved-by" className="mt-1 text-pl-muted">
          Last saved by {s.sharing.updated_by === s.userId ? 'you' : (s.lastEditorName || COLLEAGUE)} at {whenText(s.sharing.updated_at)}.
        </p>
      )}
      {s.notice && (
        <p data-testid="sharing-notice" role="status" className="mt-2 rounded border border-pl-border-strong bg-pl-bg px-2 py-1 text-pl-text">
          {s.notice.text}
          {s.notice.kind === 'stale' && onReload && (
            <Button type="button" size="sm" variant="outline" className="ml-2" data-testid="reload-record" onClick={() => { s.clearNotice(); onReload(); }}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />Reload
            </Button>
          )}
        </p>
      )}
      {showHistory && <RecordHistoryPanel load={s.loadHistory} userId={s.userId} fieldLabels={fieldLabels} className="mt-2" />}
    </div>
  );
}
