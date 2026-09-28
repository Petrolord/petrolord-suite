import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { BookOpen, MonitorPlay, ArrowRight, CheckCircle2 } from 'lucide-react';

const ModeSelector = ({ onSelectMode }) => {
    return (
        <div className="relative flex flex-col h-full w-full items-center bg-pl-bg p-4 pt-16 md:p-8 overflow-y-auto">
            <div className="absolute top-4 right-4">
                <ThemeToggle />
            </div>
            <div className="w-full max-w-5xl flex flex-col items-center my-auto">
                <div className="text-center mb-8 md:mb-12 animate-in slide-in-from-top-10 fade-in duration-700">
                    <div className="mb-6 flex justify-center">
                        <div className="p-4 rounded-2xl bg-pl-primary shadow-pl-md">
                             <MonitorPlay className="w-10 h-10 md:w-12 md:h-12 text-pl-primary-fg" />
                        </div>
                    </div>
                    <h1 className="text-3xl md:text-5xl font-bold text-pl-text mb-4 tracking-tight">Welcome to BasinFlow <span className="text-pl-accent-text font-light">GENESIS</span></h1>
                    <p className="text-pl-muted text-base md:text-xl max-w-2xl mx-auto leading-relaxed">
                        Advanced petroleum systems modeling platform. <br className="hidden md:block"/>Choose your preferred workflow to get started.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 w-full">
                    {/* Guided Mode Card */}
                    <Card 
                        className="hover:border-pl-primary/50 hover:bg-pl-sunken transition-[border-color] cursor-pointer group relative overflow-hidden h-auto min-h-[320px] flex flex-col animate-in slide-in-from-left-10 fade-in duration-700 delay-100 shadow-pl-sm"
                        onClick={() => onSelectMode('guided')}
                        data-testid="bf-mode-guided"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-pl-primary" />
                        <div className="p-6 lg:p-8 flex flex-col h-full">
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 bg-pl-sunken rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                    <BookOpen className="w-6 h-6 text-pl-primary-text" />
                                </div>
                                <ArrowRight className="w-5 h-5 text-pl-muted group-hover:text-pl-primary-text transition-colors" />
                            </div>
                            
                            <h3 className="text-xl font-bold text-pl-text mb-3 group-hover:text-pl-primary-text transition-colors">Guided Mode</h3>
                            <p className="text-pl-muted mb-6 text-sm leading-relaxed flex-1">
                                Step-by-step wizard designed for new users or quick screening. 
                                Includes pre-configured basin templates and automated validation.
                            </p>

                            <ul className="space-y-2 mb-6 text-xs md:text-sm text-pl-muted">
                                <li className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-pl-primary-text" /> Template-based setup</li>
                                <li className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-pl-primary-text" /> Automated validation</li>
                            </ul>

                            <Button className="w-full h-10 font-medium transition-all">
                                Start Wizard
                            </Button>
                        </div>
                    </Card>

                    {/* Expert Mode Card */}
                    <Card 
                        className="hover:border-pl-primary/50 hover:bg-pl-sunken transition-[border-color] cursor-pointer group relative overflow-hidden h-auto min-h-[320px] flex flex-col animate-in slide-in-from-right-10 fade-in duration-700 delay-100 shadow-pl-sm"
                        onClick={() => onSelectMode('expert')}
                        data-testid="bf-mode-expert"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-pl-accent" />
                        <div className="p-6 lg:p-8 flex flex-col h-full">
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 bg-pl-sunken rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                    <MonitorPlay className="w-6 h-6 text-pl-primary-text" />
                                </div>
                                <ArrowRight className="w-5 h-5 text-pl-muted group-hover:text-pl-primary-text transition-colors" />
                            </div>
                            
                            <h3 className="text-xl font-bold text-pl-text mb-3 group-hover:text-pl-primary-text transition-colors">Expert Mode</h3>
                            <p className="text-pl-muted mb-6 text-sm leading-relaxed flex-1">
                                Full control interface for advanced users. Build complex models from scratch, 
                                customize all physical parameters, and analyze detailed plots.
                            </p>

                            <ul className="space-y-2 mb-6 text-xs md:text-sm text-pl-muted">
                                <li className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-pl-primary-text" /> Full parameter control</li>
                                <li className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-pl-primary-text" /> Advanced visualization</li>
                            </ul>

                            <Button variant="outline" className="w-full h-10 font-medium group-hover:border-pl-primary/50 transition-all">
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