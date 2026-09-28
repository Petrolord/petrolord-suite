/**
 * Design system rollout batch 6F: UpgradeSuiteButton is shared by the
 * dashboard hub (not migrated in 6F) and the admin organisation detail page
 * (migrated). Outside a <ThemedApp> scope it must render byte for byte what
 * it did before the batch; inside a scope it takes the brand accent roles.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UpgradeSuiteButton from '@/components/UpgradeSuiteButton';
import { ThemedApp } from '@/design/ThemeProvider';
import { hasLegacyChrome, installDomShims } from '@/design/testing/themeAssertions';

// Captured from origin/main before the batch (the hub's button).
const LEGACY_HTML = "<button class=\"justify-center ring-offset-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-blue-600 text-white hover:bg-blue-600/90 rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 font-bold flex items-center gap-2 px-6 py-2 h-auto text-sm md:text-base\" style=\"background-color: rgb(212, 175, 55); color: rgb(0, 0, 0); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1);\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"w-4 h-4 md:w-5 md:h-5 text-black\"><path d=\"m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z\"></path><path d=\"M5 3v4\"></path><path d=\"M19 17v4\"></path><path d=\"M3 5h4\"></path><path d=\"M17 19h4\"></path></svg>Upgrade Suite</button>";

describe('UpgradeSuiteButton', () => {
  beforeAll(installDomShims);

  it('renders its legacy DOM unchanged outside a theme scope', () => {
    const { container } = render(<MemoryRouter><UpgradeSuiteButton /></MemoryRouter>);
    expect(container.innerHTML).toBe(LEGACY_HTML);
  });

  it('takes the accent roles inside a theme scope, with no hex fill', () => {
    render(<MemoryRouter><ThemedApp><UpgradeSuiteButton orgId="o1" /></ThemedApp></MemoryRouter>);
    const btn = screen.getByRole('button', { name: /Upgrade Suite/ });
    expect(btn.className).toMatch(/\bbg-pl-accent\b/);
    expect(btn.className).toMatch(/\btext-pl-accent-fg\b/);
    expect(btn.getAttribute('style')).toBeNull();
    expect(hasLegacyChrome(btn.className)).toBe(false);
    btn.querySelectorAll('[class]').forEach((el) => {
      expect(hasLegacyChrome(el.getAttribute('class'))).toBe(false);
    });
  });
});
