import Papa from "papaparse";
import type { Binding } from "../catalogue";
import type { CopyFormat, ReadingStatus } from "@/db/schema";
import { parseDate, type IsoDate } from "../dates";
import { DomainError } from "../errors";
import { parseIsbn } from "../isbn";
import { normalizeText } from "../text";
import type { ImportedRead, ImportRow, ParseResult } from "./types";

export const MAX_IMPORT_ROWS = 20_000;
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;

type Raw = Record<string, string | undefined>;

const GOODREADS_HEADERS = ["Book Id", "Title", "Author", "Exclusive Shelf"];
const STORYGRAPH_HEADERS = ["Title", "Authors", "Read Status"];

const get = (r: Raw, k: string) => (r[k] ?? "").trim();
const int = (s: string) => {
  const n = Number.parseInt(s.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/** Goodreads reviews are HTML fragments; keep line breaks, drop tags. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? (e.startsWith("#") ? String.fromCodePoint(Number(e.slice(1))) : m))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Ratings are stored in half-star units (1..10). Rounds StoryGraph quarter stars to the nearest half. */
export function toHalfStars(stars: number | null): number | null {
  if (stars === null || !Number.isFinite(stars) || stars <= 0) return null;
  return Math.min(10, Math.max(1, Math.round(stars * 2)));
}

function bindingFrom(raw: string): Binding {
  const b = raw.toLowerCase();
  if (/kindle|ebook|e-book|digital|epub|nook|kobo/.test(b)) return "ebook";
  if (/audio|audible|mp3|cd/.test(b)) return "audio";
  if (/hardcover|hardback|hard cover|library binding/.test(b)) return "hardcover";
  if (/paperback|mass market|softcover|trade/.test(b)) return "paperback";
  return "unknown";
}

const formatFrom = (b: Binding): CopyFormat => (b === "ebook" ? "ebook" : b === "audio" ? "audio" : "physical");

const DNF_SHELVES = new Set(["did not finish", "dnf", "abandoned", "gave up", "didnt finish", "did not finish shelf"]);
const PAUSED_SHELVES = new Set(["paused", "on hold", "on hiatus", "currently paused"]);
const OWNED_SHELVES = new Set(["owned", "own", "owned books", "my library", "physical", "bookshelf", "my books", "i own"]);
const EBOOK_SHELVES = new Set(["kindle", "ebook", "ebooks", "owned ebooks", "kindle library"]);

function statusFromShelf(shelf: string): ReadingStatus | null | undefined {
  const s = normalizeText(shelf);
  if (s === "read") return "read";
  if (s === "currently reading") return "reading";
  if (s === "to read") return "want_to_read";
  if (DNF_SHELVES.has(s)) return "dnf";
  if (PAUSED_SHELVES.has(s)) return "paused";
  return undefined;
}

function readsFor(status: ReadingStatus | null, finished: IsoDate | null, count: number): ImportedRead[] {
  if (status === "read") {
    const reads: ImportedRead[] = [{ outcome: "finished", startedAt: null, finishedAt: finished }];
    for (let i = 1; i < count; i++) reads.push({ outcome: "finished", startedAt: null, finishedAt: null });
    return reads;
  }
  if (status === "dnf") return [{ outcome: "dnf", startedAt: null, finishedAt: finished }];
  if (status === "reading" || status === "paused") return [{ outcome: "in_progress", startedAt: null, finishedAt: null }];
  return [];
}

function parseGoodreadsRow(r: Raw, line: number): ImportRow | string {
  const title = get(r, "Title");
  if (!title) return "missing title";
  const author = get(r, "Author");
  const additional = get(r, "Additional Authors")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  const warnings: string[] = [];

  const isbn = parseIsbn(get(r, "ISBN13")) ?? parseIsbn(get(r, "ISBN"));
  const binding = bindingFrom(get(r, "Binding"));
  const shelves = get(r, "Bookshelves")
    .split(",")
    .map((s) => normalizeText(s))
    .filter(Boolean);

  const exclusive = get(r, "Exclusive Shelf");
  let status = statusFromShelf(exclusive);
  if (status === undefined) {
    status = shelves.map(statusFromShelf).find((s) => s !== undefined) ?? null;
    if (status === null) warnings.push(`Unknown shelf “${exclusive}” — imported without a reading status`);
  }

  const ownedCount = int(get(r, "Owned Copies")) ?? 0;
  const ownsDigital = shelves.some((s) => EBOOK_SHELVES.has(s));
  const ownsByShelf = shelves.some((s) => OWNED_SHELVES.has(s));
  const ownedCopies = Math.min(Math.max(ownedCount, ownsByShelf || ownsDigital ? 1 : 0), 5);
  const ownedFormat: CopyFormat = ownsDigital && !ownsByShelf ? "ebook" : formatFrom(binding);

  const readCount = Math.max(1, Math.min(int(get(r, "Read Count")) ?? 1, 50));
  const dateRead = parseDate(get(r, "Date Read"));
  const review = htmlToText(get(r, "My Review"));

  return {
    line,
    externalId: get(r, "Book Id") || `${normalizeText(title)}|${normalizeText(author)}`,
    record: {
      title,
      authors: [author, ...additional],
      firstPublishYear: int(get(r, "Original Publication Year")) ?? int(get(r, "Year Published")),
      edition: {
        isbn13: isbn,
        publisher: get(r, "Publisher") || null,
        publishYear: int(get(r, "Year Published")),
        pageCount: int(get(r, "Number of Pages")),
        binding,
        coverUrl: isbn ? openLibraryCover(isbn) : null,
      },
    },
    status,
    ownedCopies,
    ownedFormat,
    reads: readsFor(status, dateRead, readCount),
    rating: toHalfStars(int(get(r, "My Rating"))),
    review: review || null,
    warnings,
  };
}

/** "2023/01/05-2023/01/20, 2024/03/01-" → one read per range. */
export function parseStoryGraphDates(raw: string): { startedAt: IsoDate | null; finishedAt: IsoDate | null }[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((range) => {
      const [a, b] = range.includes("-") && /\d-\d|^-|-$/.test(range) ? splitRange(range) : [null, range];
      return { startedAt: parseDate(a), finishedAt: parseDate(b) };
    });
}

function splitRange(range: string): [string | null, string | null] {
  const m = /^\s*(\d{4}\/\d{1,2}\/\d{1,2})?\s*-\s*(\d{4}\/\d{1,2}\/\d{1,2})?\s*$/.exec(range);
  return m ? [m[1] ?? null, m[2] ?? null] : [null, null];
}

function parseStoryGraphRow(r: Raw, line: number): ImportRow | string {
  const title = get(r, "Title");
  if (!title) return "missing title";
  const authors = get(r, "Authors")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  const warnings: string[] = [];
  const uid = get(r, "ISBN/UID");
  const isbn = parseIsbn(uid);
  const binding = bindingFrom(get(r, "Format"));

  const statusRaw = get(r, "Read Status");
  const status = statusFromShelf(statusRaw) ?? null;
  if (!status && statusRaw) warnings.push(`Unknown read status “${statusRaw}” — imported without a reading status`);

  const ranges = parseStoryGraphDates(get(r, "Dates Read"));
  const lastRead = parseDate(get(r, "Last Date Read"));
  const readCount = Math.max(1, Math.min(int(get(r, "Read Count")) ?? 1, 50));
  let reads: ImportedRead[];
  if (status === "read" || status === "dnf") {
    const outcome = status === "read" ? "finished" : "dnf";
    reads = ranges.length
      ? ranges.map((d) => ({ outcome, ...d }))
      : [{ outcome, startedAt: null, finishedAt: lastRead }];
    while (status === "read" && reads.length < readCount) reads.push({ outcome: "finished", startedAt: null, finishedAt: null });
  } else if (status === "reading" || status === "paused") {
    const open = ranges.find((d) => d.startedAt && !d.finishedAt);
    const finishedBefore = ranges.filter((d) => d.finishedAt).map((d) => ({ outcome: "finished" as const, ...d }));
    reads = [...finishedBefore, { outcome: "in_progress", startedAt: open?.startedAt ?? null, finishedAt: null }];
  } else {
    reads = [];
  }

  const ownedRaw = get(r, "Owned?").toLowerCase();
  return {
    line,
    externalId: isbn ?? (uid || `${normalizeText(title)}|${normalizeText(authors[0] ?? "")}`),
    record: {
      title,
      authors,
      edition: { isbn13: isbn, binding, coverUrl: isbn ? openLibraryCover(isbn) : null },
    },
    status,
    ownedCopies: ownedRaw === "yes" || ownedRaw === "true" ? 1 : 0,
    ownedFormat: formatFrom(binding),
    reads,
    rating: toHalfStars(Number.parseFloat(get(r, "Star Rating")) || null),
    review: get(r, "Review") || null,
    warnings,
  };
}

export function openLibraryCover(isbn: string) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
}

export function parseImportCsv(text: string): ParseResult {
  if (text.length > MAX_IMPORT_BYTES) throw new DomainError("unsupported_file", "That file is too large (15 MB max)");
  const clean = text.replace(/^﻿/, "");
  if (!clean.trim()) throw new DomainError("unsupported_file", "That file is empty");

  const parsed = Papa.parse<Raw>(clean, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  const headers = parsed.meta.fields ?? [];
  const has = (hs: string[]) => hs.every((h) => headers.includes(h));
  const source = has(GOODREADS_HEADERS) ? "goodreads" : has(STORYGRAPH_HEADERS) ? "storygraph" : null;
  if (!source) {
    throw new DomainError(
      "unsupported_file",
      "We couldn't recognise this file. Upload the CSV export from Goodreads (My Books → Import and export) or The StoryGraph (Manage account → Export).",
    );
  }
  if (parsed.data.length > MAX_IMPORT_ROWS) {
    throw new DomainError("unsupported_file", `That's more than ${MAX_IMPORT_ROWS.toLocaleString("en")} books — split the file and import in parts`);
  }

  const rows: ImportRow[] = [];
  const skipped: ParseResult["skipped"] = [];
  const seen = new Set<string>();
  parsed.data.forEach((r, i) => {
    const line = i + 2;
    const out = source === "goodreads" ? parseGoodreadsRow(r, line) : parseStoryGraphRow(r, line);
    if (typeof out === "string") {
      skipped.push({ line, reason: out });
      return;
    }
    if (seen.has(out.externalId)) {
      skipped.push({ line, reason: "duplicate of an earlier row" });
      return;
    }
    seen.add(out.externalId);
    rows.push(out);
  });
  return { source, rows, skipped };
}
