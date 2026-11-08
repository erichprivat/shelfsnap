import { db } from "@/db";
import { exportLibraryCsv } from "@/domain/account";
import { getSession } from "@/server/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Sign in to export your library", { status: 401 });
  const csv = await exportLibraryCsv(db, session.user.id);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="readmoth-library-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
