import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, PlusCircle, CheckSquare, BarChart, ArrowLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const BASE = '/dashboard/apps/assurance/management-of-change';

export const MOCPageShell = ({ children, title = "Management of Change", description = "Enterprise MOC Workflow" }) => {
  const navigate = useNavigate();
  const location = useLocation();
  // AS13: the header search was uncontrolled and only navigated to the
  // register on focus, so whatever was typed was thrown away. It now
  // opens the register filtered by the text (Register reads ?q=).
  const [query, setQuery] = useState('');
  const submitSearch = (e) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `${BASE}/register?q=${encodeURIComponent(q)}` : `${BASE}/register`);
  };
  // AS6: a notification bell used to sit in this header, driven by four
  // hardcoded notifications — "A. Davis approved MOC-2026-088",
  // "S. Miller commented on MOC-2026-089" — with a red unread badge
  // showing 2. Every user in every organization saw the same four, and
  // marking one read or deleting it only mutated local state.
  //
  // It is removed rather than rebuilt. Real notifications need a
  // notifications table with per-user read state, which does not exist.
  // What does exist is shown honestly: the dashboard's recent activity
  // and each change's audit trail, both read from moc_activity_log.

  const navItems = [
    { name: 'Dashboard', path: BASE, icon: LayoutDashboard, exact: true },
    { name: 'MOC Register', path: `${BASE}/register`, icon: FileText, exact: false },
    { name: 'New MOC', path: `${BASE}/new`, icon: PlusCircle, exact: false },
    { name: 'Approvals', path: `${BASE}/approvals`, icon: CheckSquare, exact: false },
    { name: 'Reports', path: `${BASE}/reports`, icon: BarChart, exact: false }
  ];


  return (
    <div className="flex h-screen w-full bg-[hsl(var(--background))] overflow-hidden text-[hsl(var(--foreground))]">
      
      {/* Left Sidebar */}
      <div className="w-64 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] hidden md:flex flex-col z-10 no-print">
        <div className="h-16 flex items-center px-4 border-b border-[hsl(var(--border))]">
          <Button variant="ghost" className="px-2 hover:bg-[hsl(var(--secondary))]" onClick={() => navigate('/dashboard/assurance')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Hub
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <div className="px-4 mb-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
            MOC Menu
          </div>
          <nav className="space-y-1 px-2">
            {navItems.map((item) => {
              const isActive = item.exact 
                ? location.pathname === item.path 
                : location.pathname.startsWith(item.path);
                
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive 
                      ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]' 
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  <item.icon className={`w-4 h-4 mr-3 ${isActive ? 'text-[hsl(var(--primary))]' : 'opacity-70'}`} />
                  {item.name}
                </NavLink>
              )
            })}
          </nav>
        </div>
        {/* AS13: the Support Guide button that stood here had no handler. */}
        <div className="p-4 border-t border-[hsl(var(--border))]">
          {/* AS13: AssuranceHelp appKey="moc" goes here */}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur-sm z-20 no-print">
          <div className="flex items-center gap-4">
            <div className="md:hidden">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/assurance')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </div>
            <div>
              <h1 className="text-lg font-bold text-[hsl(var(--foreground))]">{title}</h1>
              <p className="text-xs text-[hsl(var(--muted-foreground))] hidden sm:block">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <form role="search" onSubmit={submitSearch} className="relative hidden lg:block w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input
                type="search"
                aria-label="Search the change register"
                placeholder="Search changes, press Enter"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 h-9 bg-[hsl(var(--secondary))] border-transparent focus:border-[hsl(var(--primary))]"
              />
            </form>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 relative">
          <div className="max-w-7xl mx-auto h-full flex flex-col">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Footer Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] flex items-center justify-around px-2 z-50 no-print">
        {/* AS13: every item. slice(0, 4) left Reports unreachable on a phone. */}
        {navItems.map((item) => {
           const isActive = item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
           return (
             <NavLink key={item.name} to={item.path} className={`flex flex-col items-center justify-center w-full h-full ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
               <item.icon className="w-5 h-5 mb-1" />
               <span className="text-[10px]">{item.name}</span>
             </NavLink>
           )
        })}
      </div>
    </div>
  );
};

export default MOCPageShell;
