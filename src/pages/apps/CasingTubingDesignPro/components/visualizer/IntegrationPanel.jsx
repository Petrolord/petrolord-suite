import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, FileSpreadsheet, Share2, Flag, ArrowRight } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const IntegrationPanel = () => {
    const { toast } = useToast();

    const handleIntegration = (service) => {
        toast({
            title: "Integration Triggered",
            description: `Connecting to ${service}... (Mock Service)`,
        });
    };

    return (
        <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4 space-y-4">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Cross-Module Integration</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Button 
                        variant="outline" 
                        className="h-auto py-3 flex flex-col items-center justify-center border-slate-700 hover:bg-slate-800 hover:border-lime-500/50 group"
                        onClick={() => handleIntegration('Well Design Studio')}
                    >
                        <Database className="w-5 h-5 mb-2 text-blue-400 group-hover:text-lime-400" />
                        <span className="text-xs font-semibold text-slate-300">Import Well Path</span>
                        <span className="text-[10px] text-slate-500 mt-1">From Well Design Studio</span>
                    </Button>

                    <Button 
                        variant="outline" 
                        className="h-auto py-3 flex flex-col items-center justify-center border-slate-700 hover:bg-slate-800 hover:border-lime-500/50 group"
                        onClick={() => handleIntegration('PPFG / Geomech')}
                    >
                        <FileSpreadsheet className="w-5 h-5 mb-2 text-amber-400 group-hover:text-lime-400" />
                        <span className="text-xs font-semibold text-slate-300">Import Pore Pressure</span>
                        <span className="text-[10px] text-slate-500 mt-1">From Geomechanics</span>
                    </Button>

                    <Button 
                        variant="outline" 
                        className="h-auto py-3 flex flex-col items-center justify-center border-slate-700 hover:bg-slate-800 hover:border-lime-500/50 group"
                        onClick={() => handleIntegration('AFE Manager')}
                    >
                        <Share2 className="w-5 h-5 mb-2 text-emerald-400 group-hover:text-lime-400" />
                        <span className="text-xs font-semibold text-slate-300">Export Cost Items</span>
                        <span className="text-[10px] text-slate-500 mt-1">To AFE & Cost Manager</span>
                    </Button>

                    <Button 
                        variant="outline" 
                        className="h-auto py-3 flex flex-col items-center justify-center border-slate-700 hover:bg-slate-800 hover:border-lime-500/50 group"
                        onClick={() => handleIntegration('Project Management')}
                    >
                        <Flag className="w-5 h-5 mb-2 text-red-400 group-hover:text-lime-400" />
                        <span className="text-xs font-semibold text-slate-300">Flag Risks</span>
                        <span className="text-[10px] text-slate-500 mt-1">To Project Management</span>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default IntegrationPanel;