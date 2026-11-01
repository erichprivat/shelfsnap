const MIN_GAP = 1e-6;

/** A position strictly between two neighbours; null means "no neighbour on that side". */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1;
  if (before === null) return after! - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

/** True when neighbours are too close to split again and the sequence should be renumbered. */
export function needsRebalance(before: number | null, after: number | null): boolean {
  return before !== null && after !== null && after - before < MIN_GAP;
}
