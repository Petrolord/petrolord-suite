import React, { Suspense, useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Search as SearchIcon, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

import Dashboard from './Dashboard';
import Register from './Register';
import NewLesson from './NewLesson';
import LessonDetail from './LessonDetail';
import Reports from './Reports';
import Search from './Search';

export default function LessonsLearnedPageShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const navItems = [
    { name: 'Dashboard', path: '/dashboard/apps/assurance/lessons-learned' },
    { name: 'Register', path: '/dashboard/apps/assurance/lessons-learned/register' },
    { name: 'Search', path: '/dashboard/apps/assurance/lessons-learned/search' },
    { name: 'Reports', path: '/dashboard/apps/assurance/lessons-learned/reports' }
  ];

  // Logic to hide tabs if we are in 'new' or 'detail' view to give focus
  const isFormView = currentPath.includes('/new') || (currentPath.split('/').length > 5 && !currentPath.endsWith('register') && !currentPath.endsWith('search') && !currentPath.endsWith('reports'));

  return (
    <div className="flex flex-col h-full w-full bg-[hsl(var(--background))] overflow-hidden">
      
      {/* Top Application Header */}
      <div className="bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-20 relative">
        <div className="flex items-center gap-6">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 -ml-2 transition-colors"
            onClick={() => navigate('/dashboard/assurance')}
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back to Assurance
          </Button>
          <div className="h-6 w-px bg-[hsl(var(--border))]"></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">Lessons Learned</h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Capture, validate, and reuse organizational knowledge</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="bg-[hsl(var(--background))] border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]" onClick={() => navigate('search')}>
            <SearchIcon className="w-4 h-4 mr-2" /> Search
          </Button>
          <Button size="sm" className="btn-primary" onClick={() => navigate('new')}>
            <Plus className="w-4 h-4 mr-2" /> Create Lesson
          </Button>
          <Button variant="ghost" size="icon" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            <HelpCircle className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Sticky Tab Navigation */}
      {!isFormView && (
        <div className="bg-[hsl(var(--card))]/95 backdrop-blur-md border-b border-[hsl(var(--border))] px-6 flex items-center gap-8 shrink-0 z-10">
          {navItems.map(item => {
            const isActive = currentPath === item.path || (item.path !== '/dashboard/apps/assurance/lessons-learned' && currentPath.startsWith(item.path));
            return (
              <Link 
                key={item.name} 
                to={item.path}
                className={`py-4 text-sm font-medium transition-all relative outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] rounded-sm
                  ${isActive 
                    ? 'text-[hsl(var(--primary))]' 
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]/50 px-2 -mx-2'
                  }
                `}
              >
                {item.name}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--primary))] shadow-[0_-2px_10px_rgba(59,130,246,0.5)]"></div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto relative bg-[hsl(var(--background))]">
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center h-full w-full opacity-50">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[hsl(var(--primary))] mb-4"></div>
            <p className="text-[hsl(var(--muted-foreground))]">Loading workspace...</p>
          </div>
        }>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="register" element={<Register />} />
            <Route path="new" element={<NewLesson />} />
            <Route path="reports" element={<Reports />} />
            <Route path="search" element={<Search />} />
            <Route path=":id" element={<LessonDetail />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}