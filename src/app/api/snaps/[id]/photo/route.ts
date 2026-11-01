import { db } from "@/db";
import { getOwnedSession } from "@/domain/snap";
import { getSession } from "@/server/auth";
import { readUpload } from "@/server/services";

export async function GET(_: Request, ctx: RouteContext<"/api/snaps/[id]/photo">) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    const snap = await getOwnedSession(db, session.user.id, (await ctx.params).id);
    const bytes = await readUpload(snap.imagePath);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
