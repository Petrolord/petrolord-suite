import React from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useThemeClass } from '@/design/themeClass';

/*
  Design Note: This button must always be Gold (#D4AF37) with Black text.
  It uses rounded-xl, shadow-xl, bold font, and smooth scale transition on hover for clarity.
  Inside a design-system scope (rollout batch 6F) the gold is the brand
  accent role (bg-pl-accent with accent-fg ink text); outside a scope it
  renders its legacy classes and inline colours unchanged.
*/
const LEGACY_STYLE = {
  backgroundColor: '#D4AF37',
  color: '#000000',
  border: 'none',
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1)'
};

const UpgradeSuiteButton = ({ className, orgId }) => {
  const navigate = useNavigate();
  const tc = useThemeClass();

  const handleClick = () => {
    // Navigate to the quote builder
    // If orgId is provided, pass it in state so QuoteBuilder can pre-select or context switch if supported
    navigate('/dashboard/upgrade', { state: { targetOrgId: orgId } });
  };

  return (
    <Button 
      onClick={handleClick}
      className={tc(`
        rounded-xl shadow-lg hover:shadow-xl hover:scale-105
        transition-all duration-300 font-bold 
        flex items-center gap-2 px-6 py-2 h-auto text-sm md:text-base
        ${className || ''}
      `, `rounded-xl border-0 bg-pl-accent text-pl-accent-fg shadow-pl-sm hover:bg-pl-accent/90 hover:shadow-pl-md transition-all duration-300 font-bold flex items-center gap-2 px-6 py-2 h-auto text-sm md:text-base ${className || ''}`)}
      style={tc(LEGACY_STYLE, undefined)}
    >
      <Sparkles className={tc('w-4 h-4 md:w-5 md:h-5 text-black', 'w-4 h-4 md:w-5 md:h-5')} aria-hidden={tc(undefined, 'true')} />
      Upgrade Suite
    </Button>
  );
};

export default UpgradeSuiteButton;
