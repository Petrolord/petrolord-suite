// Back to the module dashboard (Geoscience cross-app navigation,
// 2026-09-03). The dashboard sidebar is hidden on every /dashboard/apps
// route, so a workstation ribbon is the only way out of an app; this is
// the Geomechanics ribbon idiom (Home icon + module name) as one shared
// element, placed first in the ribbon.

import React from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { moduleHomePath, MODULE_LABELS } from '@/components/wells/appLinks';

/**
 * @param {Object} p
 * @param {string} p.module dashboard module segment ('geoscience', ...)
 * @param {string} [p.label] defaults to the module's display name
 * @param {string} [p.to] route override
 * @param {string} [p.testId] defaults to `module-home-<module>`
 */
export default function ModuleHomeLink({ module, label, to, testId, className = '' }) {
  const text = label || MODULE_LABELS[module] || module;
  return (
    <>
      <Link
        to={to || moduleHomePath(module)}
        data-testid={testId || `module-home-${module}`}
        title={`Back to the ${text} dashboard`}
        className={`flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap ${className}`}
      >
        <Home className="h-3.5 w-3.5" /> {text}
      </Link>
      <span className="text-slate-700 select-none" aria-hidden="true">|</span>
    </>
  );
}
