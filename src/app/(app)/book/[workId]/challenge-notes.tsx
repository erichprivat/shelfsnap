"use client";

import Link from "next/link";
import { placeBookAction } from "@/app/actions/challenges";
import { ErrorText } from "@/components/ui";
import type { BookChallengeNote } from "@/domain/challenges";
import { useAction } from "@/lib/use-action";

/** Which of your challenges this read counts toward, and bingo squares it could fill. */
export function ChallengeNotes({ workId, notes }: { workId: string; notes: BookChallengeNote[] }) {
  const { pending, error, go } = useAction();
  return (
    <div className="flex flex-col gap-4">
      <h2 className="border-b border-rule pb-2 font-serif text-2xl">Challenges</h2>
      <ul className="flex flex-col gap-3 text-[15px]">
        {notes.map((n) => (
          <li key={n.challengeId} className="flex flex-col gap-1.5">
            <Link href={`/challenges/${n.challengeId}`} className="font-medium hover:underline">
              {n.title}
            </Link>
            {n.kind === "counts" && <span className="text-sm text-moss">✓ This read counts</span>}
            {n.kind === "bingo" && n.placedOn && <span className="text-sm text-moss">✓ On your card: {n.placedOn}</span>}
            {n.kind === "bingo" && !n.placedOn && n.squares.length === 0 && (
              <span className="text-sm text-ink-3">
                Doesn&apos;t fit a square by its details.{" "}
                <Link href={`/challenges/${n.challengeId}`} className="underline underline-offset-4 hover:text-ink">
                  Place it yourself
                </Link>
              </span>
            )}
            {n.kind === "bingo" && !n.placedOn && n.squares.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm text-ink-3">Fits:</span>
                {n.squares.map((s) => (
                  <button
                    key={s.square}
                    type="button"
                    disabled={pending}
                    onClick={() => go(() => placeBookAction(n.challengeId, s.square, workId))}
                    className="rounded-full border border-rule-strong px-2.5 py-0.5 text-xs text-ink-2 hover:border-ink hover:text-ink disabled:opacity-60"
                    title="Put it on this square"
                  >
                    {s.label} +
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
