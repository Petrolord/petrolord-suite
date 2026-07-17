// Studio shell header cluster — the DCA header recipe as a component:
// back button, gradient icon badge, gradient-text title, divider, inline tabs.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    <div className="flex items-center gap-4 w-full">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate(backTo)}
        className="text-slate-400 hover:text-white hover:bg-slate-800/50 mr-1"
        title={backTitle}
      >
        <ArrowLeft size={20} />
      </Button>

      <div className="flex items-center gap-2">
        {Icon && (
          <div className={cn('bg-gradient-to-br p-1.5 rounded-md shadow-lg shadow-blue-900/20', iconGradientClass)}>
            <Icon size={18} className="text-white" />
          </div>
        )}
        <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block">
          {title}
        </h1>
      </div>

      {tabs.length > 0 && (
        <>
          <div className="h-6 w-[1px] bg-slate-700 mx-2"></div>
          <Tabs value={activeTab} onValueChange={onTabChange} className="h-8">
            <TabsList className="h-8 bg-slate-800/50 border border-slate-700 p-0.5">
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="h-7 text-xs px-3 data-[state=active]:bg-slate-700">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </>
      )}

      {children}
    </div>
  );
};

export default StudioHeader;
