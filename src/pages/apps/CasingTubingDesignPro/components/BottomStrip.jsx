import React, { useState } from 'react';
import { useCasingTubingDesign } from '../contexts/CasingTubingDesignContext';
import { ChevronUp, ChevronDown, AlertTriangle, ScrollText, BookOpen, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

const BottomStrip = () => {
    const { logs, warnings } = useCasingTubingDesign();
    const [isOpen, setIsOpen] = useState(true);
    const [activeTab, setActiveTab] = useState('logs');

    return (
        <div className={`bg-pl-surface border-t border-pl-border flex flex-col transition-all duration-300 ${isOpen ? 'h-48' : 'h-9'}`}>
            {/* Header / Tabs */}
            <div className="h-9 flex items-center justify-between px-2 bg-pl-surface border-b border-pl-border shrink-0 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className={`h-7 text-xs rounded-none border-b-2 ${activeTab === 'logs' ? 'border-pl-primary text-pl-text' : 'border-transparent text-pl-muted hover:text-pl-text'}`}
                        onClick={() => { setActiveTab('logs'); setIsOpen(true); }}
                    >
                        <ScrollText className="w-3.5 h-3.5 mr-1.5" /> Calculation Log
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className={`h-7 text-xs rounded-none border-b-2 ${activeTab === 'warnings' ? 'border-pl-warning text-pl-warning-text' : 'border-transparent text-pl-muted hover:text-pl-text'}`}
                        onClick={() => { setActiveTab('warnings'); setIsOpen(true); }}
                    >
                        <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> 
                        Warnings {warnings.length > 0 && `(${warnings.length})`}
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className={`h-7 text-xs rounded-none border-b-2 ${activeTab === 'refs' ? 'border-pl-primary text-pl-text' : 'border-transparent text-pl-muted hover:text-pl-text'}`}
                        onClick={() => { setActiveTab('refs'); setIsOpen(true); }}
                    >
                        <BookOpen className="w-3.5 h-3.5 mr-1.5" /> API References
                    </Button>
                </div>
                
                <Button variant="ghost" size="icon" className="h-6 w-6 text-pl-muted">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </Button>
            </div>

            {/* Content */}
            {isOpen && (
                <div className="flex-1 overflow-hidden bg-pl-bg">
                    {activeTab === 'logs' && (
                        <ScrollArea className="h-full">
                            <div className="p-2 space-y-1 font-pl-mono tabular-nums text-xs">
                                {logs.length === 0 && <p className="text-pl-muted italic px-2">No activity logged yet.</p>}
                                {logs.map((log, i) => (
                                    <div key={i} className="flex space-x-3 text-pl-text hover:bg-pl-sunken p-1 rounded">
                                        <span className="text-pl-muted shrink-0">{format(log.timestamp, 'HH:mm:ss')}</span>
                                        <span className={log.type === 'error' ? 'text-pl-danger-text' : 'text-pl-text'}>{log.message}</span>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                    
                    {activeTab === 'warnings' && (
                        <ScrollArea className="h-full">
                            <div className="p-2 space-y-1">
                                {warnings.length === 0 && <p className="text-pl-muted italic px-2 flex items-center"><ShieldCheck className="w-3 h-3 mr-2"/> No active warnings. Design is compliant.</p>}
                                {warnings.map((w, i) => (
                                    <div key={i} className="flex items-start space-x-2 text-pl-warning-text bg-pl-warning-bg p-2 rounded border border-pl-warning/40">
                                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span className="text-xs">{w.message}</span>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}

                    {activeTab === 'refs' && (
                        <div className="p-4 text-xs text-pl-muted space-y-2">
                            <p><strong>API 5C3:</strong> Calculating Performance Properties of Pipe Used as Casing or Tubing.</p>
                            <p><strong>API TR 5C3:</strong> Technical Report on Equations and Calculations.</p>
                            <p><strong>ISO 10400:</strong> Petroleum and natural gas industries: Equations and calculations for the properties of casing, tubing, drill pipe and line pipe used as casing or tubing.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default BottomStrip;