import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseCSV, detectColumns, mapColumns, validateData } from '@/utils/declineCurve/csvParser';
import { generateQCSummary } from '@/utils/declineCurve/dataQuality';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { useToast } from '@/components/ui/use-toast';

const DCADataImporter = () => {
  const { currentWell, importProductionData, setDataQuality, clearWellData } = useDeclineCurve();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!currentWell) {
      toast({ title: "No well selected", description: "Please select a well first.", variant: "destructive" });
      return;
    }
    const file = acceptedFiles[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      const text = await file.text();
      const { headers, rows } = await parseCSV(text);
      const mapping = detectColumns(headers);
      if (!mapping.date || !mapping.rate) {
        throw new Error("Could not auto-detect Date or Rate columns. Please verify CSV format.");
      }
      const mappedData = mapColumns(rows, mapping);
      const validation = validateData(mappedData);
      if (!validation.valid) {
        toast({ title: "Data Validation Failed", description: validation.errors[0], variant: "destructive" });
        return;
      }
      const qc = generateQCSummary(mappedData);
      setDataQuality(qc);

      // Build file metadata for display
      const dates = mappedData
        .map(d => new Date(d.date))
        .filter(d => !isNaN(d.getTime()))
        .sort((a, b) => a - b);
      const dataMeta = {
        fileName: file.name,
        rowCount: mappedData.length,
        importedAt: new Date().toISOString(),
        dateRange: dates.length > 0 ? {
          start: dates[0].toISOString().slice(0, 10),
          end: dates[dates.length - 1].toISOString().slice(0, 10)
        } : null
      };

      importProductionData(currentWell.id, mappedData, dataMeta);
      toast({ title: "Import Successful", description: `Loaded ${mappedData.length} records.` });
    } catch (error) {
      console.error(error);
      toast({ title: "Import Error", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }, [currentWell, importProductionData, setDataQuality, toast]);

  const handleClear = () => {
    if (currentWell && clearWellData) {
      clearWellData(currentWell.id);
      toast({ title: "Data Cleared", description: `${currentWell.name} data removed.` });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.csv']},
    multiple: false,
    disabled: isProcessing
  });

  if (!currentWell) return null;

  const meta = currentWell.dataMeta;
  const hasData = !!(meta && currentWell.data && currentWell.data.length > 0);

  return (
    <div className="space-y-2">
      {hasData ? (
        <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/20 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-emerald-300 truncate">{meta.fileName}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {meta.rowCount.toLocaleString()} records
                {meta.dateRange && ` · ${meta.dateRange.start} → ${meta.dateRange.end}`}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <div {...getRootProps()} className="flex-1">
              <input {...getInputProps()} />
              <Button variant="outline" size="sm" className="w-full h-7 text-[11px] gap-1 bg-slate-800/50 border-slate-700">
                <RefreshCw size={11} /> Replace File
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="h-7 text-[11px] gap-1 bg-slate-800/50 border-slate-700 text-slate-400 hover:text-red-400"
            >
              <X size={11} /> Clear
            </Button>
          </div>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 hover:border-slate-500'}
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Upload size={24} />
            <p className="text-sm">{isProcessing ? 'Processing...' : 'Drop CSV file here or click to upload'}</p>
            <span className="text-xs text-slate-500">Required: Date, Rate</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DCADataImporter;
