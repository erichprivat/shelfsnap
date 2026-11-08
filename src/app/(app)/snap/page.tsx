import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { snapSessions } from "@/db/schema";
import { shelvesFor } from "@/domain/library";
import { LinkButton, PageHead } from "@/components/ui";
import { formatDate, plural } from "@/lib/labels";
import { placeOrder, placePaths } from "@/lib/places";
import { dailyBudgetFromEnv, snapAllowance, snapLimitFromEnv, spentToday } from "@/domain/usage";
import { isAdmin, requireUser } from "@/server/auth";
import { snapsAreMetered, spineReader } from "@/server/services";
import { SnapForm } from "./snap-form";

export const metadata: Metadata = { title: "Snap a shelf" };

export default async function SnapPage({ searchParams }: PageProps<"/snap">) {
  const user = await requireUser();
  const { place } = await searchParams;
  const [places, recent] = await Promise.all([
    shelvesFor(db, user.id),
    db.query.snapSessions.findMany({ where: eq(snapSessions.userId, user.id), orderBy: [desc(snapSessions.createdAt)], limit: 5, with: { spines: { columns: { id: true } } } }),
  ]);
  const allowance = snapsAreMetered && !isAdmin(user.email) ? await snapAllowance(db, user.id, snapLimitFromEnv()) : null;
  const outOfSnaps = allowance?.remaining === 0;
  const budget = dailyBudgetFromEnv();
  const paused = snapsAreMetered && budget !== null && (await spentToday(db)) >= budget;
  const paths = placePaths(places);
  const options = placeOrder(places).map((p) => ({ id: p.id, label: (paths.get(p.id) ?? []).join(" / ") }));
  return (
    <div className="flex flex-col gap-10">
      <PageHead eyebrow="Add books" title="Snap a shelf">
        One shelf per photo works best: straight on, well lit, spines filling the frame.
      </PageHead>
      {spineReader.name === "fixture" && (
        <p className="border-l-2 border-ochre bg-ochre-soft px-4 py-3 text-sm text-ink-2">
          Fixture mode: <code className="font-mono text-[13px]">SPINE_READER_FIXTURE</code> replays a recorded reading for every photo.
        </p>
      )}
      {spineReader.name === "demo" && (
        <p className="border-l-2 border-ochre bg-ochre-soft px-4 py-3 text-sm text-ink-2">
          Demo mode: no <code className="font-mono text-[13px]">ANTHROPIC_API_KEY</code> is set, so any photo returns the same sample shelf.
        </p>
      )}
      {outOfSnaps ? (
        <OutOfSnaps resetsAt={allowance!.resetsAt} limit={allowance!.limit!} />
      ) : paused ? (
        <Paused />
      ) : (
        <SnapForm places={options} defaultPlace={typeof place === "string" ? place : ""} />
      )}
      {allowance && allowance.remaining !== null && !outOfSnaps && !paused && (
        <p className="-mt-4 text-sm text-ink-3">
          <span className="num text-ink-2">{allowance.remaining}</span> of {plural(allowance.limit!, "free snap")} left this month · resets {formatReset(allowance.resetsAt)}
        </p>
      )}
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

const formatReset = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

function OutOfSnaps({ resetsAt, limit }: { resetsAt: Date; limit: number }) {
  return (
    <section className="flex flex-col items-start gap-4 border-l-2 border-ochre py-2 pl-6">
      <h2 className="font-serif text-2xl">You&apos;ve used this month&apos;s {plural(limit, "free snap")}</h2>
      <p className="max-w-lg text-[15px] text-ink-2">
        Snapping resets on {formatReset(resetsAt)}. Until then you can still add any book by searching or scanning its barcode — those are always free.
      </p>
      <LinkButton href="/add">Find or scan a book</LinkButton>
    </section>
  );
}

function Paused() {
  return (
    <section className="flex flex-col items-start gap-4 border-l-2 border-ochre py-2 pl-6">
      <h2 className="font-serif text-2xl">Shelf snaps are paused for today</h2>
      <p className="max-w-lg text-[15px] text-ink-2">
        Readmoth reads a limited number of shelves each day while it&apos;s in beta, and today&apos;s are used up. Snapping is back tomorrow. You can
        still add any book by searching or scanning its barcode.
      </p>
      <LinkButton href="/add">Find or scan a book</LinkButton>
    </section>
  );
}
