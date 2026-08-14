import React, { useState } from 'react';
import { useFDP } from '@/contexts/FDPContext';
import CollapsibleSection from '@/components/fdp/CollapsibleSection';
import FDPGenerationOverview from './generation/FDPGenerationOverview';
import FDPDataCompilation from './generation/FDPDataCompilation';
import FDPExport from './generation/FDPExport';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

const FDPGenerationModule = () => {
    const { state } = useFDP();
    
    // Simple tab state logic if needed within module, but using collapsible sections for simplicity/consistency
    
    return (
        <div className="space-y-6 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">Document Generation</h2>
                    <p className="text-slate-400">Compile, validate, and export the final Field Development Plan.</p>
                </div>
                <div className="flex gap-2">
                    <Button className="bg-blue-600 hover:bg-blue-700">
                        <FileText className="w-4 h-4 mr-2" /> Preview Document
                    </Button>
                </div>
            </div>

            <CollapsibleSection title="Generation Status" defaultOpen>
                <FDPGenerationOverview state={state} />
            </CollapsibleSection>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CollapsibleSection title="Data Compilation & Validation" defaultOpen>
                    <FDPDataCompilation state={state} />
                </CollapsibleSection>

                <CollapsibleSection title="Export & Share" defaultOpen>
                    <FDPExport state={state} />
                </CollapsibleSection>
            </div>
        </div>
    );
};

export default FDPGenerationModule;