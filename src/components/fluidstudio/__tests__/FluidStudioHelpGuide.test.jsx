import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import FluidStudioHelpGuide from '../FluidStudioHelpGuide';

describe('FluidStudioHelpGuide', () => {
  it('renders comprehensive sections when open', () => {
    render(<FluidStudioHelpGuide isOpen onOpenChange={() => {}} />);
    expect(screen.getByText(/Fluid Systems & Flow Behavior Studio Help Guide/i)).toBeInTheDocument();
    // Spot-check the major section headers (accordion trigger buttons).
    [
      /What is the Fluid Systems/i,
      /Describe the fluid/i,
      /Choose PVT correlations/i,
      /Separator train/i,
      /Blending two streams/i,
      /hydrates & WAT/i,
      /Batch sensitivity/i,
      /Saving & loading/i,
      /Assumptions & limitations/i,
    ].forEach((re) => expect(screen.getByRole('button', { name: re })).toBeInTheDocument());
  });

  it('does not render content when closed', () => {
    render(<FluidStudioHelpGuide isOpen={false} onOpenChange={() => {}} />);
    expect(screen.queryByText(/Separator train/i)).not.toBeInTheDocument();
  });
});
