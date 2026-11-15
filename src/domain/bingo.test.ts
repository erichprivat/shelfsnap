import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  category,
  completedLines,
  FREE,
  fittingSquares,
  isValidCard,
  randomCard,
  rerollSquare,
  seededRng,
  THEMES,
  type BookFacts,
} from "./bingo-categories";

const facts = (f: Partial<BookFacts>): BookFacts => ({ title: "Lantern Harbour", pages: 300, year: 2010, subjects: [], language: "eng", ownedSince: null, finishedOn: "2027-03-01", ...f });
const fits = (id: string, f: Partial<BookFacts>) => category(id)!.rule!(facts(f));

describe("bingo categories", () => {
  it("has unique ids and every theme fills a card on its own", () => {
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length);
    for (const t of THEMES) {
      expect(t.categories.every((id) => category(id))).toBe(true);
      expect(new Set(t.categories.map((id) => category(id)!.group ?? id)).size).toBeGreaterThanOrEqual(24);
    }
  });

  it("checks pages, eras, subjects, titles and how long a book sat on the shelf", () => {
    expect(fits("600-pages", { pages: 720 })).toBe(true);
    expect(fits("600-pages", { pages: 600 })).toBe(false);
    expect(fits("600-pages", { pages: null })).toBe(false);
    expect(fits("1990s", { year: 1996 })).toBe(true);
    expect(fits("1990s", { year: 2001 })).toBe(false);
    expect(fits("before-1700", { year: 1605 })).toBe(true);
    expect(fits("before-1700", { year: null })).toBe(false);
    expect(fits("poetry", { subjects: ["Norwegian Poetry"] })).toBe(true);
    expect(fits("science-fiction", { subjects: ["Fiction, science fiction, general"] })).toBe(true);
    expect(fits("one-word-title", { title: "Sult" })).toBe(true);
    expect(fits("colour-title", { title: "The Red and the Black" })).toBe(true);
    expect(fits("colour-title", { title: "Redemption" })).toBe(false);
    expect(fits("this-year", { year: 2027, finishedOn: "2027-05-01" })).toBe(true);
    expect(fits("owned-year", { ownedSince: Date.parse("2025-01-01"), finishedOn: "2027-01-01" })).toBe(true);
    expect(fits("owned-year", { ownedSince: Date.parse("2026-12-01"), finishedOn: "2027-01-01" })).toBe(false);
  });

  it("leaves judgement calls to the reader", () => {
    expect(category("author-of-colour")!.rule).toBeUndefined();
    expect(category("gift")!.rule).toBeUndefined();
  });
});

describe("random cards", () => {
  it("deals 24 different squares from the theme around a free centre", () => {
    for (const t of THEMES) {
      const card = randomCard(t.id, seededRng(7));
      expect(isValidCard(card)).toBe(true);
      expect(card[12]).toBe(FREE);
      expect(card.filter((id) => id !== FREE).every((id) => t.categories.includes(id))).toBe(true);
    }
  });

  it("never puts two squares from the same group on one card", () => {
    for (let seed = 1; seed < 50; seed++) {
      const groups = randomCard("time", seededRng(seed)).map((id) => category(id)?.group).filter(Boolean);
      expect(new Set(groups).size).toBe(groups.length);
    }
  });

  it("is reproducible with the same seed and differs with another", () => {
    expect(randomCard("genre", seededRng(3))).toEqual(randomCard("genre", seededRng(3)));
    expect(randomCard("genre", seededRng(3))).not.toEqual(randomCard("genre", seededRng(4)));
  });

  it("rerolls one square to something new, and never the centre", () => {
    const card = randomCard("classic", seededRng(1));
    const next = rerollSquare(card, 3, "classic", seededRng(2));
    expect(next[3]).not.toBe(card[3]);
    expect(next.filter((_, i) => i !== 3)).toEqual(card.filter((_, i) => i !== 3));
    expect(isValidCard(next)).toBe(true);
    expect(rerollSquare(card, 12, "classic")).toEqual(card);
  });

  it("rejects incomplete or made-up cards", () => {
    const card = randomCard("classic", seededRng(1));
    expect(isValidCard(card.slice(0, 24))).toBe(false);
    expect(isValidCard(card.map((id, i) => (i === 0 ? "made-up" : id)))).toBe(false);
    expect(isValidCard(card.map((id, i) => (i === 1 ? card[0] : id)))).toBe(false);
  });
});

describe("lines and fits", () => {
  it("finds rows, columns and diagonals, with the centre always free", () => {
    expect(completedLines(new Set([0, 1, 2, 3, 4]))).toEqual([[0, 1, 2, 3, 4]]);
    expect(completedLines(new Set([10, 11, 13, 14]))).toEqual([[10, 11, 12, 13, 14]]);
    expect(completedLines(new Set([0, 6, 18, 24]))).toEqual([[0, 6, 12, 18, 24]]);
    expect(completedLines(new Set([0, 1, 2, 3]))).toEqual([]);
  });

  it("lists the squares a book fits by rule", () => {
    const card = randomCard("size", seededRng(5));
    const at = card.indexOf("600-pages");
    if (at >= 0) expect(fittingSquares(card, facts({ pages: 700 }))).toContain(at);
    expect(fittingSquares(card, facts({ pages: null, title: "" , year: null }))).not.toContain(12);
  });
});
