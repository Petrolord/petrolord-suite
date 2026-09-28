import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, Play, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Papa from 'papaparse';
import { VolumeCalculationEngine } from '../../services/VolumeCalculationEngine';

const BatchProcessor = () => {
    const [data, setData] = useState([]);
    const [results, setResults] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            Papa.parse(file, {
                header: true,
                dynamicTyping: true,
                complete: (results) => {
                    setData(results.data);
                    setResults([]);
                    setProgress(0);
                }
            });
        }
    };

    const runBatch = async () => {
        setIsProcessing(true);
        const calculated = [];
        
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            // Artificial delay for visual effect
            await new Promise(r => setTimeout(r, 50));
            
            try {
                // Map CSV columns to inputs (assuming standard names or robust mapping logic)
                const inputs = {
                    area: row.Area || row.area,
                    thickness: row.Thickness || row.thickness || row.h,
                    porosity: row.Porosity || row.porosity || row.phi,
                    sw: row.Sw || row.sw,
                    ntg: row.NTG || row.ntg || 1,
                    fvf: row.FVF || row.fvf || 1.2,
                    recovery: row.Recovery || row.RF || row.rf || 0.3
                };
                
                const res = VolumeCalculationEngine.calculateDeterministic(inputs, 'field');
                calculated.push({ ...row, ...res, status: 'Success' });
            } catch (e) {
                calculated.push({ ...row, status: 'Error', error: e.message });
            }
            
            setProgress(((i + 1) / data.length) * 100);
        }
        
        setResults(calculated);
        setIsProcessing(false);
    };

    const downloadResults = () => {
        const csv = Papa.unparse(results);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'batch_results.csv');
        link.click();
    };

    return (
        <div className="h-full flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader><CardTitle className="text-pl-text text-sm">1. Upload Data</CardTitle></CardHeader>
                    <CardContent>
                        <div className="border-2 border-dashed border-pl-border rounded-lg p-6 text-center hover:bg-pl-sunken transition-colors relative">
                            <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} />
                            <Upload className="w-8 h-8 text-pl-muted mx-auto mb-2" />
                            <p className="text-sm text-pl-muted">Drop CSV file here</p>
                            <p className="text-xs text-pl-muted mt-1">Required cols: Area, Thickness, Porosity, Sw</p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="text-pl-text text-sm">2. Process</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between text-sm text-pl-muted">
                            <span>Records Loaded:</span>
                            <span className="text-pl-text font-bold">{data.length}</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                        <Button 
                            className="w-full" 
                            disabled={data.length === 0 || isProcessing}
                            onClick={runBatch}
                        >
                            {isProcessing ? 'Processing...' : 'Run Batch Calculation'} <Play className="w-4 h-4 ml-2" />
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="text-pl-text text-sm">3. Export</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between text-sm text-pl-muted">
                            <span>Completed:</span>
                            <span className="text-pl-success-text font-bold">{results.filter(r => r.status === 'Success').length}</span>
                        </div>
                        <Button 
                            className="w-full" 
                            disabled={results.length === 0}
                            onClick={downloadResults}
                        >
                            Download Results <Download className="w-4 h-4 ml-2" />
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <Card className="flex-1 overflow-hidden flex flex-col">
                <CardHeader><CardTitle className="text-pl-text">Data Preview</CardTitle></CardHeader>
                <CardContent className="flex-1 overflow-auto p-0">
                    <Table>
                        <TableHeader className="bg-pl-sunken sticky top-0">
                            <TableRow className="border-pl-border hover:bg-transparent">
                                <TableHead className="text-pl-text">Status</TableHead>
                                <TableHead className="text-pl-text">Area</TableHead>
                                <TableHead className="text-pl-text">Thickness</TableHead>
                                <TableHead className="text-pl-text">Porosity</TableHead>
                                <TableHead className="text-pl-text">Sw</TableHead>
                                <TableHead className="text-pl-text text-right">STOOIP (MMbbl)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(results.length > 0 ? results : data).map((row, i) => (
                                <TableRow key={i} className="border-pl-border hover:bg-pl-sunken">
                                    <TableCell>
                                        {row.status === 'Success' && <CheckCircle className="w-4 h-4 text-pl-success-text"/>}
                                        {row.status === 'Error' && <AlertCircle className="w-4 h-4 text-pl-danger-text"/>}
                                        {!row.status && <span className="text-pl-muted">-</span>}
                                    </TableCell>
                                    <TableCell className="text-pl-text">{row.Area || row.area}</TableCell>
                                    <TableCell className="text-pl-text">{row.Thickness || row.thickness}</TableCell>
                                    <TableCell className="text-pl-text">{row.Porosity || row.porosity}</TableCell>
                                    <TableCell className="text-pl-text">{row.Sw || row.sw}</TableCell>
                                    <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">
                                        {row.stooip ? (row.stooip / 1000000).toFixed(2) : '-'}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-pl-muted py-8">
                                        Upload a CSV file to begin.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
};

export default BatchProcessor;