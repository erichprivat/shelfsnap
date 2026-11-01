/**
 * Lowercase, strip punctuation, collapse whitespace. Accents are folded on Latin
 * letters only (é → e); in other scripts marks are part of the letter (й ≠ и).
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const SERIES_SUFFIX = /\s*\(([^()]*?),?\s*#\s*[\d.]+(?:-[\d.]+)?\)\s*$/;

/** "Dune (Dune Chronicles, #1)" → "Dune". */
export function stripSeries(title: string): string {
  return title.replace(SERIES_SUFFIX, "").trim();
}

/** The title without series, subtitle or edition note: "Basquiat - 40th Anniversary Edition" → "Basquiat". */
export function mainTitle(title: string): string {
  return stripSeries(title).split(/:|\s[-–—]\s/)[0]!.trim();
}

const LEADING_ARTICLE = /^(the|a|an|der|die|das|le|la|les|el|den|det|en|et) /;

export function workMatchKey(title: string, authors: string[]): string {
  const t = normalizeText(mainTitle(title)).replace(LEADING_ARTICLE, "");
  const surname = normalizeText(authors[0] ?? "").split(" ").at(-1) ?? "";
  return `${t}|${surname}`;
}

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "by", "in", "to", "de", "og", "i", "på"]);

export function tokens(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/**
 * How much of the candidate's tokens appear in the observed text (0..1).
 * Spine text often carries publisher names and series noise, so recall of the
 * candidate matters more than symmetry. Tolerates single-character OCR slips.
 */
export function tokenCoverage(observed: string, candidate: string): number {
  const cand = tokens(candidate);
  if (cand.length === 0) return 0;
  const obs = tokens(observed);
  if (obs.length === 0) return 0;
  const hits = cand.filter((c) => obs.some((o) => o === c || (c.length >= 5 && editDistance(o, c) <= 1)));
  return hits.length / cand.length;
}

export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}
