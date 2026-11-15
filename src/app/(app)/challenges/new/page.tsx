import type { Metadata } from "next";
import Link from "next/link";
import { randomCard } from "@/domain/bingo-categories";
import { todayUtc } from "@/domain/dates";
import { PageHead } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { Builder } from "./builder";

export const metadata: Metadata = { title: "New challenge" };

export default async function NewChallengePage() {
  await requireUser();
  const today = todayUtc();
  const year = Number(today.slice(0, 4));
  // Late in the year, next year is the likelier pick.
  const years = Number(today.slice(5, 7)) >= 10 ? [year + 1, year] : [year, year + 1];
  return (
    <div className="flex flex-col gap-10">
      <Link href="/challenges" className="text-sm text-ink-3 hover:text-ink">
        ← Challenges
      </Link>
      <PageHead eyebrow="Goals & challenges" title="New challenge">
        Pick a kind, make it yours, then share the invite link with whoever you like.
      </PageHead>
      <Builder years={years} initialCard={randomCard("classic")} />
    </div>
  );
}
