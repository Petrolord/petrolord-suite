
import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Upload, Play, AlertCircle, Save } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';

const GEOM_API = "https://petrolord-pvt-backend-2025-58b5441b2268.herokuapp.com/geomech";

const GeomechanicsApp = ({ wellId }) => {
    const [well, setWell] = useState(null);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const { toast } = useToast();

    const [params, setParams] = useState({});
    const [velocity, setVelocity] = useState([]);
    const [measurements, setMeasurements] = useState([]);
    const [windowData, setWindowData] = useState(null);
    const [recommendation, setRecommendation] = useState(null);
    const [recMd, setRecMd] = useState('');

    const fetchWellData = useCallback(async () => {
        if (!user || !wellId) return;
        const { data, error } = await supabase.from('wells').select('id, name').eq('id', wellId).single();
        if (error) {
            toast({ variant: 'destructive', title: 'Error fetching well data' });
        } else {
            setWell(data);
        }
    }, [user, wellId, toast]);

    const fetchGeomechData = useCallback(async () => {
        if (!wellId) return;
        setLoading(true);
        const [paramsRes, velocityRes, measurementsRes, windowRes] = await Promise.all([
            supabase.from('geomech_params').select('*').eq('well_id', wellId).order('created_at', { ascending: false }).limit(1).single(),
            supabase.from('geomech_velocity').select('*').eq('well_id', wellId).order('tvd_m'),
            supabase.from('geomech_measurements').select('*').eq('well_id', wellId).order('tvd_m'),
            fetch(`${GEOM_API}/window/${wellId}`).then(res => res.ok ? res.json() : null)
        ]);

        if (paramsRes.data) setParams(paramsRes.data);
        if (velocityRes.data) setVelocity(velocityRes.data);
        if (measurementsRes.data) setMeasurements(measurementsRes.data);
        if (windowRes) setWindowData(windowRes);

        setLoading(false);
    }, [wellId]);
    
    useEffect(() => {
        if (wellId) {
            fetchWellData();
            fetchGeomechData();
        } else {
            setLoading(false);
        }
    }, [wellId, fetchWellData, fetchGeomechData]);


    const handleSaveParams = async () => {
        const { error } = await supabase.from('geomech_params').upsert({ ...params, well_id: wellId, user_id: user.id }, { onConflict: 'well_id' });
        if (error) toast({ variant: 'destructive', title: 'Error saving parameters', description: error.message });
        else toast({ title: 'Parameters saved!' });
    };

    const runModel = async () => {
        try {
            const response = await fetch(`${GEOM_API}/model/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ well_id: wellId, method: params.method || 'eaton', use_params: true, margin_sg: 0.05 })
            });
            if (!response.ok) throw new Error('Model run failed');
            fetchGeomechData();
            toast({ title: 'Model run complete!', description: 'Window data has been updated.' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Model Run Error', description: error.message });
        }
    };
    
    const importVelocity = async (rows) => {
        const { error } = await supabase.from('geomech_velocity').upsert(rows.map(r => ({...r, well_id: wellId, user_id: user.id })), {onConflict: 'well_id, tvd_m'});
        if (error) toast({ variant: 'destructive', title: 'Error importing velocity', description: error.message });
        else {
            toast({ title: 'Velocity data imported!' });
            fetchGeomechData();
        }
    };
    const importMeasurements = async (rows) => {
        const { error } = await supabase.from('geomech_measurements').insert(rows.map(r => ({...r, well_id: wellId, user_id: user.id })));
        if (error) toast({ variant: 'destructive', title: 'Error importing measurements', description: error.message });
        else {
            toast({ title: 'Measurements imported!' });
            fetchGeomechData();
        }
    };
    const getRecommendation = async () => {
        if (!recMd) return;
        const res = await fetch(`${GEOM_API}/recommendation/${wellId}?md_m=${recMd}`);
        if(res.ok) {
            const data = await res.json();
            setRecommendation(data);
        } else {
            toast({variant: 'destructive', title: 'Could not get recommendation'});
        }
    };
    
    if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-16 h-16 animate-spin text-lime-400" /></div>;

    const renderCard = (title, children) => (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
            {children}
        </motion.div>
    );

    return (
        <>
            <Helmet>
                <title>Geomechanics for {well?.name || 'Well'}</title>
            </Helmet>
            <div className="p-4 sm:p-6 md:p-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-6">
                        {renderCard("1. Parameters", (
                            <div className="space-y-3">
                                <Input placeholder="Method (e.g., eaton)" value={params.method || ''} onChange={e => setParams({...params, method: e.target.value})} />
                                <Input type="number" placeholder="Overburden Gradient (sg)" value={params.overburden_grad_sg || ''} onChange={e => setParams({...params, overburden_grad_sg: e.target.value})} />
                                <Input type="number" placeholder="Poisson's Ratio" value={params.poisson || ''} onChange={e => setParams({...params, poisson: e.target.value})} />
                                <Input type="number" placeholder="Eaton Exponent" value={params.eaton_exp || ''} onChange={e => setParams({...params, eaton_exp: e.target.value})} />
                                <Button onClick={handleSaveParams} className="w-full"><Save className="w-4 h-4 mr-2" />Save Parameters</Button>
                            </div>
                        ))}
                        {renderCard("2. Velocity Data", <CsvUploader onUpload={importVelocity} tableData={velocity} columns={['tvd_m', 'vp_mps', 'vs_mps']} />)}
                        {renderCard("3. Measurements", <CsvUploader onUpload={importMeasurements} tableData={measurements} columns={['tvd_m', 'mtype', 'value_num', 'unit']} />)}
                    </div>

                    <div className="space-y-6">
                       {renderCard("4. Run Model", <Button onClick={runModel} className="w-full" disabled={velocity.length === 0}><Play className="w-4 h-4 mr-2"/>Compute Window</Button>)}
                       {renderCard("5. Stability Window", <WindowDisplay data={windowData} />)}
                       {renderCard("6. Recommendation", (
                           <div className="flex gap-2">
                               <Input type="number" placeholder="Enter MD (m)" value={recMd} onChange={e => setRecMd(e.target.value)} />
                               <Button onClick={getRecommendation}>Get Rec</Button>
                               {recommendation && <div className="p-2 bg-slate-700 rounded">Rec MW: {recommendation.rec_mw_sg.toFixed(2)} SG</div>}
                           </div>
                       ))}
                    </div>
                </div>
            </div>
        </>
    );
};


const CsvUploader = ({ onUpload, tableData, columns }) => {
    const { toast } = useToast();
    const onDrop = useCallback((acceptedFiles) => {
        Papa.parse(acceptedFiles[0], {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                onUpload(results.data);
            },
            error: (err) => {
                toast({variant: 'destructive', title: 'CSV Parse Error', description: err.message})
            }
        });
    }, [onUpload, toast]);
    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: {'text/csv': ['.csv']} });

    return (
        <div className="space-y-4">
            <div {...getRootProps()} className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer ${isDragActive ? 'border-lime-400 bg-lime-500/10' : 'border-slate-600'}`}>
                <input {...getInputProps()} />
                <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                <p>Drag 'n' drop a CSV here, or click to select file.</p>
            </div>
            {tableData.length > 0 && (
                <div className="max-h-60 overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>{columns.map(c => <TableHead key={c}>{c}</TableHead>)}</TableRow>
                        </TableHeader>
                        <TableBody>
                            {tableData.slice(0, 5).map((row, i) => (
                                <TableRow key={i}>
                                    {columns.map(c => <TableCell key={c}>{row[c]}</TableCell>)}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {tableData.length > 5 && <p className="text-center text-sm text-slate-400 mt-2">...and {tableData.length - 5} more rows</p>}
                </div>
            )}
        </div>
    )
};


const WindowDisplay = ({ data }) => {
    if (!data) return <div className="text-slate-400 flex items-center justify-center h-48"><AlertCircle className="mr-2"/>No window data. Run model to compute.</div>;
    
    return (
         <div className="w-full h-[400px] flex items-center justify-center text-slate-500">Chart removed</div>
    )
};


export default GeomechanicsApp;
