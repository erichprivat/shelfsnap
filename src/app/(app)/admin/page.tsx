import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { ACTIVATION_BOOKS, readerStats, recentFeedback } from "@/domain/stats";
import { PageHead } from "@/components/ui";
import { isAdmin, requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Readers" };

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");

export default async function AdminPage() {
  const user = await requireUser();
  if (!isAdmin(user.email)) notFound();
  const readers = await readerStats(db);
  const notes = await recentFeedback(db);
  const activated = readers.filter((r) => r.activated).length;
  const firstDay = readers.map((r) => r.booksFirstDay).sort((a, b) => a - b);
  const median = firstDay.length ? firstDay[Math.floor((firstDay.length - 1) / 2)] : 0;

  return (
    <div className="flex flex-col gap-10">
      <PageHead eyebrow="Admin" title="Readers" />
      <dl className="grid grid-cols-3 gap-px border border-rule bg-rule">
        {[
          ["Readers", readers.length],
          [`Activated (${ACTIVATION_BOOKS}+ books on day one)`, readers.length ? `${activated} · ${Math.round((activated / readers.length) * 100)}%` : "—"],
          ["Median books on day one", median],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 bg-paper p-4">
            <dd className="num font-serif text-3xl">{v}</dd>
            <dt className="label">{k}</dt>
          </div>
        ))}
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="label">
            <tr className="border-b border-rule">
              {["Reader", "Joined", "Last seen", "Day one", "Books", "Snaps", "Imported", "Feedback"].map((h) => (
                <th key={h} className="py-2 pr-4 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="num">
            {readers.map((r) => (
              <tr key={r.email} className="border-b border-rule">
                <td className="max-w-56 truncate py-2 pr-4 text-ink">{r.email}</td>
                <td className="py-2 pr-4 text-ink-2">{day(r.joinedAt)}</td>
                <td className="py-2 pr-4 text-ink-2">{day(r.lastSeenAt)}</td>
                <td className={`py-2 pr-4 ${r.activated ? "text-moss" : "text-ink-2"}`}>{r.booksFirstDay}</td>
                <td className="py-2 pr-4">{r.books}</td>
                <td className="py-2 pr-4">{r.snaps}</td>
                <td className="py-2 pr-4">{r.imported}</td>
                <td className="py-2 pr-4">{r.feedback}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-2xl">Latest feedback</h2>
        {notes.length === 0 && <p className="text-ink-2">Nothing yet.</p>}
        <ul className="flex flex-col">
          {notes.map((n, i) => (
            <li key={i} className="flex flex-col gap-1 border-t border-rule py-4">
              <span className="text-xs text-ink-3">
                {n.email} · {day(n.createdAt)}
                {n.page ? ` · ${n.page}` : ""}
              </span>
              <p className="whitespace-pre-line text-[15px]">{n.message}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
