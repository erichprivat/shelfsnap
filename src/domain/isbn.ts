export type Isbn13 = string & { readonly __brand: "Isbn13" };

const isbn10CheckDigit = (nine: string) => {
  const sum = [...nine].reduce((acc, d, i) => acc + Number(d) * (10 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? "X" : String(check);
};

const isbn13CheckDigit = (twelve: string) => {
  const sum = [...twelve].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
};

/** Strips spreadsheet wrappers (`="…"`), hyphens and spaces; uppercases a trailing x. */
export function cleanIsbnInput(raw: string): string {
  return raw
    .trim()
    .replace(/^="?|"$/g, "")
    .replace(/^isbn(-1[03])?:?/i, "")
    .replace(/[\s\-‐‑–]/g, "")
    .toUpperCase();
}

/**
 * Parses an ISBN-10 or ISBN-13 (or a 978/979 EAN barcode) into a canonical ISBN-13.
 * Returns null for anything with a bad checksum or that isn't a book number.
 */
export function parseIsbn(raw: string | null | undefined): Isbn13 | null {
  if (!raw) return null;
  let s = cleanIsbnInput(raw);
  // Spreadsheets drop leading zeros from ISBN-10s stored as numbers.
  if (/^\d{8,9}X?$/.test(s) && s.length < 10) s = s.padStart(10, "0");

  if (/^\d{9}[\dX]$/.test(s)) {
    if (isbn10CheckDigit(s.slice(0, 9)) !== s[9]) return null;
    const twelve = `978${s.slice(0, 9)}`;
    return (twelve + isbn13CheckDigit(twelve)) as Isbn13;
  }
  if (/^\d{13}$/.test(s)) {
    if (!s.startsWith("978") && !s.startsWith("979")) return null;
    if (isbn13CheckDigit(s.slice(0, 12)) !== s[12]) return null;
    return s as Isbn13;
  }
  return null;
}
