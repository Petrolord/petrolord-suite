// Theme-aware class strings for SHARED components that render inside an
// opted-in design-system app and in unmigrated apps alike.
//
//   const tc = useThemeClass(THEMED_CLASSES);
//   <div className={tc('bg-slate-900 text-slate-200')} />
//
// Outside a <ThemedApp> scope tc() returns its argument unchanged, so every
// app that has not migrated renders byte for byte what it did before. Inside
// a scope it returns the themed string from the component's own table (the
// themed strings are written out literally in that table so Tailwind
// generates them). A string with no table entry passes through unchanged.
import { useDsTheme } from '@/design/themeContext';

const identity = (s) => s;

export function useThemeClass(table) {
  const ds = useDsTheme();
  if (!ds) return identity;
  return (s) => (Object.prototype.hasOwnProperty.call(table, s) ? table[s] : s);
}
