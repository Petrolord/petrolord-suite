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
    FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { calculateCompleteness } from '@/utils/fdp/fdpCalculations';

const NavItem = ({ id, icon: Icon, label, collapsed, isActive, onClick, count }) => (
    <button
        onClick={onClick}
        className={cn(
            "w-full flex items-center gap-3 p-3 rounded-md transition-colors duration-200 mb-1 group relative",
            isActive 
                ? "bg-pl-primary text-pl-primary-fg shadow-pl-sm"
                : "text-pl-muted hover:bg-pl-sunken hover:text-pl-text"
        )}
        title={collapsed ? label : undefined}
    >
        <Icon className={cn("w-5 h-5 flex-shrink-0", isActive ? "text-pl-primary-fg" : "text-pl-muted group-hover:text-pl-text")} />
        
        {!collapsed && (
            <div className="flex-1 text-left flex justify-between items-center">
                <span className="text-sm font-medium truncate">{label}</span>
                {count !== undefined && (
                    <span className="text-[10px] bg-pl-sunken px-1.5 py-0.5 rounded-full text-pl-muted">
                        {count}
                    </span>
                )}
            </div>
        )}
    </button>
);

// W7F: the phone sheet always shows labels (forceExpanded), whatever the
// desktop rail's collapsed flag says.
const SidebarNavigation = ({ forceExpanded = false }) => {
    const { state, actions } = useFDP();
    const { activeTab } = state.navigation;
    const sidebarCollapsed = forceExpanded ? false : state.navigation.sidebarCollapsed;
    const completeness = calculateCompleteness(state);

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
        { id: 'documents', label: 'Documents', icon: FileText },
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
                    {/* EC6-0: this bar was a literal 85 percent on every plan,
                        empty ones included, and called itself Data Quality. It is
                        the plan's own completeness score now, which counts the
                        sections that have something in them and says so. */}
                    <div className="bg-pl-sunken rounded-lg p-3 border border-pl-border">
                        <p className="text-xs text-pl-muted mb-1">Sections with data</p>
                        <div className="w-full bg-pl-surface h-1.5 rounded-full overflow-hidden mb-1">
                            <div className="bg-pl-primary h-full" style={{ width: `${completeness.score}%` }}></div>
                        </div>
                        <p className="text-[10px] text-right text-pl-muted">
                            {completeness.score}% of {completeness.breakdown.length} sections
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SidebarNavigation;