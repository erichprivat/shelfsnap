type Loc = { id: string; parentId: string | null; name: string };

/** "Living room / Shelf 2" for each location id. */
export function placePaths(locs: Loc[]): Map<string, string[]> {
  const byId = new Map(locs.map((l) => [l.id, l]));
  const out = new Map<string, string[]>();
  for (const l of locs) {
    const chain: string[] = [];
    const seen = new Set<string>();
    let cur: Loc | undefined = l;
    while (cur && !seen.has(cur.id)) {
      chain.unshift(cur.name);
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    out.set(l.id, chain);
  }
  return out;
}

/** Depth-first order so shelves appear under their room. */
export function placeOrder(locs: Loc[]): Loc[] {
  const out: Loc[] = [];
  const walk = (parent: string | null) => {
    for (const l of locs.filter((x) => x.parentId === parent)) {
      out.push(l);
      walk(l.id);
    }
  };
  walk(null);
  return out;
}
