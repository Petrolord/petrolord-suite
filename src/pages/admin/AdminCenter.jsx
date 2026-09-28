import React, { useState, Suspense, lazy } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { 
    Menu, ShieldCheck, AppWindow, Wrench, History, Smartphone, 
    Tablet, HandMetal, Compass, WifiOff, DownloadCloud, PieChart, 
    Shield as ShieldIcon, BookOpen, ToggleLeft, Building2, 
    ShieldCheck as ShieldCheckIcon, FileText, ScrollText, Lock, 
    Fingerprint, Link, Webhook, FileBarChart as ReportIcon, 
    Activity, ClipboardCheck, Rocket, Settings, Network, ShieldAlert, 
    TrendingUp as TrendingUpIcon, Clock, GitCommit, Calendar, LifeBuoy, 
    Eye, BarChart3, Bell, Bug, Zap, Cpu, LayoutGrid, Users, 
    MousePointerClick, DollarSign, Gauge, BrainCircuit, LayoutDashboard, 
    AreaChart, Download, FolderTree, Search, GraduationCap, Video, 
    Gamepad2, Award, TrendingUp, Sparkles, Terminal, Beaker, PlayCircle, 
    CheckCircle2, GitMerge, Database, Package
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AccountScope } from '@/components/account/accountChrome';

// Admin Tools
const AdminModuleAccessDiagnostics = lazy(() => import('@/pages/admin/AdminModuleAccessDiagnostics'));
const MasterAppsManager = lazy(() => import('@/components/admin/MasterAppsManager'));
const BuildHistoryAdmin = lazy(() => import('@/pages/admin/BuildHistoryAdmin')); // New Component
// The seeder panel only: the Admin centre is already the theme scope, so it
// skips the standalone page's own scope and header.
const AdminSeedApps = lazy(() => import('@/pages/admin/AdminSeedApps').then((m) => ({ default: m.AdminSeedAppsPanel })));

// Lazy load other components... (Keeping existing imports)
// ... [Existing Lazy Imports from previous codebase] ...
// To save space, assuming they are imported as in previous state

const AdminCenter = () => {
    const [activeTab, setActiveTab] = useState('master-registry');
    const [menuOpen, setMenuOpen] = useState(false);

    const renderContent = () => {
        switch (activeTab) {
            // System Tools
            case 'master-registry': return <MasterAppsManager />;
            case 'build-history': return <BuildHistoryAdmin />;
            case 'seed-apps': return <AdminSeedApps />;
            case 'module-diagnostics': return <AdminModuleAccessDiagnostics />;

            default: return <MasterAppsManager />; // Default to registry
        }
    };

    const NavButton = ({ id, label, icon: Icon }) => (
        <Button 
            variant={activeTab === id ? 'secondary' : 'ghost'} 
            className="w-full justify-start text-xs h-8" 
            aria-current={activeTab === id ? 'page' : undefined}
            onClick={() => { setActiveTab(id); setMenuOpen(false); }}
        >
            {Icon && <Icon className="w-3 h-3 mr-2" />} {label}
        </Button>
    );

    const NavSection = ({ title, children }) => (
        <div className="mb-4">
            <div className="px-2 text-[10px] uppercase text-pl-muted font-bold mb-1 tracking-wider">{title}</div>
            <div className="space-y-0.5">
                {children}
            </div>
        </div>
    );

    // W7F: one menu for both layouts. The phone sheet used to hold a
    // "Replicated nav" placeholder and nothing else, so at phone width the
    // Admin centre menu opened empty. The "Mobile Suite / Optimization
    // Score" entry had no panel behind it (it fell through to App Registry)
    // and is dropped.
    const nav = (
        <NavSection title="System Tools">
            <NavButton id="master-registry" label="App Registry" icon={AppWindow} />
            <NavButton id="build-history" label="Build History" icon={History} />
            <NavButton id="seed-apps" label="Seed Tools" icon={Database} />
            <NavButton id="module-diagnostics" label="Access Diagnostics" icon={Wrench} />
        </NavSection>
    );

    return (
        <AccountScope testId="admin-center-theme-scope">
        <div className="flex flex-col md:flex-row h-screen w-full bg-pl-bg text-pl-text font-pl-sans">
            {/* Mobile bar: menu, title and the theme toggle */}
            <div className="md:hidden flex items-center gap-2 border-b border-pl-border bg-pl-surface px-2 py-2">
                <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Open admin menu"><Menu /></Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-64 p-0">
                         <div className="p-4 border-b border-pl-border font-bold text-lg flex items-center gap-2 text-pl-text">
                            <ShieldCheck className="text-pl-primary-text" aria-hidden="true"/> Admin Center
                         </div>
                         <nav aria-label="Admin menu" className="p-2 overflow-y-auto h-full">
                            {nav}
                         </nav>
                    </SheetContent>
                </Sheet>
                <span className="flex-1 flex items-center gap-2 font-bold text-pl-text">
                    <ShieldCheck className="h-5 w-5 text-pl-primary-text" aria-hidden="true"/> Admin Center
                </span>
                <ThemeToggle />
            </div>

            {/* Desktop Sidebar */}
            <div className="hidden md:flex w-64 flex-col border-r border-pl-border bg-pl-surface flex-shrink-0">
                <div className="p-4 border-b border-pl-border font-bold text-lg flex items-center gap-2 text-pl-text">
                    <ShieldCheck className="text-pl-primary-text" aria-hidden="true"/> <span className="flex-1">Admin Center</span>
                    <ThemeToggle />
                </div>
                <div className="flex-grow p-2 overflow-y-auto">
                    
                    {nav}
                </div>
                <div className="p-4 border-t border-pl-border text-xs text-pl-muted text-center">
                    v1.7.0-build-tracker
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-grow min-w-0 overflow-y-auto relative bg-pl-bg p-4 sm:p-6">
                <Suspense fallback={<div className="p-10 text-pl-muted flex items-center"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-pl-primary mr-2"></div>Loading Module...</div>}>
                    {renderContent()}
                </Suspense>
            </div>
        </div>
        </AccountScope>
    );
};

export default AdminCenter;