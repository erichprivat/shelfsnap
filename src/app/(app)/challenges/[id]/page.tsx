import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { bingoBoard, membersWithProgress, visibleChallenge } from "@/domain/challenges";
import { todayUtc } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { requireUser } from "@/server/auth";
import { JoinFeatured } from "../join-button";
import { KIND_LABEL, paceText, ProgressBar, progressText } from "../parts";
import { BingoCard } from "./bingo-card";
import { InviteLink, LeaveOrDelete } from "./controls";

export const metadata: Metadata = { title: "Challenge" };

const dateRange = (from: string, to: string) => {
  const f = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${f(from)} – ${f(to)}`;
};

export default async function ChallengePage({ params }: PageProps<"/challenges/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { challenge: c, member } = await visibleChallenge(db, user.id, id).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const today = todayUtc();
  const [members, board] = await Promise.all([
    membersWithProgress(db, c),
    member && c.kind === "bingo" ? bingoBoard(db, user.id, c) : Promise.resolve(null),
  ]);
  const me = members.find((m) => m.userId === user.id);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  return (
    <div className="flex flex-col gap-10">
      <Link href="/challenges" className="text-sm text-ink-3 hover:text-ink">
        ← Challenges
      </Link>

      <header className="flex flex-col gap-5 border-b border-rule pb-6">
        <div className="flex flex-col gap-2">
          <span className="label">
            {KIND_LABEL[c.kind]} · {dateRange(c.startsOn, c.endsOn)}
          </span>
          <h1 className="font-serif text-[2.2rem] leading-[1.05] text-balance sm:text-[2.8rem]">{c.title}</h1>
        </div>
        {me ? (
          <div className="flex max-w-xl flex-col gap-2">
            <ProgressBar done={me.progress.done} goal={me.progress.goal} />
            <div className="flex flex-wrap justify-between gap-2 text-[15px]">
              <span className="num">{progressText(c.kind, me.progress)}</span>
              <span className="text-ink-3">{paceText(c, me.progress, today)}</span>
            </div>
            {c.kind === "shelf" && <p className="text-sm text-ink-3">Counts books you owned before {new Date(`${c.startsOn}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} and finish during the challenge.</p>}
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <JoinFeatured id={c.id} size="md" />
            <span className="text-sm text-ink-3">Your reads in {c.startsOn.slice(0, 4)} count from the start, even ones before you join.</span>
          </div>
        )}
      </header>

      {board && <BingoCard challengeId={c.id} board={board} />}
      {!member && c.kind === "bingo" && c.card && <BingoCard challengeId={c.id} board={{ card: c.card, placed: [], lines: [], candidates: [] }} readOnly />}

      <section className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <h2 className="flex items-baseline justify-between border-b border-rule pb-2">
            <span className="font-serif text-2xl">Readers</span>
            <span className="label num">{members.length}</span>
          </h2>
          <ol className="flex flex-col">
            {members.map((m, i) => (
              <li key={m.userId} className="flex items-center gap-4 border-b border-rule py-3">
                <span className="num w-5 text-sm text-ink-3">{i + 1}</span>
                <span className={`w-24 shrink-0 truncate ${m.userId === user.id ? "font-medium" : ""}`}>{m.userId === user.id ? "You" : m.name}</span>
                <div className="flex-1">
                  <ProgressBar done={m.progress.done} goal={m.progress.goal} />
                </div>
                <span className="num w-28 shrink-0 text-right text-sm text-ink-2">{progressText(c.kind, m.progress)}</span>
              </li>
            ))}
            {members.length === 0 && <li className="py-3 text-sm text-ink-3">Nobody yet.</li>}
          </ol>
        </div>
        {member && (
          <aside className="flex flex-col gap-6">
            {!c.featuredSlug && <InviteLink url={`${origin}/join/${c.joinCode}`} />}
            <LeaveOrDelete id={c.id} owner={c.ownerId === user.id} />
          </aside>
        )}
      </section>
    </div>
  );
}
