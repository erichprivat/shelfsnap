import type { Metadata } from "next";
import { PageHead } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { FindBook } from "./find-book";

export const metadata: Metadata = { title: "Find a book" };

export default async function AddPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-10">
      <PageHead eyebrow="Add books" title="Find a book">
        Search by title or author, type the ISBN from the back cover, or scan its barcode.
      </PageHead>
      <FindBook />
    </div>
  );
}
