import type { BookRecord, Binding, CatalogueSource, EditionRecord } from "@/domain/catalogue";
import { parseIsbn, type Isbn13 } from "@/domain/isbn";
import { jsonClient, type Sleep } from "./http";

const BASE = "https://openlibrary.org";
// The editions.* fields make Open Library return the edition that best matches the query.
const SEARCH_FIELDS =
  "key,title,subtitle,author_name,first_publish_year,cover_i,cover_edition_key,subject,isbn,editions,editions.key,editions.title,editions.isbn,editions.cover_i,editions.language";

type SearchDoc = {
  key?: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  cover_edition_key?: string;
  subject?: string[];
  isbn?: string[];
  editions?: { docs?: EditionDoc[] };
};

type EditionDoc = { key?: string; title?: string; isbn?: string[]; cover_i?: number; language?: string[] };

type EditionJson = {
  title?: string;
  isbn_13?: string[];
  isbn_10?: string[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  physical_format?: string;
  covers?: number[];
  languages?: { key: string }[];
  key?: string;
};

export const coverById = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`;

function bindingOf(format: string | undefined): Binding {
  const f = (format ?? "").toLowerCase();
  if (/hard/.test(f)) return "hardcover";
  if (/paper|soft|mass market/.test(f)) return "paperback";
  if (/e-?book|kindle|digital/.test(f)) return "ebook";
  if (/audio/.test(f)) return "audio";
  return "unknown";
}

const yearOf = (date: string | undefined) => {
  const m = /\b(1[5-9]\d\d|20\d\d)\b/.exec(date ?? "");
  return m ? Number(m[1]) : null;
};

const firstIsbn = (list: string[] | undefined) => list?.map((i) => parseIsbn(i)).find((i) => i !== null) ?? null;

function fromDoc(doc: SearchDoc): BookRecord | null {
  if (!doc.title) return null;
  const match = doc.editions?.docs?.[0];
  if (match?.key) {
    const cover = match.cover_i ?? doc.cover_i;
    return {
      title: doc.title,
      subtitle: doc.subtitle ?? null,
      authors: doc.author_name ?? [],
      firstPublishYear: doc.first_publish_year ?? null,
      subjects: (doc.subject ?? []).slice(0, 12),
      openLibraryKey: doc.key ?? null,
      edition: {
        title: match.title ?? doc.title,
        isbn13: firstIsbn(match.isbn),
        openLibraryKey: match.key,
        language: match.language?.[0] ?? null,
        coverUrl: cover ? coverById(cover) : null,
      },
    };
  }
  const isbn = firstIsbn(doc.isbn);
  return {
    title: doc.title,
    subtitle: doc.subtitle ?? null,
    authors: doc.author_name ?? [],
    firstPublishYear: doc.first_publish_year ?? null,
    subjects: (doc.subject ?? []).slice(0, 12),
    openLibraryKey: doc.key ?? null,
    edition: {
      // A search hit is a work; without a specific edition we keep the cover edition and no ISBN.
      isbn13: doc.cover_edition_key ? null : isbn,
      openLibraryKey: doc.cover_edition_key ? `/books/${doc.cover_edition_key}` : null,
      coverUrl: doc.cover_i ? coverById(doc.cover_i) : null,
    },
  };
}

type WorkJson = { description?: string | { value?: string }; covers?: number[]; subjects?: string[] };

export type WorkDetails = { description: string | null; coverUrl: string | null; subjects: string[] };

/**
 * Open Library descriptions are community-edited markdown: drops reference-style
 * source links, "Also contained in" lists and link syntax, keeping the prose.
 */
export function cleanDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let text = raw.replace(/\r\n?/g, "\n");
  text = text.split(/\n-{3,}\s*\n/)[0]!; // everything after a horizontal rule is "Also contained in" etc.
  text = text
    .replace(/^\s*\[\d+\]:\s*\S+.*$/gm, "") // [1]: https://…
    .replace(/\(\s*\[(?:source|Source)\]\s*\[\d+\]\s*\)/g, "") // ([source][1])
    .replace(/\[([^\]]+)\]\[\d+\]/g, "$1") // [text][1]
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1") // [text](url)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length >= 20 ? text : null;
}

/** Work records mix in machine tags ("award:man_booker_prize=1989", "nyt:…"); keep the words people read. */
const readableSubjects = (subjects: string[] | undefined) => (subjects ?? []).filter((s) => !/[:=]/.test(s)).slice(0, 12);

const firstCover = (covers: number[] | undefined) => {
  const id = covers?.find((c) => c > 0);
  return id ? coverById(id) : null;
};

function editionFromJson(edition: EditionJson): EditionRecord {
  return {
    isbn13: firstIsbn([...(edition.isbn_13 ?? []), ...(edition.isbn_10 ?? [])]),
    title: edition.title ?? null,
    publisher: edition.publishers?.[0] ?? null,
    publishYear: yearOf(edition.publish_date),
    pageCount: edition.number_of_pages ?? null,
    binding: bindingOf(edition.physical_format),
    language: edition.languages?.[0]?.key.split("/").at(-1) ?? null,
    coverUrl: firstCover(edition.covers),
    openLibraryKey: edition.key ?? null,
  };
}

/** Accepts "/works/OL1W" or "OL1W"; anything else is not an Open Library key we'd fetch. */
const keyPath = (key: string, kind: "works" | "books") => {
  const id = key.split("/").at(-1) ?? "";
  return /^OL\d+[WM]$/.test(id) ? `/${kind}/${id}.json` : null;
};

export class OpenLibrarySource implements CatalogueSource {
  private readonly getJson: <T>(url: string) => Promise<T | null>;

  constructor(
    fetchImpl: typeof fetch = fetch,
    userAgent = process.env.OPEN_LIBRARY_USER_AGENT ?? "Readmoth/0.1 (https://github.com/erichprivat/shelfsnap)",
    opts: { sleep?: Sleep; backoffMs?: number[] } = {},
  ) {
    this.getJson = jsonClient("Open Library", { fetchImpl, headers: { "User-Agent": userAgent }, ...opts });
  }

  private get<T>(path: string): Promise<T | null> {
    return this.getJson<T>(`${BASE}${path}`);
  }

  /** Description and cover from the work record, which search results don't carry. */
  async workDetails(workKey: string): Promise<WorkDetails | null> {
    const path = keyPath(workKey, "works");
    if (!path) return null;
    const work = await this.get<WorkJson>(path);
    if (!work) return null;
    const raw = typeof work.description === "string" ? work.description : work.description?.value;
    return { description: cleanDescription(raw), coverUrl: firstCover(work.covers), subjects: readableSubjects(work.subjects) };
  }

  /** Pages, publisher and binding for an edition found by search. */
  async editionDetails(editionKey: string): Promise<EditionRecord | null> {
    const path = keyPath(editionKey, "books");
    if (!path) return null;
    const edition = await this.get<EditionJson>(path);
    return edition ? editionFromJson(edition) : null;
  }

  private async searchDocs(params: Record<string, string>, limit: number): Promise<BookRecord[]> {
    const query = new URLSearchParams({ ...params, limit: String(limit), fields: SEARCH_FIELDS });
    const body = await this.get<{ docs?: SearchDoc[] }>(`/search.json?${query}`);
    return (body?.docs ?? []).map(fromDoc).filter((r): r is BookRecord => r !== null);
  }

  async search(query: string, limit: number): Promise<BookRecord[]> {
    const q = query.trim();
    return q ? this.searchDocs({ q }, limit) : [];
  }

  async searchByTitle(title: string, author: string | null, limit: number): Promise<BookRecord[]> {
    const t = title.trim();
    if (!t) return [];
    return this.searchDocs(author?.trim() ? { title: t, author: author.trim() } : { title: t }, limit);
  }

  async lookupIsbn(isbn: Isbn13): Promise<BookRecord | null> {
    const [search, edition] = await Promise.all([
      this.get<{ docs?: SearchDoc[] }>(`/search.json?isbn=${isbn}&limit=1&fields=key,title,subtitle,author_name,first_publish_year,subject`),
      this.get<EditionJson>(`/isbn/${isbn}.json`),
    ]);
    const doc = search?.docs?.[0];
    if (!doc && !edition) return null;
    const title = doc?.title ?? edition?.title;
    if (!title) return null;
    return {
      title,
      subtitle: doc?.subtitle ?? null,
      authors: doc?.author_name ?? [],
      firstPublishYear: doc?.first_publish_year ?? null,
      subjects: (doc?.subject ?? []).slice(0, 12),
      openLibraryKey: doc?.key ?? null,
      edition: { ...(edition ? editionFromJson(edition) : {}), isbn13: isbn, title: edition?.title ?? title },
    };
  }
}
