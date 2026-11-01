import type { BookRecord, Binding, CatalogueSource } from "@/domain/catalogue";
import { parseIsbn, type Isbn13 } from "@/domain/isbn";

const BASE = "https://openlibrary.org";
const TIMEOUT_MS = 8000;
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

export class OpenLibrarySource implements CatalogueSource {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly userAgent = process.env.OPEN_LIBRARY_USER_AGENT ?? "Shelfsnap/0.1 (https://github.com/erichprivat/shelfsnap)",
  ) {}

  private async get<T>(path: string): Promise<T | null> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      headers: { "User-Agent": this.userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Open Library responded ${res.status}`);
    return (await res.json()) as T;
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
      edition: {
        isbn13: isbn,
        title: edition?.title ?? title,
        publisher: edition?.publishers?.[0] ?? null,
        publishYear: yearOf(edition?.publish_date),
        pageCount: edition?.number_of_pages ?? null,
        binding: bindingOf(edition?.physical_format),
        language: edition?.languages?.[0]?.key.split("/").at(-1) ?? null,
        coverUrl: edition?.covers?.find((c) => c > 0) ? coverById(edition.covers.find((c) => c > 0)!) : null,
        openLibraryKey: edition?.key ?? null,
      },
    };
  }
}
