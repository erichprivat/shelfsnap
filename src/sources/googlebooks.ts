import { parseIsbn, type Isbn13 } from "@/domain/isbn";
import { isSameBook } from "@/domain/text";
import { jsonClient, type Sleep } from "./http";

const BASE = "https://www.googleapis.com/books/v1/volumes";

type Volume = {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    industryIdentifiers?: { type?: string; identifier?: string }[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
};

export type VolumeDetails = {
  description: string | null;
  pageCount: number | null;
  publisher: string | null;
  publishYear: number | null;
  coverUrl: string | null;
  isbn13: Isbn13 | null;
};

export type VolumeQuery = { isbn?: Isbn13 | null; title: string; author?: string | null };

/** Google returns descriptions as light HTML. */
export function plainDescription(html: string | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length >= 20 ? text : null;
}

/** Thumbnails come as http with a page curl; ask for the plain cover over https. */
export function coverOf(links: { thumbnail?: string; smallThumbnail?: string } | undefined): string | null {
  const raw = links?.thumbnail ?? links?.smallThumbnail;
  if (!raw) return null;
  try {
    const url = new URL(raw.replace(/^http:/, "https:"));
    if (url.protocol !== "https:") return null;
    url.searchParams.delete("edge");
    url.searchParams.set("zoom", "1");
    return url.toString();
  } catch {
    return null;
  }
}

const yearOf = (date: string | undefined) => {
  const m = /^(\d{4})/.exec(date ?? "");
  return m ? Number(m[1]) : null;
};

/** A title search can return a different book; the title and author must both be there. */
export const sameBook = (q: VolumeQuery, v: NonNullable<Volume["volumeInfo"]>) =>
  isSameBook(q, { title: v.title ?? "", subtitle: v.subtitle, authors: v.authors ?? [] });

function details(v: NonNullable<Volume["volumeInfo"]>): VolumeDetails {
  const ids = v.industryIdentifiers ?? [];
  const isbn = ids.find((i) => i.type === "ISBN_13") ?? ids.find((i) => i.type === "ISBN_10");
  return {
    description: plainDescription(v.description),
    pageCount: v.pageCount && v.pageCount > 0 ? v.pageCount : null,
    publisher: v.publisher ?? null,
    publishYear: yearOf(v.publishedDate),
    coverUrl: coverOf(v.imageLinks),
    isbn13: isbn?.identifier ? parseIsbn(isbn.identifier) : null,
  };
}

/** Fallback for what Open Library lacks: descriptions, covers and page counts, especially for European editions. */
export class GoogleBooksSource {
  private readonly getJson: <T>(url: string) => Promise<T | null>;

  constructor(
    fetchImpl: typeof fetch = fetch,
    private readonly apiKey = process.env.GOOGLE_BOOKS_API_KEY ?? null,
    opts: { sleep?: Sleep; backoffMs?: number[] } = {},
  ) {
    this.getJson = jsonClient("Google Books", { fetchImpl, ...opts });
  }

  private async volumes(q: string): Promise<Volume[]> {
    const params = new URLSearchParams({ q, maxResults: "5", printType: "books" });
    if (this.apiKey) params.set("key", this.apiKey);
    const body = await this.getJson<{ items?: Volume[] }>(`${BASE}?${params}`);
    return body?.items ?? [];
  }

  async lookup(query: VolumeQuery): Promise<VolumeDetails | null> {
    if (query.isbn) {
      const hit = (await this.volumes(`isbn:${query.isbn}`)).find((v) => v.volumeInfo);
      if (hit?.volumeInfo) return details(hit.volumeInfo);
    }
    const title = query.title.trim();
    if (!title) return null;
    const q = [`intitle:${title}`, query.author?.trim() ? `inauthor:${query.author.trim()}` : null].filter(Boolean).join(" ");
    const candidates = (await this.volumes(q)).flatMap((v) => (v.volumeInfo && sameBook(query, v.volumeInfo) ? [v.volumeInfo] : []));
    // Prefer the record that actually has a description.
    const best = candidates.find((v) => plainDescription(v.description)) ?? candidates[0];
    return best ? details(best) : null;
  }
}
