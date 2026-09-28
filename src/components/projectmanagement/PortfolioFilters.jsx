import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Filter, X, CheckCircle2 } from 'lucide-react';

const PortfolioFilters = ({ projects, onFilterChange }) => {
  // Extract unique values for filter options
  const countries = [...new Set(projects.map(p => p.country).filter(Boolean))];
  const assets = [...new Set(projects.map(p => p.asset).filter(Boolean))];
  const types = [...new Set(projects.map(p => p.project_type).filter(Boolean))];
  const stages = [...new Set(projects.map(p => p.stage).filter(Boolean))];
  const statuses = ['Green', 'Amber', 'Red'];

  const [filters, setFilters] = useState({
    country: [],
    asset: [],
    project_type: [],
    stage: [],
    status: []
  });

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    onFilterChange(filters);
  }, [filters, onFilterChange]);

  const toggleFilter = (category, value) => {
    setFilters(prev => {
      const current = prev[category];
      const updated = current.includes(value)
        ? current.filter(item => item !== value)
        : [...current, value];
      return { ...prev, [category]: updated };
    });
  };

  const clearFilters = () => {
    setFilters({
      country: [],
      asset: [],
      project_type: [],
      stage: [],
      status: []
    });
  };

  const activeFilterCount = Object.values(filters).flat().length;

  const FilterGroup = ({ title, category, options }) => (
    <div className="space-y-2">
      <h4 className="font-medium text-sm text-pl-text mb-1">{title}</h4>
      {options.length === 0 ? (
        <p className="text-xs text-pl-muted italic">No options available</p>
      ) : (
        <div className="grid grid-cols-1 gap-1">
          {options.map(opt => (
            <div key={opt} className="flex items-center space-x-2">
              <Checkbox 
                id={`${category}-${opt}`} 
                checked={filters[category].includes(opt)}
                onCheckedChange={() => toggleFilter(category, opt)}
              />
              <Label 
                htmlFor={`${category}-${opt}`} 
                className="text-sm text-pl-muted font-normal cursor-pointer hover:text-pl-text"
              >
                {opt}
              </Label>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`border-dashed ${activeFilterCount > 0 ? 'border-pl-primary text-pl-primary-text' : 'text-pl-muted'}`}>
          <Filter className="w-4 h-4 mr-2" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="selected" className="ml-2 h-5 px-1.5">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-4 flex justify-between items-center border-b border-pl-border">
            <h3 className="font-semibold text-pl-text">Filter Portfolio</h3>
            {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-xs text-pl-muted hover:text-pl-text">
                    Clear all
                    <X className="w-3 h-3 ml-1" />
                </Button>
            )}
        </div>
        <ScrollArea className="h-[400px] p-4">
            <div className="space-y-6">
                <FilterGroup title="Status" category="status" options={statuses} />
                <Separator />
                <FilterGroup title="Project Type" category="project_type" options={types} />
                <Separator />
                <FilterGroup title="Stage" category="stage" options={stages} />
                <Separator />
                <FilterGroup title="Asset" category="asset" options={assets} />
                <Separator />
                <FilterGroup title="Country" category="country" options={countries} />
            </div>
        </ScrollArea>
        <div className="p-4 border-t border-pl-border bg-pl-sunken">
            <Button className="w-full" onClick={() => setIsOpen(false)}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Apply Filters
            </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default PortfolioFilters;