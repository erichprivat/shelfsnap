import { describe, expect, it } from "vitest";
import { parseIsbn } from "@/domain/isbn";
import { OpenLibrarySource } from "./openlibrary";

const respond = (routes: Record<string, unknown>) =>
  (async (input: string | URL | Request) => {
    const url = String(input);
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    if (!hit) return new Response("not found", { status: 404 });
    if (hit[1] instanceof Response) return hit[1];
    return Response.json(hit[1]);
  }) as typeof fetch;

describe("OpenLibrarySource", () => {
  const isbn = parseIsbn("9781590171998")!;

  it("combines the search doc and edition record for an ISBN", async () => {
    const src = new OpenLibrarySource(
      respond({
        "search.json?isbn": { docs: [{ key: "/works/OL1W", title: "Stoner", author_name: ["John Williams"], first_publish_year: 1965 }] },
        "/isbn/": { title: "Stoner", publishers: ["NYRB Classics"], publish_date: "June 2006", number_of_pages: 288, physical_format: "Paperback", covers: [-1, 42], languages: [{ key: "/languages/eng" }], key: "/books/OL2M" },
      }),
    );
    expect(await src.lookupIsbn(isbn)).toMatchObject({
      title: "Stoner",
      authors: ["John Williams"],
      openLibraryKey: "/works/OL1W",
      edition: { isbn13: isbn, publisher: "NYRB Classics", publishYear: 2006, pageCount: 288, binding: "paperback", language: "eng", coverUrl: "https://covers.openlibrary.org/b/id/42-L.jpg" },
    });
  });

  it("returns null for an unknown ISBN", async () => {
    const src = new OpenLibrarySource(respond({ "search.json": { docs: [] } }));
    expect(await src.lookupIsbn(isbn)).toBeNull();
  });

  it("throws on server errors so callers can report an outage", async () => {
    const src = new OpenLibrarySource(respond({ "search.json": new Response("", { status: 503 }) }));
    await expect(src.search("stoner", 5)).rejects.toThrow(/503/);
  });

  it("maps search hits and skips docs without titles", async () => {
    const src = new OpenLibrarySource(
      respond({ "search.json?q=": { docs: [{ key: "/works/OL1W", title: "Stoner", author_name: ["John Williams"], cover_i: 7, cover_edition_key: "OL9M" }, { key: "/works/OL3W" }] } }),
    );
    const hits = await src.search("stoner", 5);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.edition).toMatchObject({ openLibraryKey: "/books/OL9M", coverUrl: "https://covers.openlibrary.org/b/id/7-L.jpg", isbn13: null });
  });

  it("doesn't call out for a blank query", async () => {
    const src = new OpenLibrarySource((() => { throw new Error("called"); }) as never);
    expect(await src.search("  ", 5)).toEqual([]);
  });
});
