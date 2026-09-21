// EC5-6 and EC5-7 (engines #185). The portfolio engine refuses, by project
// name, a pos that is present but blank, non-numeric or outside 0 to 1, and a
// capex that is missing, blank, non-numeric or negative. `projectEmv` throws
// for a bad pos, and the workbench table calls it while rendering, so the
// page reads each project through this helper and shows the refusal instead
// of crashing.
import { optimizePortfolio, projectEmv, PortfolioInputError } from '@/utils/portfolioOptimizer';

const isPortfolioRefusal = (err) => err instanceof PortfolioInputError || err?.name === 'PortfolioInputError';

/** Risked EMV of one project, or the engine's refusal message. */
export const emvOrRefusal = (project) => {
  try {
    return { emv: projectEmv(project), refusal: null };
  } catch (err) {
    if (isPortfolioRefusal(err)) return { emv: null, refusal: err.message };
    throw err;
  }
};

/**
 * The engine's refusal of one project as an optimisation candidate (capex,
 * then pos, as optimizePortfolio checks them), or null when it is accepted.
 */
export const projectRefusal = (project) => {
  try {
    optimizePortfolio({ projects: [project], capexLimit: 0, iterations: 1 });
    return null;
  } catch (err) {
    if (isPortfolioRefusal(err)) return err.message;
    throw err;
  }
};

/** The chance of success as printed: a whole percent, or n/a when it is refused. */
export const posText = (project, refusal) => {
  if (project?.pos === undefined || project?.pos === null) return '100%';
  const n = Number(project.pos);
  if (refusal && /\bpos\b/.test(refusal)) return 'n/a';
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : 'n/a';
};
