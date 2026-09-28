import React from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';


const UpgradeSuiteButton = ({ className, orgId }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    // Navigate to the quote builder
    // If orgId is provided, pass it in state so QuoteBuilder can pre-select or context switch if supported
    navigate('/dashboard/upgrade', { state: { targetOrgId: orgId } });
  };

  return (
    <Button 
      onClick={handleClick}
      className={`rounded-xl border-0 bg-pl-accent text-pl-accent-fg shadow-pl-sm hover:bg-pl-accent/90 hover:shadow-pl-md transition-all duration-300 font-bold flex items-center gap-2 px-6 py-2 h-auto text-sm md:text-base ${className || ''}`}
      style={undefined}
    >
      <Sparkles className="w-4 h-4 md:w-5 md:h-5" aria-hidden="true" />
      Upgrade Suite
    </Button>
  );
};

export default UpgradeSuiteButton;
