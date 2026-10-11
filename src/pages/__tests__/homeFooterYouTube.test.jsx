import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../Home';
import { YOUTUBE_CHANNEL_URL } from '@/components/public/YouTubeLink';

jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('@/components/BookDemoModal', () => () => null);

describe('Homepage footer', () => {
  it('links the Petrolord Suite YouTube channel beside the company links', () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    const a = screen.getByTestId('footer-youtube-link');
    expect(a.getAttribute('href')).toBe(YOUTUBE_CHANNEL_URL);
    expect(a.closest('footer')).toBeTruthy();
  });
});
