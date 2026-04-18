import React from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

/* 
  Design Note: This button must always be Gold (#D4AF37) with Black text.
  It uses rounded-xl, shadow-xl, bold font, and smooth scale transition on hover for clarity.
*/
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
      className={`
        rounded-xl shadow-lg hover:shadow-xl hover:scale-105
        transition-all duration-300 font-bold 
        flex items-center gap-2 px-6 py-2 h-auto text-sm md:text-base
        ${className || ''}
      `}
      style={{
        backgroundColor: '#D4AF37',
        color: '#000000',
        border: 'none',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1)'
      }}
    >
      <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-black" />
      Upgrade Suite
    </Button>
  );
};

export default UpgradeSuiteButton;