/**
 * Where to send someone after signing in. Only paths on this site count: anything that could
 * leave it ("//evil.example", "https://…", "/\\evil") falls back to the library.
 */
export function safeNext(raw: unknown, fallback = "/library"): string {
  if (typeof raw !== "string" || raw.length > 300) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || /[\r\n]/.test(raw)) return fallback;
  return raw;
}
