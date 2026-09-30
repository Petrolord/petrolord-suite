// Named sections (AppUpgrade WC-U2-001): pick, create, duplicate, rename and
// delete the user's own geo_correlation_sections rows from the ribbon.
// Presentational; the controller owns the rows and guards unsaved changes.

import React, { useState } from 'react';
import { FilePlus2, Copy, Pencil, Trash2, Check, X } from 'lucide-react';

const btn = 'flex items-center gap-1 px-1.5 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';

/**
 * @param {Object} p
 * @param {Array<{id, name, wellCount}>} p.sections
 * @param {?string} p.currentId @param {?string} p.currentName
 * @param {(id: string) => void} p.onOpen
 * @param {(kind: 'new'|'duplicate'|'rename', name: string) => void} p.onName
 * @param {() => void} p.onDelete
 * @param {(kind: string) => string} p.suggestName
 */
export default function SectionPicker({ sections, currentId, currentName, onOpen, onName, onDelete, suggestName }) {
  const [naming, setNaming] = useState(null); // {kind, draft}
  const [confirming, setConfirming] = useState(false);
  const known = sections.some((s) => s.id === currentId);
  const commit = () => {
    const n = naming;
    setNaming(null);
    if (n && n.draft.trim()) onName(n.kind, n.draft.trim());
  };
  if (naming) {
    return (
      <div className="flex items-center gap-1" data-testid="corr-section-naming" data-kind={naming.kind}>
        <span className="text-[11px] text-pl-muted">{naming.kind === 'rename' ? 'Rename to' : naming.kind === 'duplicate' ? 'Copy as' : 'New section'}</span>
        <input autoFocus className="w-40 rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs"
          value={naming.draft} maxLength={80} data-testid="corr-section-name-input"
          onChange={(e) => setNaming({ ...naming, draft: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') setNaming(null); }} />
        <button type="button" className={btn} title="Apply" data-testid="corr-section-name-ok" onClick={commit}><Check className="w-3.5 h-3.5" /></button>
        <button type="button" className={btn} title="Cancel" onClick={() => setNaming(null)}><X className="w-3.5 h-3.5" /></button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1" data-testid="corr-sections">
      <select
        className="max-w-[12rem] rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs"
        value={known ? currentId : ''}
        data-testid="corr-section-select"
        title="Your saved sections (only you can see them)"
        onChange={(e) => { if (e.target.value) onOpen(e.target.value); }}
      >
        {!known && <option value="">{currentName || 'Unsaved section'}</option>}
        {sections.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.wellCount} well{s.wellCount === 1 ? '' : 's'})</option>)}
      </select>
      <button type="button" className={btn} title="Start a new, empty section" data-testid="corr-section-new"
        onClick={() => setNaming({ kind: 'new', draft: suggestName('new') })}><FilePlus2 className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn} title="Save this section under a new name (a copy)" data-testid="corr-section-duplicate"
        onClick={() => setNaming({ kind: 'duplicate', draft: suggestName('duplicate') })}><Copy className="w-3.5 h-3.5" /></button>
      <button type="button" className={btn} title="Rename this section" data-testid="corr-section-rename" disabled={!known}
        onClick={() => setNaming({ kind: 'rename', draft: currentName || '' })}><Pencil className="w-3.5 h-3.5" /></button>
      <button type="button" className={confirming ? `${btn} text-pl-danger-text` : btn} disabled={!known}
        title={confirming ? 'Click again to delete this section (its tops stay in the registry)' : 'Delete this section (its tops stay in the registry)'}
        data-testid="corr-section-delete"
        onClick={() => { if (confirming) { setConfirming(false); onDelete(); } else { setConfirming(true); setTimeout(() => setConfirming(false), 4000); } }}>
        {confirming ? 'confirm' : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
