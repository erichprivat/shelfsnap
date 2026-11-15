import { describe, expect, it } from "vitest";
import { parseIsbn } from "@/domain/isbn";
import { coverOf, GoogleBooksSource, plainDescription } from "./googlebooks";

const isbn = parseIsbn("9781590171998")!;

function fake(byQuery: Record<string, unknown[]>) {
  const urls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urls.push(url.toString());
    const q = url.searchParams.get("q") ?? "";
    const hit = Object.entries(byQuery).find(([k]) => q.startsWith(k));
    return Response.json(hit ? { items: hit[1] } : {});
  }) as typeof fetch;
  return { fetchImpl, urls };
}

const volume = (info: Record<string, unknown>) => ({ volumeInfo: info });

describe("GoogleBooksSource", () => {
  it("reads an ISBN hit", async () => {
    const { fetchImpl } = fake({
      "isbn:": [
        volume({
          title: "Lantern Harbour",
          authors: ["Bo Ferren"],
          publisher: "Quayside",
          publishedDate: "2019-04-02",
          description: "<p>A harbour town keeps its lanterns lit</p><p>for a ship that never comes.</p>",
          pageCount: 312,
          industryIdentifiers: [{ type: "ISBN_13", identifier: "9781590171998" }],
          imageLinks: { thumbnail: "http://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=5&edge=curl" },
        }),
      ],
    });
    expect(await new GoogleBooksSource(fetchImpl, null).lookup({ isbn, title: "Lantern Harbour" })).toEqual({
      description: "A harbour town keeps its lanterns lit\n\nfor a ship that never comes.",
      pageCount: 312,
      publisher: "Quayside",
      publishYear: 2019,
      coverUrl: "https://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1",
      isbn13: isbn,
    });
  });

  it("falls back to title and author, and ignores a different book", async () => {
    const { fetchImpl, urls } = fake({
      "intitle:": [
        volume({ title: "A Study Guide to Lantern Harbour", authors: ["Someone Else"], description: "Chapter summaries and essay questions for students." }),
        volume({ title: "Lantern Harbour", authors: ["Bo Ferren"], description: "A harbour town keeps its lanterns lit." }),
      ],
    });
    const found = await new GoogleBooksSource(fetchImpl, null).lookup({ isbn, title: "Lantern Harbour", author: "Bo Ferren" });
    expect(found?.description).toBe("A harbour town keeps its lanterns lit.");
    expect(urls[1]).toContain("inauthor");
  });

  it("returns nothing rather than a wrong match", async () => {
    const { fetchImpl } = fake({ "intitle:": [volume({ title: "Lantern Harbour", authors: ["Someone Else Entirely"] })] });
    expect(await new GoogleBooksSource(fetchImpl, null).lookup({ title: "Lantern Harbour", author: "Bo Ferren" })).toBeNull();
  });

  it("sends the API key only when there is one", async () => {
    const { fetchImpl, urls } = fake({});
    await new GoogleBooksSource(fetchImpl, "k123").lookup({ title: "Lantern Harbour" });
    await new GoogleBooksSource(fetchImpl, null).lookup({ title: "Lantern Harbour" });
    expect(urls[0]).toContain("key=k123");
    expect(urls[1]).not.toContain("key=");
  });
});

describe("helpers", () => {
  it("turns light HTML into plain text", () => {
    expect(plainDescription("Moths &amp; lanterns<br>on a <b>drowned</b> coast, &quot;quietly&quot;.")).toBe('Moths & lanterns\non a drowned coast, "quietly".');
    expect(plainDescription("<p>Short</p>")).toBeNull();
  });
  it("only hands out https covers", () => {
    expect(coverOf({ smallThumbnail: "http://books.google.com/x?id=1&zoom=5" })).toBe("https://books.google.com/x?id=1&zoom=1");
    expect(coverOf({ thumbnail: "javascript:alert(1)" })).toBeNull();
    expect(coverOf(undefined)).toBeNull();
  });
});
