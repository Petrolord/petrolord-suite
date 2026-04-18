import React from 'react';
import { useAnalytics } from '../../../contexts/AnalyticsContext';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LayoutDashboard, BarChart3, ListOrdered, GitCompare, ShieldCheck, TrendingUp, ArrowDownUp, ShieldAlert, FileOutput, Settings, HelpCircle, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'results', label: 'Results', icon: BarChart3 },
    { id: 'metrics', label: 'Metrics', icon: ListOrdered },
    { id: 'comparison', label: 'Comparison', icon: GitCompare },
    { id: 'quality', label: 'Quality', icon: ShieldCheck },
    { id: 'trends', label: 'Trends', icon: TrendingUp },
    { id: 'depth', label: 'Depth Analysis', icon: ArrowDownUp },
    { id: 'risk', label: 'Risk', icon: ShieldAlert },
    { id: 'export', label: 'Export', icon: FileOutput },
];

const NavItem = ({ item, isActive, onClick, isCollapsed }) => (
    <TooltipProvider delayDuration={0}>
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={cn(
                        'w-full justify-start h-10',
                        isCollapsed ? 'px-2' : 'px-3'
                    )}
                    onClick={() => onClick(item.id)}
                >
                    <item.icon className={cn('h-5 w-5', !isCollapsed && 'mr-3')} />
                    {!isCollapsed && <span>{item.label}</span>}
                </Button>
            </TooltipTrigger>
            {isCollapsed && (
                <TooltipContent side="right">
                    <p>{item.label}</p>
                </TooltipContent>
            )}
        </Tooltip>
    </TooltipProvider>
);

const AnalyticsNav = () => {
    const { state, dispatch } = useAnalytics();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleNavClick = (tabId) => {
        dispatch({ type: 'SET_ACTIVE_TAB', payload: tabId });
    };

    return (
        <nav className={cn(
            "flex flex-col justify-between border-r border-slate-700 bg-slate-800/30 transition-all duration-300",
            isCollapsed ? "w-16" : "w-64"
        )}>
            <div>
                <div className={cn("flex items-center h-16 border-b border-slate-700", isCollapsed ? "justify-center" : "px-4 justify-between")}>
                    {!isCollapsed && <h1 className="text-lg font-bold">Analytics</h1>}
                </div>
                <div className="p-2 space-y-1">
                    {navItems.map(item => (
                        <NavItem
                            key={item.id}
                            item={item}
                            isActive={state.activeTab === item.id}
                            onClick={handleNavClick}
                            isCollapsed={isCollapsed}
                        />
                    ))}
                </div>
            </div>
            <div className="p-2 border-t border-slate-700">
                 <Button variant="ghost" onClick={() => setIsCollapsed(!isCollapsed)} className="w-full justify-center">
                    {isCollapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
                 </Button>
            </div>
        </nav>
    );
};

export default AnalyticsNav;