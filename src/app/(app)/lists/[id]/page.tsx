import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { DomainError } from "@/domain/errors";
import { listWithItems } from "@/domain/lists";
import { requireUser } from "@/server/auth";
import { ListEditor } from "./list-editor";

export const metadata: Metadata = { title: "List" };

export default async function ListPage({ params }: PageProps<"/lists/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const list = await listWithItems(db, { userId: user.id, id }).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  return (
    <div className="flex flex-col gap-8">
      <Link href="/lists" className="text-sm text-ink-3 hover:text-ink">
        ← Lists
      </Link>
      <ListEditor
        list={{ id: list.id, name: list.name, description: list.description, shareSlug: list.shareSlug }}
        items={list.items.map((it) => ({
          workId: it.workId,
          title: it.work.title,
          authors: it.work.authors,
          year: it.work.firstPublishYear,
          coverUrl: it.work.editions.find((e) => e.coverUrl)?.coverUrl ?? null,
        }))}
      />
    </div>
  );
}
