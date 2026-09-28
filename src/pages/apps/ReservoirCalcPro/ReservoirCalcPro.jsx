import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReservoirCalcProvider, useReservoirCalc } from './contexts/ReservoirCalcContext';
import { useReservoirSettings } from './hooks/useReservoirSettings';
import ExpertInputPanel from './components/ExpertInputPanel';
import ExpertVisPanel from './components/ExpertVisPanel';
import ExpertResultsPanel from './components/ExpertResultsPanel';
import DocumentationHub from './components/docs/DocumentationHub';
import ProjectManager from './components/tools/ProjectManager';
import ReservoirSwitcher from './components/tools/ReservoirSwitcher';
import WorkspaceToolsHub from './components/tools/WorkspaceToolsHub';
import PanelErrorBoundary from './components/common/PanelErrorBoundary';
import { HelpCircle, Folder, ChevronLeft, ChevronRight, Sidebar, ArrowLeft, Home, Wrench } from 'lucide-react';
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
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ThemedApp } from '@/design/ThemeProvider';

const Header = ({ onOpenDocs, onToggleLeft, onToggleRight, isLeftOpen, isRightOpen }) => {
    const { state, saveCurrentProject } = useReservoirCalc();
    const { user: authUser } = useAuth();
    const { backend } = useReservoirCalc();
    // the harness backend carries a dev user so Save works without auth (RC0)
    const user = backend?.devUser || authUser;
    const { toast } = useToast();
    const navigate = useNavigate();
    const [saveOpen, setSaveOpen] = useState(false);
    const [projectsOpen, setProjectsOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [meta, setMeta] = useState({ name: '', description: '' });
    const [settings] = useReservoirSettings();

    // Auto-save: after a run, re-persist an already-saved project (never silently
    // creates a new one). Deduped on the results object identity.
    const lastAutoSave = useRef(null);
    useEffect(() => {
        if (!settings.autoSave || !user?.id || !state.project.id) return;
        const sig = state.results || state.probResults;
        if (!sig || lastAutoSave.current === sig) return;
        lastAutoSave.current = sig;
        saveCurrentProject(user.id).catch(() => {});
    }, [state.results, state.probResults, settings.autoSave, user, state.project.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSaveClick = () => {
        setMeta({
            name: state.currentProjectMeta?.name || state.reservoirName || '',
            description: state.currentProjectMeta?.description || ''
        });
        setSaveError(null);
        setSaveOpen(true);
    };

    const performSave = async () => {
        if (!user) {
            setSaveError('You are not signed in. Sign in to save projects.');
            return;
        }
        if (!meta.name.trim()) {
            setSaveError('Project name is required.');
            return;
        }
        setSaving(true);
        setSaveError(null);
        try {
            await saveCurrentProject(user.id, meta);
            toast({ title: 'Project saved', description: `"${meta.name.trim()}" is saved.` });
            setSaveOpen(false);
        } catch (e) {
            // Keep the dialog open and show the reason inline; a toast alone is
            // easy to miss behind the overlay.
            setSaveError(e.message || 'Unexpected error.');
            toast({ variant: 'destructive', title: 'Save failed', description: e.message, duration: 8000 });
        } finally {
            setSaving(false);
        }
    };

    return (
        <header className="h-12 border-b border-pl-border bg-pl-surface px-2 sm:px-4 gap-2 flex items-center justify-between shrink-0 select-none">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-4">
                {/* Navigation / Breadcrumbs */}
                <div className="flex items-center text-sm">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-pl-muted hover:text-pl-text mr-2"
                                    onClick={() => navigate('/dashboard/geoscience')}
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Back to Geoscience Analytics Hub</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    
                    <div className="hidden md:flex items-center text-pl-muted font-medium">
                        <span 
                            className="hover:text-pl-primary-text-hover cursor-pointer transition-colors flex items-center gap-1"
                            onClick={() => navigate('/dashboard/geoscience')}
                        >
                            <Home className="w-3.5 h-3.5" />
                            Geoscience Hub
                        </span>
                        <ChevronRight className="w-4 h-4 mx-1 opacity-50" />
                        <span className="text-pl-text font-semibold">ReservoirCalc Pro</span>
                    </div>
                </div>

                <div className="h-5 w-px bg-pl-border mx-2 hidden md:block" />

                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-pl-muted hover:text-pl-text hover:bg-pl-sunken hidden md:flex"
                    onClick={onToggleLeft}
                    title={isLeftOpen ? "Collapse Inputs" : "Expand Inputs"}
                >
                    <Sidebar className={`w-4 h-4 transition-transform ${!isLeftOpen ? 'rotate-180' : ''}`} />
                </Button>

                <div className="flex flex-col justify-center ml-2">
                     <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-pl-text max-w-[200px] truncate hidden lg:inline-block" data-testid="rcp-project-name">
                            {state.currentProjectMeta?.name || 'Unsaved Workspace'}
                        </span>
                        {state.isDirty && <Badge variant="warning" className="text-[9px] px-1 py-0 h-4">Modified</Badge>}
                     </div>
                </div>

                <div className="h-5 w-px bg-pl-border mx-1 hidden md:block" />

                <ReservoirSwitcher />
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <Sheet open={projectsOpen} onOpenChange={setProjectsOpen}>
                    <SheetTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2 h-8 text-xs">
                            <Folder className="w-3 h-3" />
                            <span className="hidden md:inline">Projects</span>
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 w-[400px] border-r">
                        <ProjectManager onClose={() => setProjectsOpen(false)} />
                    </SheetContent>
                </Sheet>

                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2 h-8 text-xs border-pl-border bg-pl-sunken hover:bg-pl-sunken text-pl-text">
                            <Wrench className="w-3 h-3" />
                            <span className="hidden md:inline">Tools</span>
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="p-0 w-full sm:max-w-[720px] border-l">
                        <WorkspaceToolsHub />
                    </SheetContent>
                </Sheet>

                <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" data-testid="rcp-save" onClick={handleSaveClick} className="h-8 text-xs">
                            Save
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <div className="space-y-4 py-4">
                            <h3 className="text-lg font-bold">Save Project</h3>
                            <div className="space-y-2">
                                <Label>Project Name</Label>
                                <Input data-testid="rcp-save-name" value={meta.name} onChange={e => setMeta({...meta, name: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Textarea value={meta.description} onChange={e => setMeta({...meta, description: e.target.value})} />
                            </div>
                            {saveError && (
                                <div className="rounded border border-pl-danger/40 bg-pl-danger-bg px-3 py-2 text-xs text-pl-danger-text">
                                    {saveError}
                                </div>
                            )}
                            <div className="flex justify-end gap-2 mt-4">
                                <Button variant="ghost" onClick={() => setSaveOpen(false)} disabled={saving}>Cancel</Button>
                                <Button data-testid="rcp-save-confirm" onClick={performSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                <Button variant="ghost" size="sm" className="w-8 h-8 p-0 text-pl-muted hover:text-pl-text" onClick={onOpenDocs} title="Documentation" aria-label="Documentation">
                    <HelpCircle className="w-4 h-4" />
                </Button>

                <ThemeToggle className="h-8 w-8" />

                <div className="h-5 w-px bg-pl-border mx-1 hidden md:block" />

                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-pl-muted hover:text-pl-text hover:bg-pl-sunken hidden md:flex"
                    onClick={onToggleRight}
                    title={isRightOpen ? "Collapse Results" : "Expand Results"}
                >
                    <Sidebar className={`w-4 h-4 transition-transform ${isRightOpen ? 'rotate-180' : ''}`} />
                </Button>
            </div>
        </header>
    );
};

export const ReservoirCalcProContent = () => {
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
        <div className="flex flex-col h-full bg-pl-bg text-pl-text overflow-hidden">
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
                    className={`flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden flex flex-col rounded-lg border border-pl-border bg-pl-surface ${showLeft ? 'w-80 opacity-100 ml-0' : 'w-0 opacity-0 -ml-2 border-0'}`}
                >
                    <PanelErrorBoundary label="Inputs"><ExpertInputPanel /></PanelErrorBoundary>
                </div>

                {/* Center Panel: Visualization */}
                <div className="flex-1 h-full overflow-hidden rounded-lg border border-pl-border bg-pl-surface relative shadow-pl-sm flex flex-col">
                    <PanelErrorBoundary label="Visualization"><ExpertVisPanel /></PanelErrorBoundary>
                </div>

                {/* Right Panel: Results & Analytics */}
                <div
                    className={`flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden flex flex-col rounded-lg border border-pl-border bg-pl-surface ${showRight ? 'w-96 opacity-100 mr-0' : 'w-0 opacity-0 -mr-2 border-0'}`}
                >
                    <PanelErrorBoundary label="Results"><ExpertResultsPanel /></PanelErrorBoundary>
                </div>
            </div>
            
            <DocumentationHub open={isDocsOpen} onOpenChange={setIsDocsOpen} />
        </div>
    );
};

const ReservoirCalcPro = () => {
    return (
        <ThemedApp data-testid="rcp-theme-scope" className="h-full">
            <ReservoirCalcProvider>
                <TooltipProvider>
                    <ReservoirCalcProContent />
                </TooltipProvider>
            </ReservoirCalcProvider>
        </ThemedApp>
    );
};

export default ReservoirCalcPro;