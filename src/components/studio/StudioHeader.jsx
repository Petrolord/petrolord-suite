// Studio shell header cluster — the DCA header recipe as a component:
// back button, gradient icon badge, gradient-text title, divider, inline tabs.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ui/theme-toggle';

// Design system: the header uses theme roles and shows the light/dark toggle.

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

  return (
    <div className="flex items-center gap-1 sm:gap-2 2xl:gap-4 w-full min-w-0">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate(backTo)}
        className="shrink-0 text-pl-muted hover:text-pl-text hover:bg-pl-sunken mr-1"
        title={backTitle}
      >
        <ArrowLeft size={20} />
      </Button>

      {/* A floor under the title block (icon + 6rem of title) so a long tab
          row can never draw over it; the tab row scrolls instead. */}
      <div className="flex min-w-0 items-center gap-2 sm:min-w-[8.5rem]">
        {Icon && (
          <div className="shrink-0 bg-pl-primary text-pl-primary-fg p-1.5 rounded-md">
            <Icon size={18} className="text-pl-primary-fg" />
          </div>
        )}
        <h1 className="text-lg font-semibold text-pl-text hidden sm:block min-w-[6rem] truncate" title={typeof title === 'string' ? title : undefined}>
          {title}
        </h1>
      </div>

      {tabs.length > 0 && (
        <>
          {/* Themed: a long tab row scrolls inside its list and the toggle
              stays on screen (rollout batch 1D). W7F: the title used to be
              shrink-0 while the tabs took all the shrinking, so at 1440 px
              Waterflood's last tab read "Surveillanc" beside a full title.
              The title now gives way first, down to its 8.5rem floor (the
              h1 truncates, its full name is the tooltip); only then does the
              tab row shrink and scroll. */}
          <div className="hidden sm:block h-6 w-[1px] shrink-0 bg-pl-border mx-2"></div>
          <Tabs value={activeTab} onValueChange={onTabChange} className="h-8 min-w-0 flex-1 sm:flex-initial sm:shrink-[0.001]">
            <TabsList className="h-8 max-w-full justify-start overflow-x-auto p-0.5">
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="h-7 text-xs px-2 2xl:px-3">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </>
      )}

      {children}

      <ThemeToggle className={cn('h-8 w-8', children ? 'ml-2' : 'ml-auto')} />
    </div>
  );
};

export default StudioHeader;
