import { describe, expect, it } from "vitest";
import { editDistance, normalizeText, stripSeries, tokenCoverage, workMatchKey } from "./text";

describe("normalizeText", () => {
  it("folds case, diacritics and punctuation", () => {
    expect(normalizeText("Brødrene Løvehjerte!")).toBe("brødrene løvehjerte");
    expect(normalizeText("Café — Société")).toBe("cafe societe");
  });
  it("keeps non-Latin scripts", () => {
    expect(normalizeText("Война и мир")).toBe("война и мир");
    expect(normalizeText("ノルウェイの森")).toBe("ノルウェイの森");
    expect(normalizeText("ガラス")).toBe("ガラス");
  });
  it("treats & as and", () => {
    expect(normalizeText("Pride & Prejudice")).toBe("pride and prejudice");
  });
});

describe("stripSeries", () => {
  it("removes Goodreads series suffixes", () => {
    expect(stripSeries("Dune (Dune Chronicles, #1)")).toBe("Dune");
    expect(stripSeries("Gideon the Ninth (The Locked Tomb #1)")).toBe("Gideon the Ninth");
    expect(stripSeries("The Way of Kings (The Stormlight Archive, #1-2)")).toBe("The Way of Kings");
  });
  it("leaves ordinary parentheses alone", () => {
    expect(stripSeries("The Hobbit (Illustrated)")).toBe("The Hobbit (Illustrated)");
  });
});

describe("workMatchKey", () => {
  it("matches the same book across sources", () => {
    expect(workMatchKey("Dune (Dune Chronicles, #1)", ["Frank Herbert"])).toBe(workMatchKey("Dune", ["Herbert, Frank".split(", ").reverse().join(" ")]));
    expect(workMatchKey("The Hobbit: or There and Back Again", ["J.R.R. Tolkien"])).toBe(workMatchKey("Hobbit", ["J. R. R. Tolkien"]));
  });
  it("keeps different authors apart", () => {
    expect(workMatchKey("Collected Poems", ["Sylvia Plath"])).not.toBe(workMatchKey("Collected Poems", ["Philip Larkin"]));
  });
});

describe("tokenCoverage", () => {
  it("is 1 when all candidate words appear on the spine", () => {
    expect(tokenCoverage("THE LEFT HAND OF DARKNESS URSULA K LE GUIN ACE", "The Left Hand of Darkness")).toBe(1);
  });
  it("tolerates one-letter OCR slips in longer words", () => {
    expect(tokenCoverage("MIDDLEMARCH GE0RGE ELIOT", "Middlemarch")).toBe(1);
    expect(tokenCoverage("MIDDLEMARCH GEORGF ELIOT", "George Eliot")).toBe(1);
  });
  it("doesn't fuzz short words", () => {
    expect(tokenCoverage("cat", "car")).toBe(0);
  });
  it("is 0 for empty input", () => {
    expect(tokenCoverage("", "Dune")).toBe(0);
    expect(tokenCoverage("Dune", "")).toBe(0);
  });
});

it("editDistance", () => {
  expect(editDistance("kitten", "sitting")).toBe(3);
  expect(editDistance("eliot", "elliot")).toBe(1);
});
