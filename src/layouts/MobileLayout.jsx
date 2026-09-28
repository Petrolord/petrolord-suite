import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, CheckSquare, User, Bell } from 'lucide-react';
import { ThemedApp } from '@/design/ThemeProvider';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const MobileLayout = () => {
  const location = useLocation();

  const navItems = [
    { path: '/mobile/dashboard', icon: LayoutDashboard, label: 'Home' },
    { path: '/mobile/projects', icon: FolderKanban, label: 'Projects' },
    { path: '/mobile/tasks', icon: CheckSquare, label: 'Tasks' },
    { path: '/mobile/notifications', icon: Bell, label: 'Alerts' },
    { path: '/mobile/profile', icon: User, label: 'Profile' },
  ];

  return (
    // The /mobile shell is the theme scope for all five mobile pages.
    <ThemedApp className="flex flex-col h-screen overflow-hidden" data-testid="mobile-theme-scope">
      {/* Top bar: the light/dark toggle */}
      <header className="flex items-center justify-between border-b border-pl-border bg-pl-surface px-4 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pl-accent-text">Petrolord</span>
        <ThemeToggle />
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-pl-surface border-t border-pl-border pb-safe pt-2 px-2 z-50 h-16">
        <div className="flex justify-around items-center h-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            
            return (
              <NavLink 
                key={item.path} 
                to={item.path}
                className={`flex flex-col items-center gap-1 w-16 transition-colors ${isActive ? 'text-pl-primary-text' : 'text-pl-muted hover:text-pl-text'}`}
              >
                <Icon className={`w-6 h-6 ${isActive ? 'fill-pl-primary/20' : ''}`} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </ThemedApp>
  );
};

export default MobileLayout;