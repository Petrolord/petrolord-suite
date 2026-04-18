
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Maximize2, ZoomIn, ZoomOut, Palette, Settings } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BG_THEMES = {
  'dark': { name: 'Dark Gray', paper: '#0f172a', plot: '#0f172a', text: '#94a3b8', grid: '#334155', axis: '#94a3b8' },
  'black': { name: 'Black', paper: '#000000', plot: '#000000', text: '#a3a3a3', grid: '#262626', axis: '#a3a3a3' },
  'white': { name: 'White', paper: '#ffffff', plot: '#ffffff', text: '#475569', grid: '#e2e8f0', axis: '#1e293b' },
  'light': { name: 'Light Gray', paper: '#f8fafc', plot: '#f8fafc', text: '#64748b', grid: '#cbd5e1', axis: '#334155' },
};

const DEFAULT_CURVE_ALIASES = {
    depth: ['DEPTH', 'DEPT', 'MD', 'TVD', 'M', 'FT'],
    gr: ['GR', 'GAMMA', 'GAPI', 'CGR', 'SGR', 'GR_FINAL'],
    res: ['RT', 'RES', 'RDEP', 'ILD', 'LLD', 'AT90', 'RDEEP'],
    den: ['RHOB', 'DEN', 'ZDEN', 'DENSITY', 'BDEN'],
    neu: ['NPHI', 'NEUT', 'TNPH', 'CNPOR', 'NPOR'],
    dt: ['DT', 'DTC', 'DTCO', 'SONIC', 'AC']
};

const findCurveKey = (availableKeys, type) => {
    const aliases = DEFAULT_CURVE_ALIASES[type] || [];
    for (const alias of aliases) {
        if (availableKeys.includes(alias)) return alias;
    }
    for (const alias of aliases) {
        const match = availableKeys.find(k => k.toUpperCase() === alias);
        if (match) return match;
    }
    for (const alias of aliases) {
        const match = availableKeys.find(k => k.toUpperCase().includes(alias));
        if (match) return match;
    }
    return null;
};

const AdvancedWellLogViewer = ({ data, faciesColors }) => {
    const [viewMode, setViewMode] = useState('MD'); 
    const [bgTheme, setBgTheme] = useState('dark');
    
    useEffect(() => {
        const savedTheme = localStorage.getItem('logViewerTheme');
        if (savedTheme && BG_THEMES[savedTheme]) {
            setBgTheme(savedTheme);
        }
    }, []);

    const handleThemeChange = (themeKey) => {
        setBgTheme(themeKey);
        localStorage.setItem('logViewerTheme', themeKey);
    };

    const mappedData = useMemo(() => {
        if (!data || data.length === 0) return null;

        const keys = Object.keys(data[0]);
        
        const depthKey = findCurveKey(keys, 'depth');
        const grKey = findCurveKey(keys, 'gr');
        const resKey = findCurveKey(keys, 'res');
        const denKey = findCurveKey(keys, 'den');
        const neuKey = findCurveKey(keys, 'neu');
        
        const validData = data.filter(d => d[depthKey] !== null && d[depthKey] !== undefined && !isNaN(d[depthKey]));
        
        if (validData.length === 0) return null;

        return {
            depth: validData.map(d => d[depthKey]),
            gr: grKey ? validData.map(d => d[grKey]) : null,
            res: resKey ? validData.map(d => d[resKey]) : null,
            den: denKey ? validData.map(d => d[denKey]) : null,
            neu: neuKey ? validData.map(d => d[neuKey]) : null,
            facies: validData.map(d => d.Facies || 'Unknown'),
            keys: { depth: depthKey, gr: grKey, res: resKey, den: denKey, neu: neuKey }
        };

    }, [data]);

    if (!mappedData) return (
        <div className="flex items-center justify-center h-full text-slate-500 bg-slate-900 border border-slate-800 rounded-lg">
            <div className="text-center">
                <p className="mb-2">No compatible log data found.</p>
                <p className="text-xs">Upload a LAS file containing Depth, GR, Resistivity, Density, or Neutron curves.</p>
            </div>
        </div>
    );

    return (
        <Card className="bg-slate-900 border-slate-800 h-full flex flex-col shadow-lg">
            <CardHeader className="py-2 px-4 border-b border-slate-800 flex flex-row items-center justify-between space-y-0 bg-slate-950/50">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium text-white">Advanced Well Log Viewer</CardTitle>
                    <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400 px-1.5 py-0">Professional</Badge>
                </div>
                <div className="flex items-center gap-2">
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                             <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-slate-800" title="Change Background">
                                <Palette className="w-4 h-4 text-slate-400" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800">
                            {Object.entries(BG_THEMES).map(([key, theme]) => (
                                <DropdownMenuItem 
                                    key={key} 
                                    onClick={() => handleThemeChange(key)}
                                    className={`text-slate-200 hover:bg-slate-800 cursor-pointer ${bgTheme === key ? 'bg-slate-800' : ''}`}
                                >
                                    <div className="w-3 h-3 rounded-full mr-2 border border-slate-600" style={{background: theme.paper}}></div>
                                    {theme.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="w-[1px] h-4 bg-slate-700 mx-1"></div>

                    <div className="flex bg-slate-950 p-0.5 rounded-md border border-slate-700">
                        <Toggle size="sm" pressed={viewMode === 'MD'} onPressedChange={() => setViewMode('MD')} className="h-6 px-2 text-[10px] data-[state=on]:bg-slate-800 data-[state=on]:text-white text-slate-400">MD</Toggle>
                        <Toggle size="sm" pressed={viewMode === 'TVD'} onPressedChange={() => setViewMode('TVD')} className="h-6 px-2 text-[10px] data-[state=on]:bg-slate-800 data-[state=on]:text-white text-slate-400">TVD</Toggle>
                    </div>
                    
                    <div className="w-[1px] h-4 bg-slate-700 mx-1"></div>
                    
                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-slate-800"><ZoomIn className="w-4 h-4 text-slate-400" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-slate-800"><ZoomOut className="w-4 h-4 text-slate-400" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-slate-800"><Maximize2 className="w-4 h-4 text-slate-400" /></Button>
                </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 relative min-h-0 overflow-hidden">
                <div className="flex items-center justify-center w-full h-full text-slate-500">
                    Chart removed
                </div>
            </CardContent>
        </Card>
    );
};

export default AdvancedWellLogViewer;
