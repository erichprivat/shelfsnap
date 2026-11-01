import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { copies, editions, listItems, lists, works } from "@/db/schema";
import { isOverdue } from "@/domain/copies";
import { shelvesFor } from "@/domain/library";
import { getStatus, readThroughsFor } from "@/domain/reading";
import { Cover } from "@/components/cover";
import { FORMAT_LABEL } from "@/lib/labels";
import { placeOrder, placePaths } from "@/lib/places";
import { requireUser } from "@/server/auth";
import { AddCopy, CopyCard, ListPicker, ReadHistory, StatusControl } from "./controls";

const getWork = cache(async (id: string) => db.query.works.findFirst({ where: eq(works.id, id), with: { editions: true } }));

export async function generateMetadata({ params }: PageProps<"/book/[workId]">): Promise<Metadata> {
  const work = await getWork((await params).workId);
  return { title: work?.title ?? "Book" };
}

export default async function BookPage({ params }: PageProps<"/book/[workId]">) {
  const user = await requireUser();
  const { workId } = await params;
  const work = await getWork(workId);
  if (!work) notFound();

  const [myCopies, status, reads, places, myLists, memberships] = await Promise.all([
    db
      .select({ copy: copies, edition: editions })
      .from(copies)
      .innerJoin(editions, eq(copies.editionId, editions.id))
      .where(and(eq(copies.userId, user.id), eq(editions.workId, workId))),
    getStatus(db, user.id, workId),
    readThroughsFor(db, user.id, workId),
    shelvesFor(db, user.id),
    db.query.lists.findMany({ where: eq(lists.userId, user.id), columns: { id: true, name: true } }),
    db.select({ listId: listItems.listId }).from(listItems).innerJoin(lists, eq(listItems.listId, lists.id)).where(and(eq(listItems.workId, workId), eq(lists.userId, user.id))),
  ]);

  const paths = placePaths(places);
  const placeOptions = placeOrder(places).map((p) => ({ id: p.id, label: (paths.get(p.id) ?? []).join(" / ") }));
  const lead = myCopies[0]?.edition ?? work.editions.find((e) => e.coverUrl) ?? work.editions[0];
  const meta = [
    work.firstPublishYear && ["First published", String(work.firstPublishYear)],
    lead?.publisher && ["Publisher", lead.publisher],
    lead?.pageCount && ["Pages", String(lead.pageCount)],
    lead?.isbn13 && ["ISBN", lead.isbn13],
  ].filter(Boolean) as [string, string][];

  return (
    <article className="flex flex-col gap-12">
      <Link href="/library" className="text-sm text-ink-3 hover:text-ink">
        ← Library
      </Link>

      <header className="grid gap-8 sm:grid-cols-[12rem_1fr] sm:gap-10 lg:grid-cols-[15rem_1fr]">
        <Cover seed={work.id} title={work.title} authors={work.authors} url={lead?.coverUrl ?? null} size="lg" className="w-40 sm:w-full" />
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-[2.4rem] leading-[1.02] tracking-[-0.01em] text-balance sm:text-[3.2rem]">{work.title}</h1>
            {work.subtitle && <p className="font-serif text-xl text-ink-2 italic">{work.subtitle}</p>}
            <p className="text-lg text-ink-2">{work.authors.join(", ") || "Unknown author"}</p>
          </div>
          <StatusControl workId={work.id} status={status} hasReads={reads.length > 0} />
          {meta.length > 0 && (
            <dl className="flex flex-wrap gap-x-10 gap-y-4 border-t border-rule pt-5">
              {meta.map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5">
                  <dt className="label whitespace-nowrap">{k}</dt>
                  <dd className={k === "ISBN" ? "font-mono text-[13px]" : "text-[15px]"}>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {work.subjects.length > 0 && (
            <p className="text-sm text-ink-3">{work.subjects.slice(0, 6).join(" · ")}</p>
          )}
        </div>
      </header>

      <section className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          <h2 className="flex items-baseline justify-between border-b border-rule pb-2">
            <span className="font-serif text-2xl">Your copies</span>
            <span className="label">{myCopies.length || "None"}</span>
          </h2>
          {myCopies.length === 0 && <p className="text-[15px] text-ink-2">You don&apos;t own this book yet.</p>}
          <ul className="flex flex-col gap-3">
            {myCopies.map(({ copy, edition }) => (
              <CopyCard
                key={copy.id}
                workId={work.id}
                copy={{
                  id: copy.id,
                  format: copy.format,
                  formatLabel: FORMAT_LABEL[copy.format],
                  locationId: copy.locationId,
                  place: copy.locationId ? (paths.get(copy.locationId) ?? []).join(" / ") : null,
                  lentTo: copy.lentTo,
                  lentAt: copy.lentAt,
                  dueBackAt: copy.dueBackAt,
                  overdue: isOverdue(copy),
                  edition: [edition.publisher, edition.publishYear, edition.binding !== "unknown" ? edition.binding : null].filter(Boolean).join(" · "),
                }}
                places={placeOptions}
              />
            ))}
          </ul>
          <AddCopy
            workId={work.id}
            editions={work.editions.map((e) => ({ id: e.id, label: [e.publisher, e.publishYear, e.binding !== "unknown" ? e.binding : null, e.isbn13].filter(Boolean).join(" · ") || "Edition" }))}
            places={placeOptions}
            first={myCopies.length === 0}
          />
        </div>

        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-4">
            <h2 className="border-b border-rule pb-2 font-serif text-2xl">Reading history</h2>
            <ReadHistory workId={work.id} reads={reads.map((r) => ({ id: r.id, outcome: r.outcome, startedAt: r.startedAt, finishedAt: r.finishedAt, rating: r.rating, review: r.review }))} />
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="border-b border-rule pb-2 font-serif text-2xl">Lists</h2>
            <ListPicker workId={work.id} lists={myLists} member={memberships.map((m) => m.listId)} />
          </div>
        </div>
      </section>
    </article>
  );
}
