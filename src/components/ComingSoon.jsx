import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Hammer, ArrowLeft, Construction } from 'lucide-react';

const ComingSoon = ({ appName = "Application" }) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <div className="bg-slate-900 p-6 rounded-full mb-6 border-4 border-slate-800 shadow-2xl">
        <Construction className="w-16 h-16 text-amber-500 animate-pulse" />
      </div>
      
      <h1 className="text-4xl font-bold text-white mb-4">
        {appName} is Under Construction
      </h1>
      
      <p className="text-slate-400 max-w-md mb-8 text-lg">
        Our engineering team is hard at work building this module. 
        It will be available in the next release cycle.
      </p>

      <div className="flex gap-4">
        <Button 
            onClick={() => navigate(-1)} 
            variant="outline" 
            className="border-slate-700 hover:bg-slate-800 text-white"
        >
            <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
        </Button>
        <Button 
            onClick={() => navigate('/dashboard')} 
            className="bg-blue-600 hover:bg-blue-700 text-white"
        >
            Return to Dashboard
        </Button>
      </div>
    </div>
  );
};

export default ComingSoon;