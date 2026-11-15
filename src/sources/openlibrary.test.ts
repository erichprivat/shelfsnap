import { describe, expect, it } from "vitest";
import { parseIsbn } from "@/domain/isbn";
import { cleanDescription, OpenLibrarySource } from "./openlibrary";

const respond = (routes: Record<string, unknown>) =>
  (async (input: string | URL | Request) => {
    const url = String(input);
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    if (!hit) return new Response("not found", { status: 404 });
    if (hit[1] instanceof Response) return hit[1];
    return Response.json(hit[1]);
  }) as typeof fetch;

const noWait = async () => {};

/** Answers each call with the next response in line. */
function sequence(...steps: (Response | Error)[]) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    calls.push(String(input));
    const step = steps[Math.min(calls.length - 1, steps.length - 1)]!;
    if (step instanceof Error) throw step;
    return step.clone();
  }) as typeof fetch;
  return { fetchImpl, calls };
}

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
    const src = new OpenLibrarySource(respond({ "search.json": new Response("", { status: 503 }) }), "test", { sleep: noWait });
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

  describe("retries", () => {
    const ok = Response.json({ docs: [{ key: "/works/OL1W", title: "Lantern Harbour" }] });

    it("retries server errors and timeouts, then succeeds", async () => {
      const { fetchImpl, calls } = sequence(new Response("", { status: 503 }), new DOMException("timed out", "TimeoutError"), ok);
      const src = new OpenLibrarySource(fetchImpl, "test", { sleep: noWait });
      expect(await src.search("lantern", 5)).toHaveLength(1);
      expect(calls).toHaveLength(3);
    });

    it("waits longer before each retry", async () => {
      const waits: number[] = [];
      const { fetchImpl } = sequence(new Response("", { status: 429 }), new Response("", { status: 502 }), ok);
      await new OpenLibrarySource(fetchImpl, "test", { sleep: async (ms) => void waits.push(ms) }).search("lantern", 5);
      expect(waits).toEqual([500, 1500]);
    });

    it("gives up after two retries", async () => {
      const { fetchImpl, calls } = sequence(new TypeError("fetch failed"));
      await expect(new OpenLibrarySource(fetchImpl, "test", { sleep: noWait }).search("lantern", 5)).rejects.toThrow(/fetch failed/);
      expect(calls).toHaveLength(3);
    });

    it("doesn't retry answers: a 404 is no result, a 400 fails at once", async () => {
      const notFound = sequence(new Response("", { status: 404 }));
      expect(await new OpenLibrarySource(notFound.fetchImpl, "test", { sleep: noWait }).search("lantern", 5)).toEqual([]);
      expect(notFound.calls).toHaveLength(1);
      const bad = sequence(new Response("", { status: 400 }));
      await expect(new OpenLibrarySource(bad.fetchImpl, "test", { sleep: noWait }).search("lantern", 5)).rejects.toThrow(/400/);
      expect(bad.calls).toHaveLength(1);
    });
  });

  describe("details", () => {
    it("reads a work's description in either shape, plus cover and subjects", async () => {
      const plain = new OpenLibrarySource(respond({ "/works/OL1W.json": { description: "A lighthouse keeper charts the moths of a drowned coast.", covers: [-1, 9], subjects: ["award:moth_prize=2020", "Sea", "nyt:fiction=2020-01-01"] } }));
      expect(await plain.workDetails("/works/OL1W")).toEqual({
        description: "A lighthouse keeper charts the moths of a drowned coast.",
        coverUrl: "https://covers.openlibrary.org/b/id/9-L.jpg",
        subjects: ["Sea"],
      });
      const typed = new OpenLibrarySource(respond({ "/works/OL2W.json": { description: { type: "/type/text", value: "A harbour town keeps its lanterns lit for a ship that never comes." } } }));
      expect((await typed.workDetails("OL2W"))!.description).toMatch(/^A harbour town/);
    });

    it("only fetches real Open Library keys", async () => {
      const src = new OpenLibrarySource((() => { throw new Error("called"); }) as never);
      expect(await src.workDetails("../../etc/passwd")).toBeNull();
      expect(await src.editionDetails("/books/nope")).toBeNull();
    });

    it("reads pages, publisher and binding from an edition", async () => {
      const src = new OpenLibrarySource(respond({ "/books/OL5M.json": { title: "Lantern Harbour", publishers: ["Quayside"], number_of_pages: 312, physical_format: "Hardcover", publish_date: "2019", isbn_13: ["9781590171998"], key: "/books/OL5M" } }));
      expect(await src.editionDetails("/books/OL5M")).toMatchObject({ publisher: "Quayside", pageCount: 312, binding: "hardcover", publishYear: 2019, isbn13: "9781590171998" });
    });
  });
});

describe("cleanDescription", () => {
  it("drops source links, reference lists and what follows a rule", () => {
    const raw = "A lighthouse keeper charts the [moths](https://example.org/moths) of a drowned coast. ([source][1])\n\n[1]: https://example.org/review\n\n----------\nAlso contained in:\n - [Collected Tides](/works/OL9W)";
    expect(cleanDescription(raw)).toBe("A lighthouse keeper charts the moths of a drowned coast.");
  });
  it("treats stubs as no description", () => {
    expect(cleanDescription("Novel.")).toBeNull();
    expect(cleanDescription(undefined)).toBeNull();
  });
});
