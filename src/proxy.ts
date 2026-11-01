import { NextResponse, type NextRequest } from "next/server";

const canonical = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL) : null;

/**
 * Sends visitors on the platform hostname (*.fly.dev) or www. to the canonical domain, so sign-in
 * cookies and auth origin checks always see one host. Health checks arrive on the machine's
 * internal address and are left alone.
 */
export function proxy(request: NextRequest) {
  if (!canonical || request.nextUrl.pathname === "/api/health") return NextResponse.next();
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  if (host === canonical.hostname) return NextResponse.next();
  if (host.endsWith(".fly.dev") || host === `www.${canonical.hostname}`) {
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, canonical);
    return NextResponse.redirect(target, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image).*)",
};
