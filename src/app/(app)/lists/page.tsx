import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { listsFor } from "@/domain/lists";
import { Cover } from "@/components/cover";
import { PageHead } from "@/components/ui";
import { plural } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { NewList } from "./new-list";

export const metadata: Metadata = { title: "Lists" };

export default async function ListsPage() {
  const user = await requireUser();
  const lists = await listsFor(db, user.id);
  return (
    <div className="flex flex-col gap-10">
      <PageHead eyebrow="Lists" title="Lists" actions={<NewList />}>
        Reading plans, gift ideas, the books you&apos;d save in a fire. Lists can hold books you don&apos;t own yet.
      </PageHead>
      {lists.length === 0 ? (
        <p className="py-10 text-ink-2">No lists yet. Start one above, or from any book&apos;s page.</p>
      ) : (
        <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((l) => (
            <li key={l.id}>
              <Link href={`/lists/${l.id}`} className="group flex flex-col gap-4">
                <div className="flex h-36 items-end gap-0 border-b-[6px] border-shelf px-2">
                  {l.items.slice(0, 5).map((it, i) => (
                    <div key={it.workId} className="w-20 shrink-0 transition-transform duration-200 group-hover:-translate-y-1" style={{ marginLeft: i ? -28 : 0, zIndex: 5 - i, transform: `rotate(${(i - 2) * 1.5}deg)` }}>
                      <Cover seed={it.workId} title={it.work.title} authors={it.work.authors} url={it.work.editions.find((e) => e.coverUrl)?.coverUrl ?? null} size="sm" />
                    </div>
                  ))}
                  {l.items.length === 0 && <span className="pb-3 text-sm text-ink-3">Empty</span>}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="font-serif text-xl group-hover:underline">{l.name}</span>
                  <span className="text-sm text-ink-3">
                    {plural(l.items.length, "book")}
                    {l.shareSlug && " · shared"}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
