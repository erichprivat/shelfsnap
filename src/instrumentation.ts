const DAY_MS = 24 * 3_600_000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { sweepSnapPhotos } = await import("@/server/services");
  const sweep = () => sweepSnapPhotos().catch((e) => console.error("Snap photo sweep failed", e));
  // The machine stops when idle, so the sweep on boot does most of the work; the timer covers long uptimes.
  void sweep();
  setInterval(sweep, DAY_MS).unref();
}
