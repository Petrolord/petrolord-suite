import React, { useEffect } from 'react';
import { useCasingTubingDesign } from '../../contexts/CasingTubingDesignContext';

const KeyboardShortcuts = () => {
  const { toggleHelp, saveCase, selectedCase, dirty } = useCasingTubingDesign();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        toggleHelp();
      }

      // Ctrl/Cmd + S: real save of the active design case.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (selectedCase && dirty) saveCase(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleHelp, saveCase, selectedCase, dirty]);

  return null;
};

export default KeyboardShortcuts;
