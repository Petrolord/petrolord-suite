import React from 'react';

// The Petrolord Suite YouTube channel (managed by the channel manager, docs/ai-employees).
export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/channel/UCIMWWHRACclH-LygYUOXa4Q';

/** Footer link to our YouTube channel, with the YouTube play mark in its brand red. */
export const YouTubeLink = ({ className }) => (
  <a
    href={YOUTUBE_CHANNEL_URL}
    target="_blank"
    rel="noopener noreferrer"
    className={className}
    data-testid="footer-youtube-link"
    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5em' }}
  >
    <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true" focusable="false">
      <rect width="20" height="14" rx="3.5" fill="#FF0000" />
      <path d="M8 4l5.2 3L8 10z" fill="#FFFFFF" />
    </svg>
    YouTube
  </a>
);

export default YouTubeLink;
