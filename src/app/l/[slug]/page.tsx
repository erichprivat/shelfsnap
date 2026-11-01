import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { DomainError } from "@/domain/errors";
import { listWithItems } from "@/domain/lists";
import { Cover } from "@/components/cover";
import { Wordmark } from "@/components/logo";
import { plural } from "@/lib/labels";

const load = cache(async (slug: string) =>
  listWithItems(db, { slug }).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  }),
);

export async function generateMetadata({ params }: PageProps<"/l/[slug]">): Promise<Metadata> {
  const list = await load((await params).slug);
  return { title: list.name, description: list.description ?? `${list.items.length} books`, robots: { index: false } };
}

export default async function PublicList({ params }: PageProps<"/l/[slug]">) {
  const list = await load((await params).slug);
  return (
    <div className="grain min-h-dvh">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-6 sm:px-8">
        <Link href="/"><Wordmark /></Link>
        <Link href="/sign-in" className="text-sm text-ink-2 hover:text-ink">Make your own</Link>
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 pt-6 pb-20 sm:px-8">
        <header className="flex flex-col gap-2 border-b border-rule pb-6">
          <span className="label">A list · {plural(list.items.length, "book")}</span>
          <h1 className="font-serif text-[2.6rem] leading-tight">{list.name}</h1>
          {list.description && <p className="max-w-xl text-[15px] text-ink-2">{list.description}</p>}
        </header>
        <ol className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
          {list.items.map((it, i) => (
            <li key={it.workId} className="flex flex-col gap-3">
              <Cover seed={it.workId} title={it.work.title} authors={it.work.authors} url={it.work.editions.find((e) => e.coverUrl)?.coverUrl ?? null} />
              <div className="flex gap-2">
                <span className="num pt-1 font-mono text-[11px] text-ink-3">{i + 1}</span>
                <div className="flex flex-col">
                  <span className="font-serif text-[16px] leading-snug">{it.work.title}</span>
                  <span className="text-xs text-ink-3">{it.work.authors[0]}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
