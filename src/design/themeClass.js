// The one opt-in helper for SHARED components: pieces that render inside an
// opted-in design-system app and in unmigrated apps alike (the ui kit, the
// Studio kit, workstation shells, shared forms). See
// docs/scope/DesignSystem.md section 4.
//
// Two call shapes, both inert outside a <ThemedApp> scope:
//
//   const tc = useThemeClass();
//   <div className={tc('bg-slate-900 text-slate-200', 'bg-pl-surface text-pl-text')} />
//
//   const tc = useThemeClass(THEMED_CLASSES);   // { legacy: themed }
//   <div className={tc('bg-slate-900 text-slate-200')} />
//
// Outside a scope tc() returns its first argument unchanged, so every app
// that has not migrated renders byte for byte what it did before. Inside a
// scope it returns the second argument when one is passed (even undefined,
// which drops the class or attribute), otherwise the
// entry for the legacy string in the component's table; a string with no
// entry passes through unchanged. Write the themed strings out literally
// (in the call or in the table) so Tailwind generates them.
import { useDsTheme } from './themeContext.js';

const identity = (legacy) => legacy;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** tc() for a known theme value; `ds` is useDsTheme()'s result (null outside a scope). */
export function themeClassPicker(ds, table) {
  if (!ds) return identity;
  // Two arguments: the second wins inside a scope, even when it is
  // undefined (tc(legacy, undefined) drops a class or attribute there).
  return (legacy, ...themed) => {
    if (themed.length) return themed[0];
    return table && hasOwn(table, legacy) ? table[legacy] : legacy;
  };
}

/** Hook form: tc(legacy[, themed]) for the nearest scope. */
export function useThemeClass(table) {
  return themeClassPicker(useDsTheme(), table);
}
