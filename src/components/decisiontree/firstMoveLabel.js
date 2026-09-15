// EC4-5 (owner decision 2026-09-15): one label for the "Recommended first
// move" of a rolled-back tree, shared by the Decision Tree Builder card and
// the Decision Studio brief. The two screens used to disagree on a chance
// root ("Chance root" in the builder, "Single path" in the brief).

export const CHANCE_ROOT_LABEL = 'Chance root: no first decision to make';
export const TERMINAL_ROOT_LABEL = 'Single outcome: no decision to make';

/**
 * EC4-1 (engines #192). A rolled-back decision node now carries two tie sets:
 * `tiedIndices` (the exact band, which drives `bestBranchIndex` and the
 * optimal-path marking) and `tiedIndicesAtCardPrecision` (the set that agrees
 * with the 2 dp cards on screen). A recommendation a reader acts on must read
 * the card-precision set, otherwise the screen recommends one of two branches
 * whose printed EMVs are identical and shows a decision advantage of 0.00.
 */
const quoted = (labels) => (labels.length <= 1
  ? labels.map((l) => `"${l}"`).join('')
  : `${labels.slice(0, -1).map((l) => `"${l}"`).join(', ')} and "${labels[labels.length - 1]}"`);

/** The branches that tie for best on the cards, by label. */
export const tiedFirstMoves = (annotated) => {
  if (!annotated || annotated.type !== 'decision') return [];
  const tied = annotated.tiedIndicesAtCardPrecision;
  if (!Array.isArray(tied) || tied.length < 2) return [];
  return tied.map((i) => annotated.branches?.[i]?.label).filter(Boolean);
};

/** True when the first move is a toss-up at the precision the cards show. */
export const isIndifferentFirstMove = (annotated) => Boolean(
  annotated?.type === 'decision' && annotated.indifferentAtCardPrecision,
);

/**
 * @param {object|null} annotated a tree annotated by rollback() from
 *   src/lib/decisionTree, or null when there is no valid tree.
 * @returns {string} the best first branch's label for a decision root, a
 *   plain statement for a chance or terminal root, or 'N/A' with no tree.
 */
export function firstMoveLabel(annotated) {
  if (!annotated) return 'N/A';
  if (annotated.type === 'decision') {
    const tied = tiedFirstMoves(annotated);
    if (tied.length > 1) return `Indifferent: ${quoted(tied)} come to the same figure`;
    const best = annotated.branches?.[annotated.bestBranchIndex];
    return best ? best.label : 'N/A';
  }
  if (annotated.type === 'chance') return CHANCE_ROOT_LABEL;
  return TERMINAL_ROOT_LABEL;
}
