import type { Metadata } from "next";
import { db } from "@/db";
import { locationTree } from "@/domain/locations";
import { PageHead } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { PlacesEditor } from "./places-editor";

export const metadata: Metadata = { title: "Rooms & shelves" };

export default async function PlacesPage() {
  const user = await requireUser();
  const tree = await locationTree(db, user.id);
  return (
    <div className="flex flex-col gap-10">
      <PageHead eyebrow="Library" title="Rooms & shelves">
        Mirror your home: rooms, bookcases, shelves — up to four levels. Removing a place never removes books; they move up a level.
      </PageHead>
      <PlacesEditor tree={tree} />
    </div>
  );
}
