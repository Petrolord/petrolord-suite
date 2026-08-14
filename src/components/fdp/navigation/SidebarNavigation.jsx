import React from 'react';
import { useFDP } from '@/contexts/FDPContext';
import { 
    LayoutDashboard, 
    Layers, 
    Lightbulb, 
    TrendingUp, 
    Droplets, 
    Factory, 
    Calendar, 
    DollarSign, 
    ShieldCheck,
    Users,
    AlertTriangle,
    FileText,
    BarChart2,
    Target,
    Share2,
    Workflow,
    Smartphone,
    Webhook,
    HelpCircle,
    GraduationCap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

const NavItem = ({ id, icon: Icon, label, collapsed, isActive, onClick, count }) => (
    <button
        onClick={onClick}
        className={cn(
            "w-full flex items-center gap-3 p-3 rounded-md transition-colors duration-200 mb-1 group relative",
            isActive 
                ? "bg-blue-600 text-white shadow-md shadow-blue-900/20" 
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
        )}
        title={collapsed ? label : undefined}
    >
        <Icon className={cn("w-5 h-5 flex-shrink-0", isActive ? "text-white" : "text-slate-400 group-hover:text-white")} />
        
        {!collapsed && (
            <div className="flex-1 text-left flex justify-between items-center">
                <span className="text-sm font-medium truncate">{label}</span>
                {count !== undefined && (
                    <span className="text-[10px] bg-slate-950/50 px-1.5 py-0.5 rounded-full text-slate-400">
                        {count}
                    </span>
                )}
            </div>
        )}
    </button>
);

const SidebarNavigation = () => {
    const { state, actions } = useFDP();
    const { activeTab, sidebarCollapsed } = state.navigation;

    const navItems = [
        { id: 'overview', label: 'Field Overview', icon: LayoutDashboard },
        { id: 'subsurface', label: 'Subsurface', icon: Layers },
        { id: 'concepts', label: 'Concepts', icon: Lightbulb },
        { id: 'scenarios', label: 'Scenarios', icon: TrendingUp },
        { id: 'wells', label: 'Wells & Drilling', icon: Droplets, count: state.wells.list.length },
        { id: 'facilities', label: 'Facilities', icon: Factory },
        { id: 'schedule', label: 'Schedule', icon: Calendar },
        { id: 'economics', label: 'Economics', icon: DollarSign },
        { id: 'hse', label: 'HSE', icon: ShieldCheck },
        { id: 'community', label: 'Community', icon: Users },
        { id: 'risks', label: 'Risk Management', icon: AlertTriangle },
        { id: 'optimization', label: 'Optimization', icon: Target },
        { id: 'workflow', label: 'Workflow & Tasks', icon: Workflow },
        { id: 'collaboration', label: 'Collaboration', icon: Share2 },
        { id: 'mobile', label: 'Mobile App', icon: Smartphone },
        { id: 'api', label: 'API Integration', icon: Webhook },
        { id: 'documents', label: 'Documents', icon: FileText },
        { id: 'training', label: 'Training Academy', icon: GraduationCap },
        { id: 'help', label: 'Help Center', icon: HelpCircle },
    ];

    return (
        <div className="h-full flex flex-col py-4">
            <ScrollArea className="flex-1 px-3">
                <div className="space-y-1">
                    {navItems.map((item) => (
                        <NavItem 
                            key={item.id}
                            {...item}
                            collapsed={sidebarCollapsed}
                            isActive={activeTab === item.id}
                            onClick={() => actions.setActiveTab(item.id)}
                        />
                    ))}
                </div>
            </ScrollArea>
            
            {!sidebarCollapsed && (
                <div className="px-4 mt-auto">
                    <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                        <p className="text-xs text-slate-400 mb-1">Data Quality</p>
                        <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mb-1">
                            <div className="bg-green-500 h-full w-[85%]"></div>
                        </div>
                        <p className="text-[10px] text-right text-green-400">85% Complete</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SidebarNavigation;