import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { YouTubeLink, YOUTUBE_CHANNEL_URL } from '../YouTubeLink';
import Footer from '@/components/Footer';

describe('YouTube channel link', () => {
  it('opens the Petrolord Suite channel in a new tab', () => {
    render(<YouTubeLink />);
    const a = screen.getByTestId('footer-youtube-link');
    expect(YOUTUBE_CHANNEL_URL).toBe('https://www.youtube.com/channel/UCIMWWHRACclH-LygYUOXa4Q');
    expect(a.getAttribute('href')).toBe(YOUTUBE_CHANNEL_URL);
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(a.textContent).toBe('YouTube');
  });

  it('appears in the shared site footer', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(screen.getByTestId('footer-youtube-link').getAttribute('href')).toBe(YOUTUBE_CHANNEL_URL);
  });
});
