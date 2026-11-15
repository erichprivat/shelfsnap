const DAY_MS = 24 * 3_600_000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { enrichLibraryBooks, sweepSnapPhotos } = await import("@/server/services");
  const { db } = await import("@/db");
  const { ensureFeaturedChallenges } = await import("@/domain/challenges");
  // This year's Readmoth challenges, and next year's from November.
  const ensureFeatured = () => ensureFeaturedChallenges(db);
  const sweep = async () => {
    await sweepSnapPhotos().catch((e) => console.error("Snap photo sweep failed", e));
    await ensureFeatured().catch((e) => console.error("Featured challenges failed", e));
    // Books added while a lookup failed, and the library from before details were fetched.
    await enrichLibraryBooks();
  };
  // The machine stops when idle, so the sweep on boot does most of the work; the timer covers long uptimes.
  void sweep();
  setInterval(sweep, DAY_MS).unref();
}
