import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import CollapsibleSection from './CollapsibleSection';
import VariableCard from './VariableCard';
import { Settings, SlidersHorizontal, BarChart2, Play, PlusCircle, UploadCloud, FileCheck2, Download } from 'lucide-react';

const InputPanel = ({ onAnalyze, loading, initialInputs }) => {
  const [inputs, setInputs] = useState(initialInputs);
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

  const processProductionData = (data) => {
    const annualProduction = {};
    const dateKey = Object.keys(data[0]).find(k => k.toLowerCase().includes('date'));
    const oilRateKey = Object.keys(data[0]).find(k => k.toLowerCase().includes('oil_rate'));

    if (!dateKey || !oilRateKey) {
      throw new Error("CSV must contain 'date' and 'oil_rate_bpd' (or similar) columns.");
    }

    data.forEach(row => {
      const date = new Date(row[dateKey]);
      const year = date.getFullYear();
      const oilRate = parseFloat(row[oilRateKey]);

      if (!isNaN(year) && !isNaN(oilRate)) {
        if (!annualProduction[year]) {
          annualProduction[year] = 0;
        }
        // Assuming monthly data, so multiply by avg days in month
        annualProduction[year] += oilRate * 30.44; 
      }
    });

    return Object.entries(annualProduction).map(([year, production]) => ({
      year: parseInt(year),
      oil_production_bbl: production,
    }));
  };

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
  }, [toast]);

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
        <h2 className="text-2xl font-bold text-white mb-4">Breakeven Analysis Setup</h2>

        <CollapsibleSection title="Project & Production" icon={<Settings />} defaultOpen>
            <div className="space-y-4">
                <div><Label className="text-lime-300">Project Name</Label><Input value={inputs.projectName} onChange={(e) => handleInputChange('projectName', e.target.value)} className="bg-white/5 border-white/20" /></div>
                
                <div {...getRootProps()} className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-lime-400 bg-lime-500/10' : 'border-white/20 hover:border-lime-400/50'}`}>
                  <input {...getInputProps()} />
                  {inputs.productionData ? (
                    <div className="text-lime-300">
                      <FileCheck2 className="w-10 h-10 mx-auto mb-2" />
                      <p className="font-semibold text-white">File Ready</p>
                      <p className="text-sm">{inputs.productionData.fileName}</p>
                    </div>
                  ) : (
                    <div className="text-slate-400">
                      <UploadCloud className="w-10 h-10 mx-auto mb-2" />
                      <p className="font-semibold text-white">Upload Production Profile</p>
                      <p className="text-sm">Drag & drop a CSV here, or click to select.</p>
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <Button type="button" variant="link" onClick={handleDownloadSample} className="text-lime-400 hover:text-lime-300">
                    <Download className="w-4 h-4 mr-2" />
                    Download Sample CSV
                  </Button>
                  <p className="text-xs text-slate-500">Required columns: date, oil_rate_bpd</p>
                </div>
            </div>
        </CollapsibleSection>

        <CollapsibleSection title="Probabilistic Variables" icon={<BarChart2 />} defaultOpen>
            <div className="space-y-3">
                {inputs.variables.map(variable => (
                    <VariableCard key={variable.id} variable={variable} onChange={handleVariableChange} onRemove={removeVariable} />
                ))}
            </div>
            <Button type="button" variant="outline" onClick={addVariable} className="w-full mt-4 border-lime-400 text-lime-400 hover:bg-lime-400/10 hover:text-lime-300">
                <PlusCircle className="w-4 h-4 mr-2" />
                Add Variable
            </Button>
        </CollapsibleSection>

        <CollapsibleSection title="Simulation Settings" icon={<SlidersHorizontal />}>
            <div className="space-y-4">
                <div><Label className="text-lime-300">Discount Rate (%)</Label><Input type="number" value={inputs.discountRate} onChange={(e) => handleInputChange('discountRate', Number(e.target.value))} className="bg-white/5 border-white/20" /></div>
                <div><Label className="text-lime-300">Royalty Rate (%)</Label><Input type="number" value={inputs.royaltyRate} onChange={(e) => handleInputChange('royaltyRate', Number(e.target.value))} className="bg-white/5 border-white/20" /></div>
                <div><Label className="text-lime-300">Tax Rate (%)</Label><Input type="number" value={inputs.taxRate} onChange={(e) => handleInputChange('taxRate', Number(e.target.value))} className="bg-white/5 border-white/20" /></div>
                <div><Label className="text-lime-300">Target NPV ($MM)</Label><Input type="number" value={inputs.targetNpv} onChange={(e) => handleInputChange('targetNpv', Number(e.target.value))} className="bg-white/5 border-white/20" /></div>
                <div><Label className="text-lime-300">Monte Carlo Iterations</Label><Input type="number" value={inputs.iterations} onChange={(e) => handleInputChange('iterations', Number(e.target.value))} className="bg-white/5 border-white/20" /></div>
                <div>
                  <Label className="text-lime-300">Run Seed</Label>
                  <Input type="number" value={inputs.seed} onChange={(e) => handleInputChange('seed', Number(e.target.value))} className="bg-white/5 border-white/20" />
                  <p className="text-[11px] text-slate-400 mt-1">The same inputs and seed reproduce the same answer. Change it to draw a different sample.</p>
                </div>
            </div>
        </CollapsibleSection>
      </div>

      <div className="pt-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Button type="submit" disabled={loading || !inputs.productionData} className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-semibold py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div> : <Play className="w-5 h-5 mr-2" />}
            Run Simulation
          </Button>
        </motion.div>
      </div>
    </form>
  );
};

export default InputPanel;