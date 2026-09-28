// Cold-load paths for design-system rollout batch 7C: the public and auth
// pages (sign in, sign up, confirmation, forgot, reset and set password,
// accept invite, payment verification, solutions, resources, about,
// careers and the legal pages). The homepage keeps its own paper look
// (Home.css) and is not listed.
//
// These pages always render the light theme (PublicPage in
// src/components/public/PublicPage.jsx has no toggle and no per-user
// choice), so coldLoadTheme() paints light on them whatever the device's
// last theme is. Only this batch edits this file.
export default [
  '/login',
  '/signup',
  '/auth/confirm',
  '/forgot-password',
  '/auth/reset-password',
  '/set-password',
  '/auth/accept-invite',
  '/payment/verify',
  '/solutions',
  '/resources',
  '/about-us',
  '/careers',
  '/legal/terms-of-service',
  '/legal/privacy-policy',
  '/legal/data-retention',
  '/legal/dpa',
  '/legal/verify-deletion',
  '/legal/verify-export',
  '/legal/support',
  '/legal/documentation',
];
