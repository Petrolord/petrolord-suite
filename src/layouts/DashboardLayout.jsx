import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import DashboardSidebar from '@/components/DashboardSidebar';
import OrgClosureBanner from '@/components/OrgClosureBanner';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { ApplicationProvider, useApplication } from '@/context/ApplicationContext';
import SidebarVisibilityController from '@/components/layout/SidebarVisibilityController';

// Inner layout component that consumes the Application Context
const DashboardLayoutInner = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const { loading } = useAuth();
    const { isInApplication } = useApplication();

    const handleToggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
                <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-lime-400"></div>
            </div>
        );
    }
    
    return (
        <div className="flex h-screen bg-slate-900 text-white" data-testid="dashboard-layout">
            <SidebarVisibilityController />
            
            {/* Conditional Sidebar Rendering based on Application Mode */}
            {!isInApplication && (
                <DashboardSidebar 
                    isCollapsed={isCollapsed} 
                    onToggleCollapse={handleToggleCollapse} 
                    data-testid="dashboard-sidebar"
                />
            )}
            
            <main className={`flex-1 overflow-y-auto transition-all duration-300 ${isInApplication ? 'w-full' : ''}`}>
                <OrgClosureBanner />
                <div className="min-h-full">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

// Main layout wrapper providing context
const DashboardLayout = () => {
    return (
        <ApplicationProvider>
            <DashboardLayoutInner />
        </ApplicationProvider>
    );
};

export default DashboardLayout;