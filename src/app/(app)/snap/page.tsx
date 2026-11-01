import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { snapSessions } from "@/db/schema";
import { shelvesFor } from "@/domain/library";
import { PageHead } from "@/components/ui";
import { formatDate } from "@/lib/labels";
import { placeOrder, placePaths } from "@/lib/places";
import { requireUser } from "@/server/auth";
import { spineReader } from "@/server/services";
import { SnapForm } from "./snap-form";

export const metadata: Metadata = { title: "Snap a shelf" };

export default async function SnapPage({ searchParams }: PageProps<"/snap">) {
  const user = await requireUser();
  const { place } = await searchParams;
  const [places, recent] = await Promise.all([
    shelvesFor(db, user.id),
    db.query.snapSessions.findMany({ where: eq(snapSessions.userId, user.id), orderBy: [desc(snapSessions.createdAt)], limit: 5, with: { spines: { columns: { id: true } } } }),
  ]);
  const paths = placePaths(places);
  const options = placeOrder(places).map((p) => ({ id: p.id, label: (paths.get(p.id) ?? []).join(" / ") }));
  return (
    <div className="flex flex-col gap-10">
      <PageHead eyebrow="Add books" title="Snap a shelf">
        One shelf per photo works best: straight on, well lit, spines filling the frame.
      </PageHead>
      {spineReader.name === "demo" && (
        <p className="border-l-2 border-ochre bg-ochre-soft px-4 py-3 text-sm text-ink-2">
          Demo mode: no <code className="font-mono text-[13px]">ANTHROPIC_API_KEY</code> is set, so any photo returns the same sample shelf.
        </p>
      )}
      <SnapForm places={options} defaultPlace={typeof place === "string" ? place : ""} />
      {recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="label">Recent snaps</h2>
          <ul className="flex flex-col border-t border-rule">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/snap/${s.id}`} className="flex items-center justify-between gap-4 border-b border-rule py-3 text-[15px] hover:bg-ink/[0.025]">
                  <span>
                    {s.locationId ? (paths.get(s.locationId) ?? []).join(" / ") : "No shelf chosen"}
                    <span className="ml-2 text-sm text-ink-3">{formatDate(s.createdAt.toISOString().slice(0, 10))}</span>
                  </span>
                  <span className="text-sm text-ink-3">
                    {snapSummary(s.status, s.spines.length)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function snapSummary(status: string, spines: number) {
  if (status === "failed") return "Couldn't read";
  return `${spines} spines · ${status === "committed" ? "added" : "to review"}`;
}
