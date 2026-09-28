// Design system roles for the Studio kit and the apps built on it: the
// status tones as theme roles (docs/scope/DesignSystem.md). Every Studio app
// sits in the dashboard scope, so the kit uses roles only.

// Status chips and banners on theme roles (colour only for status, always
// paired with a word). Keys follow the tone names the Studio apps use.
export const THEMED_TONE = {
  good: 'text-pl-success-text bg-pl-success-bg border-pl-success/40',
  warn: 'text-pl-warning-text bg-pl-warning-bg border-pl-warning/40',
  danger: 'text-pl-danger-text bg-pl-danger-bg border-pl-danger/40',
  info: 'text-pl-info-text bg-pl-info-bg border-pl-info/40',
  neutral: 'text-pl-muted bg-pl-sunken border-pl-border',
};

// The same tones as text only (table cells, inline notes).
export const THEMED_TONE_TEXT = {
  good: 'text-pl-success-text',
  warn: 'text-pl-warning-text',
  danger: 'text-pl-danger-text',
  info: 'text-pl-info-text',
  neutral: 'text-pl-muted',
};
