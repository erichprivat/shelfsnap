/** Book-cloth colours. Each book gets one deterministically, so a shelf looks the same every visit. */
const CLOTHS = [
  { bg: "#7a2e22", fg: "#f1e4cf", foil: "#d9b56a" }, // oxblood
  { bg: "#22324a", fg: "#e9e2d0", foil: "#c9a65a" }, // navy
  { bg: "#2f4a3a", fg: "#ede4cc", foil: "#cfae63" }, // bottle green
  { bg: "#b8892f", fg: "#1f1a12", foil: "#3a2a12" }, // mustard
  { bg: "#e4dcc8", fg: "#2a2520", foil: "#8a2e1f" }, // cream
  { bg: "#4a4f57", fg: "#ece6da", foil: "#bfc4ca" }, // slate
  { bg: "#1f1e1c", fg: "#e8dfcc", foil: "#c8a45b" }, // black
  { bg: "#8c5a3c", fg: "#f4e7d2", foil: "#2b1a10" }, // tan
  { bg: "#5b3a55", fg: "#efe1e8", foil: "#d6b36d" }, // plum
  { bg: "#9c3b2c", fg: "#f6e8d8", foil: "#f0d9a8" }, // brick
  { bg: "#3e5a6b", fg: "#e7eef0", foil: "#e0c486" }, // steel
  { bg: "#c9b99a", fg: "#2b241b", foil: "#5b3a1e" }, // linen
] as const;

export type Cloth = (typeof CLOTHS)[number];

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function clothFor(seed: string): Cloth {
  return CLOTHS[hash(seed) % CLOTHS.length]!;
}

/** Spine thickness from page count (or a stable guess), and a slight height variance like a real shelf. */
export function spineGeometry(seed: string, pageCount: number | null) {
  const h = hash(seed + ":geo");
  const pages = pageCount ?? 180 + (h % 320);
  const width = Math.round(Math.min(58, Math.max(20, pages / 11)));
  const height = 76 + (h % 25);
  const style = h % 4;
  return { width, height, style };
}

export function authorSurname(authors: string[]) {
  const first = authors[0] ?? "";
  return first.split(/\s+/).at(-1) ?? "";
}
