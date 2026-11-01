import { describe, expect, it } from "vitest";
import { cleanIsbnInput, parseIsbn } from "./isbn";

describe("parseIsbn", () => {
  it("converts a valid ISBN-10 to ISBN-13", () => {
    expect(parseIsbn("0306406152")).toBe("9780306406157");
  });
  it("accepts an ISBN-10 ending in X, upper or lower case", () => {
    expect(parseIsbn("080442957X")).toBe("9780804429573");
    expect(parseIsbn("080442957x")).toBe("9780804429573");
  });
  it("accepts hyphens, spaces and en dashes", () => {
    expect(parseIsbn("978-0-306-40615-7")).toBe("9780306406157");
    expect(parseIsbn("978 0 306 40615 7")).toBe("9780306406157");
    expect(parseIsbn("978–0–306–40615–7")).toBe("9780306406157");
  });
  it("accepts an ISBN: prefix", () => {
    expect(parseIsbn("ISBN-13: 978-0-306-40615-7")).toBe("9780306406157");
  });
  it("unwraps Goodreads spreadsheet quoting", () => {
    expect(parseIsbn('="9780306406157"')).toBe("9780306406157");
    expect(parseIsbn('=""')).toBeNull();
  });
  it("restores leading zeros dropped by spreadsheets", () => {
    expect(parseIsbn("306406152")).toBe("9780306406157");
  });
  it("accepts 979-prefixed ISBN-13s", () => {
    expect(parseIsbn("979-10-90636-07-1")).toBe("9791090636071");
  });
  it("rejects bad checksums", () => {
    expect(parseIsbn("0306406153")).toBeNull();
    expect(parseIsbn("9780306406158")).toBeNull();
  });
  it("rejects EAN barcodes that aren't books", () => {
    expect(parseIsbn("4006381333931")).toBeNull();
  });
  it("rejects garbage and empty input", () => {
    expect(parseIsbn("")).toBeNull();
    expect(parseIsbn(null)).toBeNull();
    expect(parseIsbn("not an isbn")).toBeNull();
    expect(parseIsbn("12345")).toBeNull();
    expect(parseIsbn("97803064061570")).toBeNull();
  });
});

it("cleanIsbnInput strips wrappers", () => {
  expect(cleanIsbnInput(' ="978-0306406157" ')).toBe("9780306406157");
});
