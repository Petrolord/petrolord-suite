import React, { useState, useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, PlusCircle, CheckSquare, BarChart, HelpCircle, ArrowLeft, Search, Bell, Check, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export const MOCPageShell = ({ children, title = "Management of Change", description = "Enterprise MOC Workflow" }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'approval', actor: 'A. Davis', action: 'approved', target: 'MOC-2026-088', time: '10m ago', read: false },
    { id: 2, type: 'comment', actor: 'S. Miller', action: 'commented on', target: 'MOC-2026-089', time: '1h ago', read: false },
    { id: 3, type: 'system', actor: 'System', action: 'returned for revision', target: 'MOC-2026-042', time: '3h ago', read: true },
    { id: 4, type: 'action', actor: 'K. Patel', action: 'completed action on', target: 'MOC-2026-015', time: '1d ago', read: true },
  ]);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard/apps/assurance/management-of-change', icon: LayoutDashboard, exact: true },
    { name: 'MOC Register', path: '/dashboard/apps/assurance/management-of-change/register', icon: FileText, exact: false },
    { name: 'New MOC', path: '/dashboard/apps/assurance/management-of-change/new', icon: PlusCircle, exact: false },
    { name: 'Approvals', path: '/dashboard/apps/assurance/management-of-change/approvals', icon: CheckSquare, exact: false },
    { name: 'Reports', path: '/dashboard/apps/assurance/management-of-change/reports', icon: BarChart, exact: false }
  ];

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const markAllRead = () => setNotifications(n => n.map(item => ({ ...item, read: true })));
  const clearAll = () => setNotifications([]);
  const toggleRead = (id) => setNotifications(n => n.map(item => item.id === id ? { ...item, read: !item.read } : item));
  const deleteNotif = (id) => setNotifications(n => n.filter(item => item.id !== id));

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
        <div className="p-4 border-t border-[hsl(var(--border))]">
          <Button variant="outline" className="w-full justify-start text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]">
            <HelpCircle className="w-4 h-4 mr-2" /> Support Guide
          </Button>
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
            <div className="relative hidden lg:block w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input 
                placeholder="Search MOCs..." 
                className="pl-9 h-9 bg-[hsl(var(--secondary))] border-transparent focus:border-[hsl(var(--primary))]"
              />
            </div>

            {/* Notifications Panel */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative hover:bg-[hsl(var(--secondary))]">
                  <Bell className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 text-[10px] font-bold rounded-full bg-[hsl(var(--destructive))] text-white flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md bg-[hsl(var(--card))] border-l border-[hsl(var(--border))] p-0 flex flex-col">
                <SheetHeader className="p-4 border-b border-[hsl(var(--border))] flex flex-row items-center justify-between">
                  <SheetTitle className="text-lg font-bold text-[hsl(var(--foreground))]">Notifications</SheetTitle>
                  <SheetClose className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                    <X className="w-5 h-5" />
                  </SheetClose>
                </SheetHeader>
                <div className="flex items-center justify-between p-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/50">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={markAllRead}>
                    <Check className="w-3 h-3 mr-1" /> Mark all read
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs text-[hsl(var(--destructive))]" onClick={clearAll}>
                    <Trash2 className="w-3 h-3 mr-1" /> Clear all
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-[hsl(var(--muted-foreground))]">
                      <Bell className="w-8 h-8 opacity-20 mb-2" />
                      <p className="text-sm">No notifications</p>
                    </div>
                  ) : (
                    <div className="flex flex-col divide-y divide-[hsl(var(--border))]">
                      {notifications.map((notif) => (
                        <div key={notif.id} className={`p-4 flex gap-3 group transition-colors hover:bg-[hsl(var(--secondary))] ${notif.read ? 'opacity-70' : 'bg-[hsl(var(--primary))]/5'}`}>
                          <div className="flex-1">
                            <p className="text-sm text-[hsl(var(--foreground))]">
                              <span className="font-semibold text-[hsl(var(--primary))]">{notif.actor}</span> {notif.action} <span className="font-semibold">{notif.target}</span>
                            </p>
                            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{notif.time}</p>
                          </div>
                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleRead(notif.id)}>
                              <Check className="w-3 h-3 text-[hsl(var(--muted-foreground))]" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-[hsl(var(--destructive))]" onClick={() => deleteNotif(notif.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </SheetContent>
            </Sheet>

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
        {navItems.slice(0, 4).map((item) => {
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