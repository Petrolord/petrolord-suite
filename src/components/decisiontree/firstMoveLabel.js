// EC4-5 (owner decision 2026-09-15): one label for the "Recommended first
// move" of a rolled-back tree, shared by the Decision Tree Builder card and
// the Decision Studio brief. The two screens used to disagree on a chance
// root ("Chance root" in the builder, "Single path" in the brief).

export const CHANCE_ROOT_LABEL = 'Chance root: no first decision to make';
export const TERMINAL_ROOT_LABEL = 'Single outcome: no decision to make';

/**
 * @param {object|null} annotated a tree annotated by rollback() from
 *   src/lib/decisionTree, or null when there is no valid tree.
 * @returns {string} the best first branch's label for a decision root, a
 *   plain statement for a chance or terminal root, or 'N/A' with no tree.
 */
export function firstMoveLabel(annotated) {
  if (!annotated) return 'N/A';
  if (annotated.type === 'decision') {
    const best = annotated.branches?.[annotated.bestBranchIndex];
    return best ? best.label : 'N/A';
  }
  if (annotated.type === 'chance') return CHANCE_ROOT_LABEL;
  return TERMINAL_ROOT_LABEL;
}
