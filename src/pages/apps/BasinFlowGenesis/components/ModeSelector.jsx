import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, MonitorPlay, ArrowRight, CheckCircle2 } from 'lucide-react';

const ModeSelector = ({ onSelectMode }) => {
    return (
        <div className="flex flex-col h-full w-full items-center justify-center bg-slate-950 p-4 md:p-8 overflow-y-auto">
            <div className="w-full max-w-5xl flex flex-col items-center my-auto">
                <div className="text-center mb-8 md:mb-12 animate-in slide-in-from-top-10 fade-in duration-700">
                    <div className="mb-6 flex justify-center">
                        <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 shadow-2xl shadow-indigo-900/50">
                             <MonitorPlay className="w-10 h-10 md:w-12 md:h-12 text-white" />
                        </div>
                    </div>
                    <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight">Welcome to BasinFlow <span className="text-indigo-400 font-light">GENESIS</span></h1>
                    <p className="text-slate-400 text-base md:text-xl max-w-2xl mx-auto leading-relaxed">
                        Advanced petroleum systems modeling platform. <br className="hidden md:block"/>Choose your preferred workflow to get started.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 w-full">
                    {/* Guided Mode Card */}
                    <Card 
                        className="bg-slate-900/50 border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-900/10 transition-all cursor-pointer group relative overflow-hidden h-auto min-h-[320px] flex flex-col animate-in slide-in-from-left-10 fade-in duration-700 delay-100 shadow-xl"
                        onClick={() => onSelectMode('guided')}
                        data-testid="bf-mode-guided"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
                        <div className="p-6 lg:p-8 flex flex-col h-full">
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 bg-emerald-900/30 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                    <BookOpen className="w-6 h-6 text-emerald-400" />
                                </div>
                                <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                            </div>
                            
                            <h3 className="text-xl font-bold text-white mb-3 group-hover:text-emerald-400 transition-colors">Guided Mode</h3>
                            <p className="text-slate-400 mb-6 text-sm leading-relaxed flex-1">
                                Step-by-step wizard designed for new users or quick screening. 
                                Includes pre-configured basin templates and automated validation.
                            </p>

                            <ul className="space-y-2 mb-6 text-xs md:text-sm text-slate-500">
                                <li className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-emerald-500/70" /> Template-based setup</li>
                                <li className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-emerald-500/70" /> Automated validation</li>
                            </ul>

                            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-10 font-medium shadow-lg shadow-emerald-900/20 group-hover:shadow-emerald-500/20 transition-all">
                                Start Wizard
                            </Button>
                        </div>
                    </Card>

                    {/* Expert Mode Card */}
                    <Card 
                        className="bg-slate-900/50 border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-900/10 transition-all cursor-pointer group relative overflow-hidden h-auto min-h-[320px] flex flex-col animate-in slide-in-from-right-10 fade-in duration-700 delay-100 shadow-xl"
                        onClick={() => onSelectMode('expert')}
                        data-testid="bf-mode-expert"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-blue-400" />
                        <div className="p-6 lg:p-8 flex flex-col h-full">
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 bg-indigo-900/30 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                    <MonitorPlay className="w-6 h-6 text-indigo-400" />
                                </div>
                                <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                            </div>
                            
                            <h3 className="text-xl font-bold text-white mb-3 group-hover:text-indigo-400 transition-colors">Expert Mode</h3>
                            <p className="text-slate-400 mb-6 text-sm leading-relaxed flex-1">
                                Full control interface for advanced users. Build complex models from scratch, 
                                customize all physical parameters, and analyze detailed plots.
                            </p>

                            <ul className="space-y-2 mb-6 text-xs md:text-sm text-slate-500">
                                <li className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-indigo-500/70" /> Full parameter control</li>
                                <li className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-indigo-500/70" /> Advanced visualization</li>
                            </ul>

                            <Button variant="outline" className="w-full border-slate-700 hover:bg-indigo-950 text-slate-300 hover:text-white h-10 font-medium group-hover:border-indigo-500/50 transition-all">
                                Enter Workspace
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default ModeSelector;