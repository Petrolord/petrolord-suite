import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReservoirCalcProvider, useReservoirCalc } from './contexts/ReservoirCalcContext';
import ExpertInputPanel from './components/ExpertInputPanel';
import ExpertVisPanel from './components/ExpertVisPanel';
import ExpertResultsPanel from './components/ExpertResultsPanel';
import DocumentationHub from './components/docs/DocumentationHub';
import ProjectManager from './components/tools/ProjectManager';
import { HelpCircle, Folder, ChevronLeft, ChevronRight, Sidebar, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const Header = ({ onOpenDocs, onToggleLeft, onToggleRight, isLeftOpen, isRightOpen }) => {
    const { state, saveCurrentProject } = useReservoirCalc();
    const { user } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [saveOpen, setSaveOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [meta, setMeta] = useState({ name: '', description: '' });

    const handleSaveClick = () => {
        setMeta({
            name: state.currentProjectMeta?.name || state.reservoirName || '',
            description: state.currentProjectMeta?.description || ''
        });
        setSaveOpen(true);
    };

    const performSave = async () => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Not signed in', description: 'Sign in to save projects.' });
            return;
        }
        if (!meta.name.trim()) {
            toast({ variant: 'destructive', title: 'Project name is required.' });
            return;
        }
        setSaving(true);
        try {
            await saveCurrentProject(user.id, meta);
            toast({ title: 'Project saved', description: `"${meta.name.trim()}" is saved.` });
            setSaveOpen(false);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message, duration: 8000 });
        } finally {
            setSaving(false);
        }
    };

    return (
        <header className="h-12 border-b border-slate-800 bg-slate-900 px-4 flex items-center justify-between shrink-0 select-none">
            <div className="flex items-center gap-4">
                {/* Navigation / Breadcrumbs */}
                <div className="flex items-center text-sm">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-slate-400 hover:text-white mr-2"
                                    onClick={() => navigate('/dashboard/geoscience')}
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Back to Geoscience Analytics Hub</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    
                    <div className="hidden md:flex items-center text-slate-500 font-medium">
                        <span 
                            className="hover:text-blue-400 cursor-pointer transition-colors flex items-center gap-1"
                            onClick={() => navigate('/dashboard/geoscience')}
                        >
                            <Home className="w-3.5 h-3.5" />
                            Geoscience Hub
                        </span>
                        <ChevronRight className="w-4 h-4 mx-1 opacity-50" />
                        <span className="text-slate-200 font-semibold">ReservoirCalc Pro</span>
                    </div>
                </div>

                <div className="h-5 w-px bg-slate-700 mx-2 hidden md:block" />

                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800 hidden md:flex"
                    onClick={onToggleLeft}
                    title={isLeftOpen ? "Collapse Inputs" : "Expand Inputs"}
                >
                    <Sidebar className={`w-4 h-4 transition-transform ${!isLeftOpen ? 'rotate-180' : ''}`} />
                </Button>

                <div className="flex flex-col justify-center ml-2">
                     <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-300 max-w-[200px] truncate hidden lg:inline-block">
                            {state.currentProjectMeta?.name || 'Unsaved Workspace'}
                        </span>
                        {state.isDirty && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-amber-400 border-amber-500/30">Modified</Badge>}
                     </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2 h-8 text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200">
                            <Folder className="w-3 h-3" />
                            <span className="hidden md:inline">Projects</span>
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 w-[400px] bg-slate-950 border-r border-slate-800">
                        <ProjectManager />
                    </SheetContent>
                </Sheet>

                <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" onClick={handleSaveClick} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/10">
                            Save
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border-slate-800 text-white">
                        <div className="space-y-4 py-4">
                            <h3 className="text-lg font-bold">Save Project</h3>
                            <div className="space-y-2">
                                <Label>Project Name</Label>
                                <Input value={meta.name} onChange={e => setMeta({...meta, name: e.target.value})} className="bg-slate-950 border-slate-700" />
                            </div>
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Textarea value={meta.description} onChange={e => setMeta({...meta, description: e.target.value})} className="bg-slate-950 border-slate-700" />
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                                <Button variant="ghost" onClick={() => setSaveOpen(false)} disabled={saving}>Cancel</Button>
                                <Button onClick={performSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? 'Saving…' : 'Save'}</Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                <Button variant="ghost" size="sm" className="w-8 h-8 p-0 text-slate-400 hover:text-white" onClick={onOpenDocs}>
                    <HelpCircle className="w-4 h-4" />
                </Button>

                <div className="h-5 w-px bg-slate-700 mx-1 hidden md:block" />

                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800 hidden md:flex"
                    onClick={onToggleRight}
                    title={isRightOpen ? "Collapse Results" : "Expand Results"}
                >
                    <Sidebar className={`w-4 h-4 transition-transform ${isRightOpen ? 'rotate-180' : ''}`} />
                </Button>
            </div>
        </header>
    );
};

const ReservoirCalcProContent = () => {
    const [isDocsOpen, setIsDocsOpen] = useState(false);
    
    // Panel States (Persisted)
    const [showLeft, setShowLeft] = useState(() => localStorage.getItem('rc_showLeft') !== 'false');
    const [showRight, setShowRight] = useState(() => localStorage.getItem('rc_showRight') !== 'false');

    useEffect(() => {
        localStorage.setItem('rc_showLeft', showLeft);
        localStorage.setItem('rc_showRight', showRight);
    }, [showLeft, showRight]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKey = (e) => {
            if (e.ctrlKey && e.key === 'b') { // Common IDE sidebar toggle
                e.preventDefault();
                setShowLeft(p => !p);
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
            <Header 
                onOpenDocs={() => setIsDocsOpen(true)} 
                onToggleLeft={() => setShowLeft(!showLeft)}
                onToggleRight={() => setShowRight(!showRight)}
                isLeftOpen={showLeft}
                isRightOpen={showRight}
            />

            <div className="flex-1 overflow-hidden flex p-2 gap-2">
                {/* Left Panel: Inputs */}
                <div 
                    className={`flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden flex flex-col rounded-lg border border-slate-800 bg-slate-900/30 backdrop-blur-sm ${showLeft ? 'w-80 opacity-100 ml-0' : 'w-0 opacity-0 -ml-2 border-0'}`}
                >
                    <ExpertInputPanel />
                </div>

                {/* Center Panel: Visualization */}
                <div className="flex-1 h-full overflow-hidden rounded-lg border border-slate-800 bg-black relative shadow-2xl flex flex-col">
                    <ExpertVisPanel />
                </div>

                {/* Right Panel: Results & Analytics */}
                <div 
                    className={`flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden flex flex-col rounded-lg border border-slate-800 bg-slate-900/30 backdrop-blur-sm ${showRight ? 'w-96 opacity-100 mr-0' : 'w-0 opacity-0 -mr-2 border-0'}`}
                >
                    <ExpertResultsPanel />
                </div>
            </div>
            
            <DocumentationHub open={isDocsOpen} onOpenChange={setIsDocsOpen} />
        </div>
    );
};

const ReservoirCalcPro = () => {
    return (
        <ReservoirCalcProvider>
            <TooltipProvider>
                <ReservoirCalcProContent />
            </TooltipProvider>
        </ReservoirCalcProvider>
    );
};

export default ReservoirCalcPro;