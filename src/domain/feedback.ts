import { and, count, eq, gte } from "drizzle-orm";
import type { DbLike } from "@/db";
import { feedback } from "@/db/schema";
import { MAX_FEEDBACK_LENGTH } from "@/lib/feedback";
import { DomainError, invalid } from "./errors";

export { MAX_FEEDBACK_LENGTH };
export const FEEDBACK_PER_HOUR = 5;

export async function submitFeedback(
  db: DbLike,
  userId: string,
  input: { message: string; page?: string | null },
  now = new Date(),
) {
  const message = input.message.replace(/\r\n/g, "\n").trim();
  if (message.length < 2) throw invalid("Write a few words first");
  if (message.length > MAX_FEEDBACK_LENGTH) throw invalid(`Keep it under ${MAX_FEEDBACK_LENGTH} characters`);
  const page = input.page?.startsWith("/") ? input.page.slice(0, 200) : null;

  const [{ n }] = await db
    .select({ n: count() })
    .from(feedback)
    .where(and(eq(feedback.userId, userId), gte(feedback.createdAt, new Date(now.getTime() - 3_600_000))));
  if (n >= FEEDBACK_PER_HOUR) throw new DomainError("limit_reached", "That's a lot of feedback for one hour — thank you! Try again a little later.");

  const [row] = await db.insert(feedback).values({ userId, message, page, createdAt: now }).returning();
  return row;
}
