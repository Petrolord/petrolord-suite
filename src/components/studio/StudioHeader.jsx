// Studio shell header cluster — the DCA header recipe as a component:
// back button, gradient icon badge, gradient-text title, divider, inline tabs.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDsTheme } from '@/design/themeContext';
import { ThemeToggle } from '@/components/ui/theme-toggle';

// Design system: inside an opted-in <ThemedApp> scope the header uses theme
// roles and shows the light/dark toggle; outside one it renders exactly as
// before.

const StudioHeader = ({
  backTo = '/dashboard/reservoir',
  backTitle = 'Back',
  icon: Icon,
  iconGradientClass = 'from-blue-600 to-indigo-600',
  title,
  tabs = [],
  activeTab,
  onTabChange,
  children,
}) => {
  const navigate = useNavigate();
  const ds = useDsTheme();

  return (
    <div className="flex items-center gap-2 2xl:gap-4 w-full">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate(backTo)}
        className={ds ? 'shrink-0 text-pl-muted hover:text-pl-text hover:bg-pl-sunken mr-1' : 'shrink-0 text-slate-400 hover:text-white hover:bg-slate-800/50 mr-1'}
        title={backTitle}
      >
        <ArrowLeft size={20} />
      </Button>

      {/* A floor under the title block (icon + 6rem of title) so a long tab
          row can never draw over it; the tab row scrolls instead. */}
      <div className="flex min-w-[8.5rem] items-center gap-2">
        {Icon && (
          <div className={ds ? 'shrink-0 bg-pl-primary text-pl-primary-fg p-1.5 rounded-md' : cn('shrink-0 bg-gradient-to-br p-1.5 rounded-md shadow-lg shadow-blue-900/20', iconGradientClass)}>
            <Icon size={18} className={ds ? 'text-pl-primary-fg' : 'text-white'} />
          </div>
        )}
        <h1 className={ds ? 'text-lg font-semibold text-pl-text hidden sm:block min-w-[6rem] truncate' : 'text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block min-w-[6rem] truncate'} title={typeof title === 'string' ? title : undefined}>
          {title}
        </h1>
      </div>

      {tabs.length > 0 && (
        <>
          <div className={ds ? 'h-6 w-[1px] shrink-0 bg-pl-border mx-2' : 'h-6 w-[1px] shrink-0 bg-slate-700 mx-2'}></div>
          <Tabs value={activeTab} onValueChange={onTabChange} className="h-8 min-w-0 shrink-[0.001]">
            <TabsList className={ds ? 'h-8 max-w-full justify-start overflow-x-auto p-0.5' : 'h-8 max-w-full justify-start overflow-x-auto bg-slate-800/50 border border-slate-700 p-0.5'}>
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className={ds ? 'h-7 text-xs px-2 2xl:px-3' : 'h-7 text-xs px-2 2xl:px-3 data-[state=active]:bg-slate-700'}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </>
      )}

      {children}

      {ds && <ThemeToggle className={cn('h-8 w-8', children ? 'ml-2' : 'ml-auto')} />}
    </div>
  );
};

export default StudioHeader;
