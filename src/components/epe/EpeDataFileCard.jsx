import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileSpreadsheet, Loader2, Trash2, Play, CheckCircle2, AlertCircle, ChevronDown, ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ============================================================================
// EpeDataFileCard
// ============================================================================
//
// Status-aware rendering for an EPE data file:
//
//   - data is null OR missing            → "Empty" (legacy stuck row, allow delete only)
//   - data has shape { storagePath: ... } → "Uploaded, not processed" (show Process button)
//   - data is an array                    → "Processed" (show row count, expandable preview)
//
// Props:
//   file         — { id, file_name, data, created_at }
//   onProcess    — (file) => void       [process button]
//   onDelete     — () => void           [delete button]
//   processing   — boolean              [show spinner if currently processing]
// ============================================================================

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
         d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const getStatus = (data) => {
  if (data === null || data === undefined) return 'EMPTY';
  if (Array.isArray(data)) return 'PROCESSED';
  if (typeof data === 'object' && data.storagePath) return 'UPLOADED_PENDING';
  return 'UNKNOWN';
};

const StatusBadge = ({ status, rowCount }) => {
  const config = {
    EMPTY: {
      label: 'Empty',
      icon: AlertCircle,
      bg: 'bg-pl-warning-bg',
      border: 'border-pl-warning/40',
      text: 'text-pl-warning-text',
    },
    UPLOADED_PENDING: {
      label: 'Uploaded, needs processing',
      icon: AlertCircle,
      bg: 'bg-pl-info-bg',
      border: 'border-pl-info/40',
      text: 'text-pl-info-text',
    },
    PROCESSED: {
      label: rowCount !== undefined ? `Processed • ${rowCount} rows` : 'Processed',
      icon: CheckCircle2,
      bg: 'bg-pl-success-bg',
      border: 'border-pl-success/40',
      text: 'text-pl-success-text',
    },
    UNKNOWN: {
      label: 'Unknown state',
      icon: AlertCircle,
      bg: 'bg-pl-sunken',
      border: 'border-pl-border',
      text: 'text-pl-text',
    },
  }[status];

  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.border} ${config.text}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};

const EpeDataFileCard = ({ file, onProcess, onDelete, processing }) => {
  const [expanded, setExpanded] = useState(false);

  const status = getStatus(file.data);
  const rowCount = status === 'PROCESSED' ? file.data.length : undefined;
  const previewRows = status === 'PROCESSED' ? file.data.slice(0, 3) : [];
  const previewCols = previewRows.length > 0 ? Object.keys(previewRows[0]).slice(0, 6) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-pl-surface border border-pl-border rounded-lg p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <FileSpreadsheet className="w-8 h-8 text-pl-primary-text flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium text-pl-text text-sm truncate">{file.file_name}</p>
            <p className="text-xs text-pl-muted mt-0.5">{formatDate(file.created_at)}</p>
            <div className="mt-2">
              <StatusBadge status={status} rowCount={rowCount} />
            </div>
          </div>
        </div>

        <div className="flex flex-row flex-wrap gap-1 flex-shrink-0 sm:flex-col">
          {/* Process button — only shown when there's something to process */}
          {status === 'UPLOADED_PENDING' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onProcess(file)}
              disabled={processing}
            >
              {processing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              <span className="ml-1 text-xs">{processing ? 'Processing…' : 'Process'}</span>
            </Button>
          )}

          {/* Expand to preview rows — only when processed */}
          {status === 'PROCESSED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <span className="ml-1 text-xs">{expanded ? 'Hide' : 'Preview'}</span>
            </Button>
          )}

          {/* Delete is available whenever the parent allows it (Wave E:
              read-only shared views pass no onDelete) */}
          {onDelete && (
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              disabled={processing}
              className="text-pl-danger-text border-pl-danger/40 hover:bg-pl-danger-bg hover:text-pl-danger-text"
            >
              <Trash2 className="w-3 h-3" />
              <span className="ml-1 text-xs">Delete</span>
            </Button>
          )}
        </div>
      </div>

      {/* Preview rows expanded view */}
      {expanded && status === 'PROCESSED' && previewRows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-3 overflow-x-auto bg-pl-surface rounded border border-pl-border"
        >
          <table className="text-xs w-full">
            <thead className="bg-pl-sunken">
              <tr>
                {previewCols.map((c) => (
                  <th key={c} className="px-2 py-1 text-left text-pl-muted font-pl-mono font-semibold whitespace-nowrap">
                    {c}
                  </th>
                ))}
                {Object.keys(previewRows[0]).length > 6 && (
                  <th className="px-2 py-1 text-left text-pl-muted">
                    + {Object.keys(previewRows[0]).length - 6} more
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className="border-t border-pl-border">
                  {previewCols.map((c) => (
                    <td key={c} className="px-2 py-1 text-pl-text font-pl-mono tabular-nums whitespace-nowrap max-w-32 overflow-hidden text-ellipsis">
                      {row[c] !== undefined && row[c] !== null ? String(row[c]) : ''}
                    </td>
                  ))}
                  {Object.keys(previewRows[0]).length > 6 && (
                    <td className="px-2 py-1 text-pl-muted">…</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {rowCount > 3 && (
            <p className="text-xs text-pl-muted px-2 py-1 border-t border-pl-border">
              Showing 3 of {rowCount} rows.
            </p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
};

export default EpeDataFileCard;
