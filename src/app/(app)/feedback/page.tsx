import type { Metadata } from "next";
import { PageHead } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = { title: "Feedback" };

export default async function FeedbackPage({ searchParams }: PageProps<"/feedback">) {
  await requireUser();
  const from = (await searchParams).from;
  const page = typeof from === "string" && from.startsWith("/") && !from.startsWith("/feedback") ? from : null;
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <PageHead eyebrow="Feedback" title="What should be better?">
        Readmoth is early, and what you notice now shapes what it becomes. Bugs, misread spines, confusing screens, missing features — all
        welcome. Replies come to your email.
      </PageHead>
      <FeedbackForm page={page} />
    </div>
  );
}
