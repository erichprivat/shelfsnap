import type { ChallengeCard, Progress } from "@/domain/challenges";
import { daysLeft, expectedByNow } from "@/domain/challenges";
import { plural } from "@/lib/labels";

export const KIND_LABEL = { books: "Reading goal", bingo: "Book bingo", shelf: "Read your shelf" } as const;

export function ProgressBar({ done, goal }: { done: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, (done / goal) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={goal}>
      <div className={`h-full rounded-full ${done >= goal ? "bg-moss" : "bg-accent"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** "3 of 24 books", or squares and lines for bingo. */
export function progressText(kind: ChallengeCard["kind"], p: Progress) {
  if (kind === "bingo") return `${p.done} of ${p.goal} squares${p.lines ? ` · ${plural(p.lines, "line")}` : ""}`;
  return `${p.done} of ${plural(p.goal, "book")}`;
}

/** Ahead or behind schedule, for a challenge that's running. */
export function paceText(c: Pick<ChallengeCard, "startsOn" | "endsOn" | "kind">, p: Progress, today: string) {
  if (today < c.startsOn) return "Starts " + new Date(`${c.startsOn}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  if (p.done >= p.goal) return c.kind === "bingo" ? "Full card. Blackout!" : "Goal reached";
  if (today > c.endsOn) return "Finished";
  const diff = Math.round(p.done - expectedByNow(c, p.goal, today));
  const unit = c.kind === "bingo" ? "square" : "book";
  const left = `${plural(daysLeft(c, today), "day")} left`;
  if (diff === 0) return `On track · ${left}`;
  return `${plural(Math.abs(diff), unit)} ${diff > 0 ? "ahead" : "behind"} · ${left}`;
}
