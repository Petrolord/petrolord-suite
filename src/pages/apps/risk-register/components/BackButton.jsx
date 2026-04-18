import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const BackButton = () => {
  const navigate = useNavigate();

  return (
    <Button 
      variant="outline" 
      onClick={() => navigate('/dashboard/assurance')}
      className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300 transition-colors h-8 px-3 text-xs"
    >
      <ChevronLeft className="w-4 h-4 mr-1" />
      Back to Assurance
    </Button>
  );
};