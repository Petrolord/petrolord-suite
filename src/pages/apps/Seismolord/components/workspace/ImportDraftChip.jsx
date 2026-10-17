// Ribbon chip for an import that is set up but not started (owner report
// 2026-10-17): after a preview, a closed dialog or a visit to another app,
// the user sees that nothing has been imported yet and goes back to the
// setup in one click, or discards it.

import React from 'react';
import { Upload, X } from 'lucide-react';
import { useImportDraft, clearImportDraft } from '../../services/importDraft';

export default function ImportDraftChip({ onContinue }) {
  const draft = useImportDraft();
  if (!draft?.file) return null;
  return (
    <span
      className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border border-pl-warning bg-pl-warning-bg text-pl-warning-text max-w-[22rem]"
      data-testid="sl-import-draft"
      title={`${draft.file.name} is set up for import but has not been imported. Continue to start it.`}
    >
      <Upload className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">Not imported yet: {draft.file.name}</span>
      <button type="button" className="underline shrink-0 hover:text-pl-text" onClick={onContinue} data-testid="sl-import-draft-continue">
        Continue
      </button>
      <button
        type="button"
        className="shrink-0 hover:text-pl-text"
        title="Discard this import setup"
        aria-label="Discard this import setup"
        onClick={clearImportDraft}
        data-testid="sl-import-draft-discard"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}
