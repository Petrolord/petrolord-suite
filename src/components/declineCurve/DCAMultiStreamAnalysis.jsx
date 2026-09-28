import React from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Droplets, Flame, Waves } from 'lucide-react';

const DCAMultiStreamAnalysis = () => {
  const { selectedStream, setSelectedStream } = useDeclineCurve();

  return (
    <div className="mb-4">
      <label className="text-xs font-medium text-pl-muted uppercase mb-2 block">Production Stream</label>
      <Tabs value={selectedStream} onValueChange={setSelectedStream} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="oil">
            <Droplets size={14} className="mr-2" /> Oil
          </TabsTrigger>
          <TabsTrigger value="gas">
            <Flame size={14} className="mr-2" /> Gas
          </TabsTrigger>
          <TabsTrigger value="water">
            <Waves size={14} className="mr-2" /> Water
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
};

export default DCAMultiStreamAnalysis;