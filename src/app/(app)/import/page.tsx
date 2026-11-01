import type { Metadata } from "next";
import { PageHead } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-10">
      <PageHead eyebrow="Add books" title="Bring your reading history">
        Upload the CSV export from Goodreads or The StoryGraph. Ratings, read dates, reviews and owned books come with it. Re-importing later only adds what&apos;s new.
      </PageHead>
      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <ImportForm />
        <aside className="flex flex-col gap-6 text-sm text-ink-2">
          <div className="flex flex-col gap-2">
            <h2 className="font-serif text-lg text-ink">From Goodreads</h2>
            <p>My Books → Import and export → Export library. Goodreads emails you when the file is ready.</p>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="font-serif text-lg text-ink">From The StoryGraph</h2>
            <p>Manage account → Manage your data → Export StoryGraph library.</p>
          </div>
          <div className="flex flex-col gap-2 border-t border-rule pt-5">
            <h2 className="label">What happens to what</h2>
            <ul className="flex flex-col gap-1.5">
              <li>Books on an “owned” shelf become copies in your library, waiting to be shelved.</li>
              <li>Read, currently reading, to-read, did-not-finish and paused shelves become reading status.</li>
              <li>Anything you&apos;ve already set in Shelfsnap is never overwritten.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
