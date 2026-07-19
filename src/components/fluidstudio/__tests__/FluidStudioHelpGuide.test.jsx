import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluidStudioHelpContent } from '../FluidStudioHelpGuide';

describe('FluidStudioHelpContent', () => {
  it('renders comprehensive sections', () => {
    render(<FluidStudioHelpContent />);
    // Spot-check the major section headers (accordion trigger buttons).
    [
      /What is the Fluid Systems/i,
      /Describe the fluid/i,
      /Choose PVT correlations/i,
      /Separator train/i,
      /Blending two streams/i,
      /hydrates & WAT/i,
      /Batch sensitivity/i,
      /Compositional mode/i,
      /Saving & loading/i,
      /Assumptions & limitations/i,
    ].forEach((re) => expect(screen.getByRole('button', { name: re })).toBeInTheDocument());
  });

  it('describes the Studio-shell project flow, not the retired Save dialog', () => {
    const { container } = render(<FluidStudioHelpContent />);
    fireEvent.click(screen.getByRole('button', { name: /Saving & loading/i }));
    expect(container.textContent).toMatch(/Project selector/i);
    expect(container.textContent).toMatch(/autosave/i);
  });
});
