import { beforeEach, describe, expect, it } from "vitest";
import { makeUser, testDb, type TestDb } from "@/test/db";
import { FEEDBACK_PER_HOUR, MAX_FEEDBACK_LENGTH, submitFeedback } from "./feedback";

let db: TestDb;
let me: string;
beforeEach(async () => {
  db = await testDb();
  me = await makeUser(db);
});

describe("submitFeedback", () => {
  it("stores trimmed text and the page it came from", async () => {
    const row = await submitFeedback(db, me, { message: "  The snap missed\r\nmy Penguin spines  ", page: "/snap/abc" });
    expect(row).toMatchObject({ userId: me, message: "The snap missed\nmy Penguin spines", page: "/snap/abc" });
  });

  it("rejects empty and overlong messages", async () => {
    await expect(submitFeedback(db, me, { message: "  " })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(submitFeedback(db, me, { message: "x".repeat(MAX_FEEDBACK_LENGTH + 1) })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("only keeps app paths as the page", async () => {
    expect((await submitFeedback(db, me, { message: "Hi", page: "https://evil.example" })).page).toBeNull();
  });

  it("allows a handful per hour, then again after an hour", async () => {
    const t = new Date("2026-11-02T10:00:00Z");
    for (let i = 0; i < FEEDBACK_PER_HOUR; i++) await submitFeedback(db, me, { message: `Note ${i}` }, t);
    await expect(submitFeedback(db, me, { message: "One more" }, t)).rejects.toMatchObject({ code: "limit_reached" });
    const other = await makeUser(db, "Other");
    await expect(submitFeedback(db, other, { message: "Mine" }, t)).resolves.toBeDefined();
    await expect(submitFeedback(db, me, { message: "Later" }, new Date(t.getTime() + 3_600_001))).resolves.toBeDefined();
  });
});
