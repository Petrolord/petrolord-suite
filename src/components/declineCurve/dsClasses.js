// Design-system pilot (Decline Curve Analysis): theme classes for the two
// shared primitives that are not theme-aware yet (Checkbox, Switch). They are
// passed as className from inside the app only, so every other app keeps the
// legacy look. Remove these once src/components/ui/checkbox.jsx and
// switch.jsx follow the theme themselves.
export const CHECKBOX_THEMED =
  'border-pl-border-strong ring-offset-pl-bg focus-visible:ring-pl-focus data-[state=checked]:bg-pl-primary data-[state=checked]:text-pl-primary-fg data-[state=checked]:border-pl-primary rounded-[4px]';

// [&>span] reaches the thumb, which the Switch does not expose a className for.
export const SWITCH_THEMED =
  'data-[state=checked]:bg-pl-primary data-[state=unchecked]:bg-pl-border-strong focus-visible:ring-pl-focus focus-visible:ring-offset-pl-bg [&>span]:bg-pl-surface';
