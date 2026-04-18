
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Maximize2, MousePointer2, BoxSelect } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';

const LogViewer = () => {
  const [toolMode, setToolMode] = useState('pan'); 

  return (
    <div className="h-full flex flex-col bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
        <div className="h-10 border-b border-slate-800 bg-slate-900 flex items-center px-2 gap-2">
            <div className="flex items-center bg-slate-800 rounded-md p-0.5 border border-slate-700">
                 <Toggle 
                    pressed={toolMode === 'pan'} 
                    onPressedChange={() => setToolMode('pan')}
                    className="h-7 w-7 data-[state=on]:bg-slate-600 data-[state=on]:text-white"
                 >
                    <MousePointer2 className="w-4 h-4" />
                 </Toggle>
                 <Toggle 
                    pressed={toolMode === 'select'} 
                    onPressedChange={() => setToolMode('select')}
                    className="h-7 w-7 data-[state=on]:bg-blue-600 data-[state=on]:text-white"
                 >
                    <BoxSelect className="w-4 h-4" />
                 </Toggle>
            </div>
            <div className="w-px h-5 bg-slate-700 mx-1" />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white">
                <Maximize2 className="w-4 h-4" />
            </Button>
        </div>

        <div className="flex-1 relative w-full flex items-center justify-center text-slate-500">
            Chart removed
        </div>
    </div>
  );
};

export default LogViewer;
