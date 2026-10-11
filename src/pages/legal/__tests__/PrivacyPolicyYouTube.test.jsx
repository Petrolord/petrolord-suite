import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrivacyPolicyPage, { LAST_UPDATED } from '../PrivacyPolicy';

jest.mock('@/components/public/PublicPage', () => ({
  PublicPage: ({ children }) => <div>{children}</div>,
}));

const renderPage = () => render(
  <MemoryRouter><PrivacyPolicyPage /></MemoryRouter>,
);

describe('Privacy policy: YouTube API Services', () => {
  it('discloses the YouTube API use with the required Google links', () => {
    renderPage();
    const sec = screen.getByTestId('privacy-youtube-api');
    expect(within(sec).getByRole('heading', { name: /5\. YouTube API Services/ })).toBeTruthy();
    const hrefs = within(sec).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining([
      'https://www.youtube.com/t/terms',
      'https://policies.google.com/privacy',
      'https://security.google.com/settings/security/permissions',
    ]));
  });

  it('shows a fixed last-updated date', () => {
    renderPage();
    expect(LAST_UPDATED).toBe('October 11, 2026');
    expect(screen.getByText(`Last Updated: ${LAST_UPDATED}`)).toBeTruthy();
  });

  it('keeps the sections numbered 1 to 10 in order', () => {
    renderPage();
    const nums = screen.getAllByRole('heading', { level: 2 }).map((h) => parseInt(h.textContent, 10));
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
