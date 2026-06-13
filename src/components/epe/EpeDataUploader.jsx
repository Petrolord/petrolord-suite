import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, Loader2, CheckCircle2, XCircle, AlertTriangle,
  FileSpreadsheet, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const PREVIEW_ROWS = 5;

// Filename keyword required for each dataType (matches downstream routing)
const FILENAME_KEYWORD = {
  production_volumes: 'prod',
  capex: 'capex',
  opex: 'opex',
};

const DATA_TYPE_LABEL = {
  production_volumes: 'Production',
  capex: 'CAPEX',
  opex: 'OPEX',
};

const formatBytes = (b) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

// ============================================================================
// EpeDataUploader
// ============================================================================
//
// Handles the FULL upload-to-process lifecycle for one EPE data slot
// (production / capex / opex):
//
//   IDLE → user picks/drops file
//   PREVIEWING → first N rows shown client-side; user confirms or cancels
//   UPLOADING → file goes to Supabase Storage
//   PROCESSING → file is parsed and DB row's data jsonb is populated
//   SUCCESS → green confirmation with row count, "Upload another" reset
//   ERROR → red message with specific reason, "Try again" reset
//
// On success, calls onSuccess() so the parent can refresh its file list.
// ============================================================================

const EpeDataUploader = ({ caseId, dataType, onSuccess }) => {
  const { toast } = useToast();
  const { user } = useAuth();

  const [stage, setStage] = useState('IDLE'); // IDLE | PREVIEWING | UPLOADING | PROCESSING | SUCCESS | ERROR
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);  // { columns, rows, totalRows }
  const [filenameWarning, setFilenameWarning] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);  // { fileName, rowCount }
  const [progress, setProgress] = useState(0);

  const cancelledRef = useRef(false);

  // -------------------------------------------------------------------------
  // Reset to IDLE
  // -------------------------------------------------------------------------
  const reset = () => {
    setStage('IDLE');
    setSelectedFile(null);
    setPreviewData(null);
    setFilenameWarning(null);
    setErrorMessage(null);
    setSuccessInfo(null);
    setProgress(0);
    cancelledRef.current = false;
  };

  // -------------------------------------------------------------------------
  // Step 1: file picked → validate + parse preview client-side
  // -------------------------------------------------------------------------
  const onDrop = useCallback((acceptedFiles, fileRejections) => {
    if (fileRejections && fileRejections.length > 0) {
      const reason = fileRejections[0].errors?.[0]?.message || 'File rejected';
      setErrorMessage(reason);
      setStage('ERROR');
      return;
    }

    const file = acceptedFiles[0];
    if (!file) return;

    // Size guard
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage(`File is ${formatBytes(file.size)}. Maximum allowed is ${MAX_FILE_SIZE_MB} MB.`);
      setStage('ERROR');
      return;
    }

    // Filename keyword soft-warning
    const expectedKeyword = FILENAME_KEYWORD[dataType];
    if (expectedKeyword && !file.name.toLowerCase().includes(expectedKeyword)) {
      setFilenameWarning(
        `Filename does not contain "${expectedKeyword}". The system routes files by name — this might be misclassified. You can continue anyway, but consider renaming.`
      );
    } else {
      setFilenameWarning(null);
    }

    setSelectedFile(file);

    // Parse preview (entire file, but display first N rows + totals)
    Papa.parse(file, {
      header: true,
      dynamicTyping: false, // keep as strings for preview; engine will type-coerce
      skipEmptyLines: true,
      preview: 50,  // parse up to 50 rows for preview only — full parse happens server-side
      complete: (results) => {
        if (results.errors && results.errors.length > 0) {
          // Soft errors during parsing — show first one but allow user to continue
          const e = results.errors[0];
          setFilenameWarning(
            (filenameWarning ? filenameWarning + ' • ' : '') +
            `CSV parse warning: ${e.message} (row ${e.row || '?'})`
          );
        }
        const columns = results.meta?.fields || [];
        const rows = results.data?.slice(0, PREVIEW_ROWS) || [];
        // Estimate total rows from file size — rough but useful
        // (proper count will come from the upload phase)
        setPreviewData({
          columns,
          rows,
          previewRowCount: results.data?.length || 0,
          fileSize: file.size,
        });
        setStage('PREVIEWING');
      },
      error: (err) => {
        setErrorMessage(`Could not parse CSV: ${err?.message || 'unknown error'}`);
        setStage('ERROR');
      },
    });
  }, [dataType]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
      'application/csv': ['.csv'],
    },
    disabled: stage !== 'IDLE',
  });

  // -------------------------------------------------------------------------
  // Step 2: User confirms upload → storage + DB insert + parse + DB update
  // -------------------------------------------------------------------------
  const handleConfirmUpload = async () => {
    if (!selectedFile || !user) return;

    cancelledRef.current = false;
    setStage('UPLOADING');
    setProgress(0);

    try {
      // ---- Storage upload ----
      const fileExt = selectedFile.name.split('.').pop();
      const filePath = `${user.id}/${caseId}/${dataType}-${Date.now()}.${fileExt}`;

      // We can't track real upload progress with the JS client easily; use a
      // pseudo-progress that stops at 80% until success arrives.
      const fakeProgressInterval = setInterval(() => {
        setProgress((p) => Math.min(80, p + 10));
      }, 200);

      const { error: uploadError } = await supabase.storage
        .from('epe-uploads')
        .upload(filePath, selectedFile);
      clearInterval(fakeProgressInterval);

      if (cancelledRef.current) return;
      if (uploadError) throw new Error(`Storage upload: ${uploadError.message}`);

      setProgress(80);

      // ---- DB row insert (placeholder data with storagePath) ----
      const { data: dbRecord, error: dbError } = await supabase
        .from(`epe_${dataType}`)
        .insert({
          case_id: caseId,
          user_id: user.id,
          file_name: selectedFile.name,
          data: { storagePath: filePath },
        })
        .select()
        .single();

      if (cancelledRef.current) return;
      if (dbError) throw new Error(`DB insert: ${dbError.message}`);

      // ---- Switch to processing phase ----
      setStage('PROCESSING');
      setProgress(85);

      // ---- Parse the file (client-side, full) ----
      const fileText = await selectedFile.text();
      const parsed = Papa.parse(fileText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
      });

      if (parsed.errors && parsed.errors.length > 0) {
        // Hard parse error → don't commit but don't abort upload (file is in storage)
        // We can choose to rollback by deleting the row + storage. For now: warn + abort.
        const e = parsed.errors[0];
        throw new Error(`CSV parse failed: ${e.message} (row ${e.row || '?'})`);
      }

      const rows = parsed.data || [];
      if (rows.length === 0) {
        throw new Error('CSV had headers but no data rows. Check the file content.');
      }

      setProgress(95);

      // ---- Update DB row with parsed data ----
      const { error: updateError } = await supabase
        .from(`epe_${dataType}`)
        .update({ data: rows })
        .eq('id', dbRecord.id);

      if (cancelledRef.current) return;
      if (updateError) throw new Error(`Saving parsed rows: ${updateError.message}`);

      setProgress(100);
      setSuccessInfo({ fileName: selectedFile.name, rowCount: rows.length });
      setStage('SUCCESS');

      toast({
        title: 'Upload complete',
        description: `${selectedFile.name}: ${rows.length} rows imported.`,
      });

      if (onSuccess) onSuccess(dbRecord);
    } catch (err) {
      console.error('[EpeDataUploader] error:', err);
      setErrorMessage(err?.message || 'An unexpected error occurred.');
      setStage('ERROR');
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: err?.message || 'See error in upload area.',
      });
    }
  };

  // -------------------------------------------------------------------------
  // Cancel during preview
  // -------------------------------------------------------------------------
  const handleCancelPreview = () => {
    cancelledRef.current = true;
    reset();
  };

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------
  const dropzoneClasses = `p-6 border-2 border-dashed rounded-lg transition-colors ${
    stage !== 'IDLE' ? 'cursor-default' : 'cursor-pointer'
  } ${
    isDragActive ? 'border-cyan-400 bg-slate-800' : 'border-slate-600 hover:border-cyan-500'
  }`;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-1">
      <div {...getRootProps()} className={dropzoneClasses}>
        {stage === 'IDLE' && (
          <>
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center text-center text-slate-400 py-4">
              <UploadCloud className="w-10 h-10 mb-3 text-cyan-400" />
              <p className="text-sm font-medium">
                Drop {DATA_TYPE_LABEL[dataType]} CSV here, or click to browse
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Filename should contain "<span className="font-mono">{FILENAME_KEYWORD[dataType]}</span>" • Max {MAX_FILE_SIZE_MB} MB
              </p>
            </div>
          </>
        )}

        <AnimatePresence>
          {stage === 'PREVIEWING' && previewData && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-slate-200"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-6 h-6 text-cyan-400" />
                  <div>
                    <p className="font-medium text-white text-sm">{selectedFile.name}</p>
                    <p className="text-xs text-slate-400">
                      {previewData.columns.length} columns • {previewData.previewRowCount}+ rows • {formatBytes(previewData.fileSize)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCancelPreview}
                  className="text-slate-400 hover:text-white p-1"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {filenameWarning && (
                <div className="mb-3 flex items-start gap-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-200 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{filenameWarning}</span>
                </div>
              )}

              <div className="overflow-x-auto bg-slate-900/50 rounded border border-white/10">
                <table className="text-xs w-full">
                  <thead className="bg-slate-800">
                    <tr>
                      {previewData.columns.slice(0, 8).map((c) => (
                        <th key={c} className="px-2 py-1 text-left text-cyan-300 font-mono whitespace-nowrap">
                          {c}
                        </th>
                      ))}
                      {previewData.columns.length > 8 && (
                        <th className="px-2 py-1 text-left text-slate-500">
                          + {previewData.columns.length - 8} more
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row, i) => (
                      <tr key={i} className="border-t border-white/5">
                        {previewData.columns.slice(0, 8).map((c) => (
                          <td key={c} className="px-2 py-1 text-slate-300 whitespace-nowrap max-w-32 overflow-hidden text-ellipsis">
                            {row[c] !== undefined && row[c] !== null ? String(row[c]) : ''}
                          </td>
                        ))}
                        {previewData.columns.length > 8 && (
                          <td className="px-2 py-1 text-slate-500">…</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={handleCancelPreview} type="button">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmUpload}
                  className="bg-gradient-to-r from-green-500 to-cyan-500 hover:from-green-600 hover:to-cyan-600"
                  type="button"
                >
                  Confirm Upload
                </Button>
              </div>
            </motion.div>
          )}

          {(stage === 'UPLOADING' || stage === 'PROCESSING') && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center text-center py-6 text-slate-300"
            >
              <Loader2 className="w-10 h-10 mb-3 animate-spin text-cyan-400" />
              <p className="text-sm font-medium text-white">
                {stage === 'UPLOADING' ? 'Uploading file…' : 'Parsing and saving rows…'}
              </p>
              <p className="text-xs text-slate-400 mt-1">{selectedFile?.name}</p>
              <div className="w-full max-w-sm mt-3 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 bg-gradient-to-r from-green-500 to-cyan-500 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">{progress}%</p>
            </motion.div>
          )}

          {stage === 'SUCCESS' && successInfo && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center py-4"
            >
              <CheckCircle2 className="w-10 h-10 mb-2 text-green-400" />
              <p className="text-sm font-medium text-white">Imported {successInfo.rowCount} rows</p>
              <p className="text-xs text-slate-400 mt-0.5">{successInfo.fileName}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                className="mt-3"
                type="button"
              >
                Upload another
              </Button>
            </motion.div>
          )}

          {stage === 'ERROR' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center text-center py-4"
            >
              <XCircle className="w-10 h-10 mb-2 text-red-400" />
              <p className="text-sm font-medium text-white">Upload failed</p>
              <p className="text-xs text-red-300 mt-1 max-w-md break-words">{errorMessage}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                className="mt-3"
                type="button"
              >
                Try again
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default EpeDataUploader;
