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

const TopNavigation = () => {
    const { state, actions, persistence } = useFDP();
    const navigate = useNavigate();
    const { sidebarCollapsed, rightPanelOpen } = state.navigation;
    const { name, mode } = state.meta;

    return (
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4">
            <div className="flex items-center space-x-4">
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={actions.toggleSidebar}
                    className="text-slate-400 hover:text-white hover:bg-slate-800"
                >
                    <Menu className="w-5 h-5" />
                </Button>

                <div className="flex items-center">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => navigate('/dashboard')}
                        className="text-slate-400 hover:text-white mr-2"
                    >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Hub
                    </Button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <div>
                        <h1 className="text-white font-semibold text-sm">{name}</h1>
                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-slate-400">FDP Accelerator</span>
                            <span className="text-xs bg-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded border border-teal-500/30 uppercase tracking-wide font-bold" style={{ fontSize: '0.65rem' }}>
                                {mode}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center space-x-2">
                <div className="hidden md:flex bg-slate-800 rounded-lg p-1 border border-slate-700 mr-4">
                    <button 
                        onClick={() => actions.setMode('guided')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'guided' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Guided
                    </button>
                    <button 
                        onClick={() => actions.setMode('expert')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'expert' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
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
                    className="hidden sm:flex border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                </Button>

                <FdpHelpGuide />

                <div className="h-6 w-px bg-slate-700 mx-2"></div>
                
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={actions.toggleRightPanel}
                    className={`text-slate-400 hover:text-white hover:bg-slate-800 ${rightPanelOpen ? 'bg-slate-800 text-white' : ''}`}
                >
                    {rightPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
                </Button>
            </div>
        </header>
    );
};

export default TopNavigation;