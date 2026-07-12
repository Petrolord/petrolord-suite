// Ribbon · AI: interpretation copilot toggle (right dock).

import React from 'react';
import { Bot } from 'lucide-react';
import { RibbonGroup, RibbonButton } from '../Ribbon';

export default function AiTab({ copilotOpen, toggleCopilot }) {
  return (
    <RibbonGroup label="Assistant">
      <RibbonButton
        icon={Bot}
        label="Copilot"
        active={copilotOpen}
        onClick={toggleCopilot}
        title="Interpretation copilot — asks before it acts; tools run in your browser"
      />
    </RibbonGroup>
  );
}
