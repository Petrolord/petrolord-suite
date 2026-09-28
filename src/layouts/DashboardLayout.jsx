import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import DashboardSidebar from '@/components/DashboardSidebar';
import OrgClosureBanner from '@/components/OrgClosureBanner';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { ApplicationProvider, useApplication } from '@/context/ApplicationContext';
import SidebarVisibilityController from '@/components/layout/SidebarVisibilityController';
import { DashboardScope } from '@/design/DashboardScope';
import { ThemedLoadingScreen } from '@/design/coldLoad';
import { FixedTheme, readLastTheme } from '@/design/ThemeProvider';
import { DEFAULT_THEME } from '@/design/tokens';

// Inner layout component that consumes the Application Context
const DashboardLayoutInner = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const { loading } = useAuth();
    const { isInApplication } = useApplication();

    const handleToggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
    };

    // While the session restores, the themed loader in the device's last
    // theme (the cold-load rule in src/design/coldLoad.jsx).
    if (loading) {
        return <ThemedLoadingScreen theme={readLastTheme() || DEFAULT_THEME} />;
    }

    // Design system (batch 7A): one ThemedApp around the content column
    // (DashboardScope) themes every page under /dashboard. The sidebar and
    // the phone bar stay outside it as the fixed dark ink frame (FixedTheme),
    // so the frame itself carries no colour of its own.
    return (
        <div className="flex h-screen" data-testid="dashboard-layout">
            <SidebarVisibilityController />
            
            {/* Conditional Sidebar Rendering based on Application Mode */}
            {/* The sidebar is a dark ink rail (design system, lead decision 1).
                At phone width it moves into a drawer opened from the bar
                below, so the page keeps the full width. */}
            {!isInApplication && (
                <DashboardSidebar 
                    isCollapsed={isCollapsed} 
                    onToggleCollapse={handleToggleCollapse} 
                    className="hidden md:flex shrink-0"
                    data-testid="dashboard-sidebar"
                />
            )}
            
            <main className={`flex-1 overflow-y-auto transition-all duration-300 ${isInApplication ? 'w-full' : ''}`}>
                {!isInApplication && (
                    <div
                        data-pl-theme="dark"
                        data-testid="dashboard-mobile-bar"
                        className="md:hidden sticky top-0 z-40 flex items-center gap-3 border-b border-pl-border bg-pl-surface px-4 py-2 text-pl-text"
                    >
                        <button
                            type="button"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label="Open navigation"
                            aria-expanded={mobileNavOpen}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-pl-muted hover:bg-pl-raised hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus"
                        >
                            <Menu className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <img src="/petrolord-icon.png" alt="" className="h-7 w-7 rounded-md object-contain" />
                        <span className="text-sm font-bold tracking-tight">Petrolord Suite</span>
                    </div>
                )}
                {!isInApplication && (
                    <FixedTheme theme="dark">
                    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                        <SheetContent side="left" className="w-64 max-w-[85vw] border-pl-border p-0 md:hidden">
                            <SheetTitle className="sr-only">Dashboard navigation</SheetTitle>
                            <DashboardSidebar className="w-full border-r-0" onNavigate={() => setMobileNavOpen(false)} />
                        </SheetContent>
                    </Sheet>
                    </FixedTheme>
                )}
                <DashboardScope>
                    <OrgClosureBanner />
                    <Outlet />
                </DashboardScope>
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