import { describe, expect, it } from "vitest";
import { safeNext } from "./next-path";

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/join/abc123")).toBe("/join/abc123");
    expect(safeNext("/challenges?x=1")).toBe("/challenges?x=1");
  });
  it("refuses anything that could leave it", () => {
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "join", "", undefined, ["/a"], "/a\nb"]) {
      expect(safeNext(bad)).toBe("/library");
    }
  });
});
