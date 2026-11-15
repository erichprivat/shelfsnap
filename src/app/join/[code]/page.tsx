import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Bookplate } from "@/components/bookplate";
import { db } from "@/db";
import { challengeByCode, membersWithProgress } from "@/domain/challenges";
import { DomainError } from "@/domain/errors";
import { getSession } from "@/server/auth";
import { KIND_LABEL } from "@/app/(app)/challenges/parts";
import { JoinButton } from "./join-button";

export const metadata: Metadata = { title: "Join a challenge" };

export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const session = await getSession();
  // Sign in first, then come straight back here.
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/join/${code}`)}`);
  const c = await challengeByCode(db, code).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const members = await membersWithProgress(db, c);
  if (members.some((m) => m.userId === session.user.id)) redirect(`/challenges/${c.id}`);
  const names = members.map((m) => m.name);

  return (
    <Bookplate>
      <p className="text-center font-serif text-sm italic text-ink-3">You&apos;re invited</p>
      <p className="label mt-4 text-center">{KIND_LABEL[c.kind]}</p>
      <h1 className="mt-1 text-center font-serif text-3xl leading-tight text-balance">{c.title}</h1>
      <p className="mt-3 text-center text-sm text-ink-2">
        {names.length === 0 ? "Nobody's in yet." : `${names.slice(0, 4).join(", ")}${names.length > 4 ? ` and ${names.length - 4} more` : ""} ${names.length === 1 ? "is" : "are"} in.`} Books you finish from{" "}
        {new Date(`${c.startsOn}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} count.
      </p>
      <div className="mt-8 flex flex-col items-stretch gap-3">
        <JoinButton code={code} />
        <Link href="/challenges" className="text-center text-sm text-ink-3 hover:text-ink">
          Not now
        </Link>
      </div>
    </Bookplate>
  );
}
