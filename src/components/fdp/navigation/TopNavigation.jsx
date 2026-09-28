// FDP top bar (Economics E3).
//
// The Save and Export buttons here had no onClick at all, and the bell
// carried a red unread dot that was a styled span, not a notification. Save
// is the real studio-kit control now, Export goes to the tab that actually
// exports, and the two ornaments are gone.
import React from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { Button } from '@/components/ui/button';
import {
    ChevronLeft,
    Download,
    Menu,
    PanelRightClose,
    PanelRightOpen,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import FdpHelpGuide from '@/components/fdp/FdpHelpGuide';
import { FullPrecisionToggle } from '@/components/fullprecision/FullPrecision';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const TopNavigation = () => {
    const { state, actions, persistence } = useFDP();
    const navigate = useNavigate();
    const { sidebarCollapsed, rightPanelOpen } = state.navigation;
    const { name, mode } = state.meta;

    return (
        <header className="h-16 bg-pl-surface border-b border-pl-border flex items-center justify-between px-4">
            <div className="flex items-center space-x-4">
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={actions.toggleSidebar}
                    className="text-pl-muted hover:text-pl-text hover:bg-pl-sunken"
                >
                    <Menu className="w-5 h-5" />
                </Button>

                <div className="flex items-center">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => navigate('/dashboard')}
                        className="text-pl-muted hover:text-pl-text mr-2"
                    >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Hub
                    </Button>
                    <div className="h-6 w-px bg-pl-border mx-2"></div>
                    <div>
                        <h1 className="text-pl-text font-semibold text-sm">{name}</h1>
                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-pl-muted">FDP Accelerator</span>
                            <span className="text-xs bg-pl-sunken text-pl-muted px-1.5 py-0.5 rounded border border-pl-border uppercase tracking-wide font-bold" style={{ fontSize: '0.65rem' }}>
                                {mode}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center space-x-2">
                <div className="hidden md:flex bg-pl-sunken rounded-lg p-1 border border-pl-border mr-4">
                    <button 
                        onClick={() => actions.setMode('guided')}
                        aria-pressed={mode === 'guided'}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'guided' ? 'bg-pl-surface text-pl-text shadow-pl-sm' : 'text-pl-muted hover:text-pl-text'}`}
                    >
                        Guided
                    </button>
                    <button 
                        onClick={() => actions.setMode('expert')}
                        aria-pressed={mode === 'expert'}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'expert' ? 'bg-pl-surface text-pl-text shadow-pl-sm' : 'text-pl-muted hover:text-pl-text'}`}
                    >
                        Expert
                    </button>
                </div>

                <div className="hidden lg:block w-52">
                    <StudioProjectManager
                        label="Saved plan"
                        projects={persistence.projects}
                        currentProjectId={persistence.currentProjectId}
                        onCreate={persistence.createProject}
                        onOpen={persistence.openProject}
                        onDelete={persistence.deleteProject}
                        confirmDeleteMessage="Delete this development plan and everything saved with it? This cannot be undone."
                    />
                </div>

                <StudioAutoSave
                    isSaving={persistence.isSaving}
                    saveError={persistence.saveError}
                    lastSaveTime={persistence.lastSaveTime}
                    onSave={persistence.manualSave}
                    disabled={!persistence.currentProjectId}
                />

                <Button
                    variant="outline" size="sm"
                    onClick={() => actions.setActiveTab('documents')}
                    className="hidden sm:flex"
                >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                </Button>

                <FullPrecisionToggle app="fdp-accelerator" className="mr-2" />
                <FdpHelpGuide />
                <ThemeToggle />

                <div className="h-6 w-px bg-pl-border mx-2"></div>
                
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={actions.toggleRightPanel}
                    className={`text-pl-muted hover:text-pl-text hover:bg-pl-sunken ${rightPanelOpen ? 'bg-pl-sunken text-pl-text' : ''}`}
                >
                    {rightPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
                </Button>
            </div>
        </header>
    );
};

export default TopNavigation;