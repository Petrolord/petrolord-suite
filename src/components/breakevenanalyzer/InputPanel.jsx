import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import CollapsibleSection from './CollapsibleSection';
import VariableCard from './VariableCard';
import { aggregateAnnualProduction } from '@/utils/breakeven/productionCsv';
import { Settings, SlidersHorizontal, BarChart2, Play, PlusCircle, UploadCloud, FileCheck2, Download } from 'lucide-react';

// Economics E2: the inputs live on the page now, not in here, so a study can
// be saved, reopened and reproduced. This panel edits what it is given.
const InputPanel = ({ onAnalyze, loading, inputs, setInputs }) => {
  const { toast } = useToast();

  const handleInputChange = (field, value) => {
    setInputs(prev => ({ ...prev, [field]: value }));
  };
  
  const handleVariableChange = (id, field, value) => {
    setInputs(prev => ({
        ...prev,
        variables: prev.variables.map(v => v.id === id ? { ...v, [field]: value } : v)
    }));
  };

  const addVariable = () => {
    const newId = Math.max(0, ...inputs.variables.map(v => v.id)) + 1;
    setInputs(prev => ({
        ...prev,
        variables: [...prev.variables, { id: newId, name: 'New Variable', p10: 0, p50: 0, p90: 0, distType: 'Triangular' }]
    }));
  };

  const removeVariable = (id) => {
    setInputs(prev => ({
        ...prev,
        variables: prev.variables.filter(v => v.id !== id)
    }));
  };

  // monthly rows at a daily rate -> annual oil (utils/breakeven/productionCsv)
  const processProductionData = (data) => aggregateAnnualProduction(data);

  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        try {
          if (!results.data.length) {
            throw new Error("CSV file is empty.");
          }
          const processedData = processProductionData(results.data);
          handleInputChange('productionData', { data: processedData, fileName: file.name });
          toast({
            title: "File Uploaded",
            description: `${file.name} has been processed and aggregated to annual production.`,
          });
        } catch (error) {
          toast({
            variant: "destructive",
            title: "Invalid CSV Format",
            description: error.message,
          });
        }
      },
      error: (error) => {
        toast({
          variant: "destructive",
          title: "CSV Parsing Error",
          description: error.message,
        });
      }
    });
  }, [toast, setInputs]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  });

  const handleDownloadSample = () => {
    const sampleData = [
      { date: '2025-01-15', oil_rate_bpd: 10000 },
      { date: '2025-02-15', oil_rate_bpd: 9800 },
      { date: '2026-01-15', oil_rate_bpd: 9500 },
    ];
    const csv = Papa.unparse(sampleData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'sample_production_profile.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onAnalyze(inputs);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 h-full flex flex-col">
      <div className="flex-grow space-y-4">
        <h2 className="text-xl font-semibold text-pl-text mb-4">Breakeven Analysis Setup</h2>

        <CollapsibleSection title="Project & Production" icon={<Settings />} defaultOpen>
            <div className="space-y-4">
                <div><Label>Project Name</Label><Input value={inputs.projectName} onChange={(e) => handleInputChange('projectName', e.target.value)} /></div>
                
                <div {...getRootProps()} className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-pl-primary bg-pl-sunken' : 'border-pl-border-strong hover:border-pl-primary'}`}>
                  <input {...getInputProps()} />
                  {inputs.productionData ? (
                    <div className="text-pl-success-text">
                      <FileCheck2 className="w-10 h-10 mx-auto mb-2" />
                      <p className="font-semibold text-pl-text">File Ready</p>
                      <p className="text-sm">{inputs.productionData.fileName}</p>
                    </div>
                  ) : (
                    <div className="text-pl-muted">
                      <UploadCloud className="w-10 h-10 mx-auto mb-2" />
                      <p className="font-semibold text-pl-text">Upload Production Profile</p>
                      <p className="text-sm">Drag & drop a CSV here, or click to select.</p>
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <Button type="button" variant="link" onClick={handleDownloadSample} className="text-pl-primary-text hover:text-pl-primary-text-hover">
                    <Download className="w-4 h-4 mr-2" />
                    Download Sample CSV
                  </Button>
                  <p className="text-xs text-pl-muted">Required columns: date, oil_rate_bpd</p>
                </div>
            </div>
        </CollapsibleSection>

        <CollapsibleSection title="Probabilistic Variables" icon={<BarChart2 />} defaultOpen>
            <div className="space-y-3">
                {inputs.variables.map(variable => (
                    <VariableCard key={variable.id} variable={variable} onChange={handleVariableChange} onRemove={removeVariable} />
                ))}
            </div>
            <Button type="button" variant="outline" onClick={addVariable} className="w-full mt-4">
                <PlusCircle className="w-4 h-4 mr-2" />
                Add Variable
            </Button>
        </CollapsibleSection>

        <CollapsibleSection title="Simulation Settings" icon={<SlidersHorizontal />}>
            <div className="space-y-4">
                <div><Label>Discount Rate (%)</Label><Input type="number" value={inputs.discountRate} onChange={(e) => handleInputChange('discountRate', Number(e.target.value))} /></div>
                <div><Label>Royalty Rate (%)</Label><Input type="number" value={inputs.royaltyRate} onChange={(e) => handleInputChange('royaltyRate', Number(e.target.value))} /></div>
                <div><Label>Tax Rate (%)</Label><Input type="number" value={inputs.taxRate} onChange={(e) => handleInputChange('taxRate', Number(e.target.value))} /></div>
                <div><Label>Target NPV ($MM)</Label><Input type="number" value={inputs.targetNpv} onChange={(e) => handleInputChange('targetNpv', Number(e.target.value))} /></div>
                <div><Label>Monte Carlo Iterations</Label><Input type="number" value={inputs.iterations} onChange={(e) => handleInputChange('iterations', Number(e.target.value))} /></div>
                <div>
                  <Label>Run Seed</Label>
                  <Input type="number" value={inputs.seed} onChange={(e) => handleInputChange('seed', Number(e.target.value))} />
                  <p className="text-[11px] text-pl-muted mt-1">The same inputs and seed reproduce the same answer. Change it to draw a different sample.</p>
                </div>
            </div>
        </CollapsibleSection>
      </div>

      <div className="pt-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Button type="submit" disabled={loading || !inputs.productionData} className="w-full font-semibold py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pl-primary-fg mr-2"></div> : <Play className="w-5 h-5 mr-2" />}
            Run Simulation
          </Button>
        </motion.div>
      </div>
    </form>
  );
};

export default InputPanel;