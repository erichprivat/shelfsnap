import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { todayUtc } from "@/domain/dates";
import { challengesFor, featuredFor, type ChallengeCard } from "@/domain/challenges";
import { LinkButton, PageHead } from "@/components/ui";
import { plural } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { JoinFeatured } from "./join-button";
import { KIND_LABEL, paceText, ProgressBar, progressText } from "./parts";

export const metadata: Metadata = { title: "Challenges" };

export default async function ChallengesPage() {
  const user = await requireUser();
  const today = todayUtc();
  const [mine, featured] = await Promise.all([challengesFor(db, user.id), featuredFor(db, user.id, today)]);
  const running = mine.filter((c) => c.endsOn >= today);
  const past = mine.filter((c) => c.endsOn < today);
  const toJoin = featured.filter((c) => !c.joined);

  return (
    <div className="flex flex-col gap-12">
      <PageHead
        eyebrow="Goals & challenges"
        title="Challenges"
        actions={
          <LinkButton href="/challenges/new" variant="accent" size="sm">
            New challenge
          </LinkButton>
        }
      >
        Set a reading goal, play book bingo, or finally read the books already on your shelves. Invite friends with a link.
      </PageHead>

      <section className="flex flex-col gap-4">
        <h2 className="border-b border-rule pb-2 font-serif text-2xl">Yours</h2>
        {running.length === 0 ? (
          <p className="text-[15px] text-ink-2">
            Nothing running yet. Join one below, or{" "}
            <Link href="/challenges/new" className="underline underline-offset-4">
              start your own
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {running.map((c) => (
              <ChallengeTile key={c.id} c={c} today={today} />
            ))}
          </ul>
        )}
      </section>

      {toJoin.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="border-b border-rule pb-2 font-serif text-2xl">Join in</h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {toJoin.map((c) => (
              <li key={c.id} className="flex flex-col justify-between gap-4 border border-rule bg-paper-raised p-5">
                <div className="flex flex-col gap-1">
                  <span className="label">{KIND_LABEL[c.kind]}</span>
                  <Link href={`/challenges/${c.id}`} className="font-serif text-xl leading-tight hover:underline">
                    {c.title}
                  </Link>
                  <span className="text-sm text-ink-3">{c.members ? `${plural(c.members, "reader")} in` : "Be the first in"}</span>
                </div>
                <JoinFeatured id={c.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="border-b border-rule pb-2 font-serif text-2xl text-ink-2">Finished</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {past.map((c) => (
              <ChallengeTile key={c.id} c={c} today={today} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ChallengeTile({ c, today }: { c: ChallengeCard; today: string }) {
  return (
    <li>
      <Link href={`/challenges/${c.id}`} className="group flex h-full flex-col gap-4 border border-rule bg-paper-raised p-5 transition-colors hover:border-rule-strong">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="label">{KIND_LABEL[c.kind]}</span>
            <span className="font-serif text-xl leading-tight group-hover:underline">{c.title}</span>
          </div>
          {c.members > 1 && <span className="shrink-0 text-xs text-ink-3">{plural(c.members, "reader")}</span>}
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <ProgressBar done={c.progress.done} goal={c.progress.goal} />
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="num text-ink">{progressText(c.kind, c.progress)}</span>
            <span className="text-ink-3">{paceText(c, c.progress, today)}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
