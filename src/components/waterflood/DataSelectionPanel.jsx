import React, { useState, useEffect } from 'react';
    import { motion } from 'framer-motion';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { Textarea } from '@/components/ui/textarea';
    import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
    import { useToast } from '@/components/ui/use-toast';
    import { Upload, Database, HelpCircle, Play, FileJson, FileText } from 'lucide-react';
    import {
      Dialog,
      DialogContent,
      DialogHeader,
      DialogTitle,
      DialogDescription,
      DialogTrigger,
    } from "@/components/ui/dialog"
    import Papa from 'papaparse';
    import { WATERFLOOD_SCHEMA, sampleWaterfloodCSV } from '@/utils/waterfloodCalculations';

    const DataSelectionPanel = ({ onAnalyze, loading }) => {
      const { toast } = useToast();
      const [config, setConfig] = useState({
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        unit_system: 'field',
        bw: 1.02,
        bo: 1.25,
        bg: 0.9,
        rs: 500,
        smooth_window_days: 5,
        vrr_window_days: 30,
        target_vrr: 1.0,
      });
      const [jsonRows, setJsonRows] = useState('');
      const [csvFile, setCsvFile] = useState(null);
      const [activeTab, setActiveTab] = useState('csv');
      const [isSchemaHelpOpen, setIsSchemaHelpOpen] = useState(false);
      const [schemaInfo, setSchemaInfo] = useState(null);
      const [sampleCsv, setSampleCsv] = useState(null);
      const [samplePreview, setSamplePreview] = useState([]);

      const handleConfigChange = (e) => {
        const { name, value } = e.target;
        setConfig(prev => ({ ...prev, [name]: value }));
      };

      const handleFileChange = (e) => {
        setCsvFile(e.target.files[0]);
      };

      const handleRunAnalysis = () => {
        if (activeTab === 'csv') {
          if (!csvFile) {
            toast({ title: "No CSV file selected", variant: "destructive" });
            return;
          }
          const reader = new FileReader();
          reader.onload = (e) => {
            const fileContent = e.target.result;
            onAnalyze({ file_content: fileContent, config }, true);
          };
          reader.readAsText(csvFile);
        } else {
          try {
            const rows = JSON.parse(jsonRows);
            if (!Array.isArray(rows)) throw new Error("JSON must be an array of objects.");
            const payload = { config, rows };
            onAnalyze(payload, false);
          } catch (error) {
            toast({ title: "Invalid JSON", description: error.message, variant: "destructive" });
          }
        }
      };

      useEffect(() => {
        // Schema + sample are produced by the local engine — no backend round-trip.
        const csv = sampleWaterfloodCSV();
        setSchemaInfo(WATERFLOOD_SCHEMA);
        setSampleCsv(csv);
        Papa.parse(csv, {
          header: true,
          preview: 5,
          complete: (results) => setSamplePreview(results.data),
        });
      }, []);

      const downloadSampleCsv = () => {
        if (!sampleCsv) return;
        const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'sample_waterflood_data.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };

      return (
        <>
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6 space-y-6"
          >
            <h2 className="text-2xl font-bold text-white">Data & Config</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Start Date</Label><Input type="date" name="start_date" value={config.start_date} onChange={handleConfigChange} className="bg-gray-700 border-gray-600 text-white"/></div>
              <div><Label>End Date</Label><Input type="date" name="end_date" value={config.end_date} onChange={handleConfigChange} className="bg-gray-700 border-gray-600 text-white"/></div>
              <div><Label>Unit System</Label><Input type="text" name="unit_system" value={config.unit_system} onChange={handleConfigChange} className="bg-gray-700 border-gray-600 text-white"/></div>
              <div><Label>Bo (RB/STB)</Label><Input type="number" name="bo" value={config.bo} onChange={handleConfigChange} className="bg-gray-700 border-gray-600 text-white"/></div>
              <div><Label>Bw (RB/bbl)</Label><Input type="number" name="bw" value={config.bw} onChange={handleConfigChange} className="bg-gray-700 border-gray-600 text-white"/></div>
              <div><Label>Bg (RB/Mscf)</Label><Input type="number" name="bg" value={config.bg} onChange={handleConfigChange} className="bg-gray-700 border-gray-600 text-white"/></div>
              <div><Label>Rs (scf/STB)</Label><Input type="number" name="rs" value={config.rs} onChange={handleConfigChange} className="bg-gray-700 border-gray-600 text-white"/></div>
              <div><Label>Smooth Window (days)</Label><Input type="number" name="smooth_window_days" value={config.smooth_window_days} onChange={handleConfigChange} className="bg-gray-700 border-gray-600 text-white"/></div>
              <div><Label>VRR Window (days)</Label><Input type="number" name="vrr_window_days" value={config.vrr_window_days} onChange={handleConfigChange} className="bg-gray-700 border-gray-600 text-white"/></div>
              <div><Label>Target VRR</Label><Input type="number" name="target_vrr" value={config.target_vrr} onChange={handleConfigChange} className="bg-gray-700 border-gray-600 text-white"/></div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="csv"><Upload className="w-4 h-4 mr-2 inline-block"/>Upload CSV</TabsTrigger>
                <TabsTrigger value="json"><FileJson className="w-4 h-4 mr-2 inline-block"/>Paste JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="csv" className="mt-4">
                <Label htmlFor="csv-upload">Upload Production/Injection Data</Label>
                <Input id="csv-upload" type="file" accept=".csv" onChange={handleFileChange} className="file:text-lime-300 bg-gray-700 border-gray-600"/>
              </TabsContent>
              <TabsContent value="json" className="mt-4">
                <Label>Paste JSON Rows</Label>
                <Textarea value={jsonRows} onChange={(e) => setJsonRows(e.target.value)} placeholder='[{"date": "2024-01-01", ...}]' rows={5} className="bg-gray-700 border-gray-600 text-white"/>
              </TabsContent>
            </Tabs>

            <div className="flex flex-col space-y-2">
              <Button onClick={handleRunAnalysis} disabled={loading} className="w-full bg-gradient-to-r from-lime-600 to-green-600 text-white font-semibold">
                {loading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div> : <><Play className="w-4 h-4 mr-2"/>Run Analysis</>}
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/20">
                    <Database className="w-4 h-4 mr-2"/>Load Sample Data
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-4xl">
                  <DialogHeader>
                    <DialogTitle className="text-2xl text-cyan-300">Sample Data Preview</DialogTitle>
                    <DialogDescription className="text-slate-400">
                      Here's a preview of the sample data. You can download the full file.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="overflow-x-auto max-h-[60vh]">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-lime-300 uppercase bg-slate-800">
                        <tr>{samplePreview[0] && Object.keys(samplePreview[0]).map(h => <th key={h} className="px-4 py-2">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {samplePreview.map((row, i) => (
                          <tr key={i} className="bg-slate-900 border-b border-slate-800">
                            {Object.values(row).map((val, j) => <td key={j} className="px-4 py-2 font-mono">{val}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button onClick={downloadSampleCsv} className="mt-4 w-full">Download Full Sample CSV</Button>
                </DialogContent>
              </Dialog>
              <Button onClick={() => setIsSchemaHelpOpen(true)} variant="outline" className="w-full border-purple-400/50 text-purple-300 hover:bg-purple-500/20">
                <HelpCircle className="w-4 h-4 mr-2"/>Schema Help
              </Button>
            </div>
          </motion.div>

          <Dialog open={isSchemaHelpOpen} onOpenChange={setIsSchemaHelpOpen}>
            <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl text-lime-300 flex items-center"><FileText className="w-6 h-6 mr-2"/>Expected Data Schema</DialogTitle>
                <DialogDescription className="text-slate-400">
                  Your CSV or JSON data should conform to the following structure for successful analysis.
                </DialogDescription>
              </DialogHeader>
              {schemaInfo ? (
                <div className="max-h-[60vh] overflow-y-auto pr-4">
                  <h3 className="font-bold text-lg text-white mt-4 mb-2">Required Columns</h3>
                  <ul className="list-disc list-inside space-y-2">
                    {schemaInfo.required_columns.map(col => (
                      <li key={col.name}><span className="font-mono bg-slate-800 text-lime-300 px-2 py-1 rounded">{col.name}</span>: {col.note}</li>
                    ))}
                  </ul>
                  <h3 className="font-bold text-lg text-white mt-4 mb-2">Optional Columns</h3>
                  <ul className="list-disc list-inside space-y-2">
                    {schemaInfo.optional_columns.map(col => (
                      <li key={col.name}><span className="font-mono bg-slate-800 text-lime-300 px-2 py-1 rounded">{col.name}</span>: {col.note}</li>
                    ))}
                  </ul>
                  <h3 className="font-bold text-lg text-white mt-4 mb-2">Processing Notes</h3>
                  <ul className="list-disc list-inside space-y-2 text-slate-300">
                    {schemaInfo.notes.map((note, i) => <li key={i}>{note}</li>)}
                  </ul>
                </div>
              ) : <p>Loading schema information...</p>}
            </DialogContent>
          </Dialog>
        </>
      );
    };

    export default DataSelectionPanel;