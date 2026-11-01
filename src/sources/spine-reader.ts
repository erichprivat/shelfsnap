import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import sharp from "sharp";
import { z } from "zod";
import type { BoundingBox } from "@/db/schema";

export type DetectedSpine = { text: string; title: string | null; author: string | null; box: BoundingBox | null };

export interface SpineReader {
  readonly name: string;
  read(image: Uint8Array): Promise<DetectedSpine[]>;
}

export class SpineReaderError extends Error {}

// High-resolution vision tier: larger images gain nothing and cost more tokens.
const MAX_EDGE = 2576;

const SpineSchema = z.object({
  spines: z.array(
    z.object({
      text: z.string().describe("Every word legible on the spine, in reading order"),
      title: z.string().nullable().describe("Best guess at the book title, or null if unreadable"),
      author: z.string().nullable().describe("Best guess at the author, or null"),
      // A fixed 0–1000 scale stays correct however the image is resized on the way to the model.
      x: z.number().describe("Left edge of the spine, 0–1000 across the image width"),
      y: z.number().describe("Top edge, 0–1000 down the image height"),
      width: z.number().describe("Width, 0–1000 of the image width"),
      height: z.number().describe("Height, 0–1000 of the image height"),
    }),
  ),
});

const PROMPT = `This is a photo of a bookshelf. List every book spine you can see, from left to right (top shelf first if there are several).
For each spine give the legible text, your best reading of title and author, and its bounding box on a 0–1000 scale of the image's width and height.
Include spines you can only partly read — use null for title/author when you genuinely can't tell. Skip objects that aren't books.`;

const isHeif = (b: Uint8Array) => {
  const brand = new TextDecoder().decode(b.subarray(4, 12));
  return brand.startsWith("ftyp") && /hei[cfmsx]|mif1|msf1|hevc/.test(brand.slice(4));
};

/**
 * sharp's prebuilt binaries can't decode HEVC (patent-encumbered), which is what iPhones save.
 * Decode those with libheif compiled to WebAssembly and hand sharp raw pixels instead.
 */
async function openImage(input: Uint8Array) {
  if (!isHeif(input)) return sharp(input);
  const { default: decode } = await import("heic-decode");
  const { width, height, data } = await decode({ buffer: input });
  return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
}

/** Upright, downscaled JPEG so EXIF rotation and huge phone photos never reach the model. */
export async function prepareImage(input: Uint8Array) {
  const { data, info } = await (await openImage(input))
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export class ClaudeSpineReader implements SpineReader {
  readonly name = "claude";
  constructor(private readonly client = new Anthropic()) {}

  async read(image: Uint8Array): Promise<DetectedSpine[]> {
    const prepared = await prepareImage(image);
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(SpineSchema) },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: prepared.data.toString("base64") } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new SpineReaderError("We're reading a lot of shelves right now. Try again in a minute.");
      if (e instanceof Anthropic.APIError) throw new SpineReaderError("The spine reader is unavailable right now. Try again shortly.");
      throw e;
    }
    if (response.stop_reason === "refusal") throw new SpineReaderError("This photo couldn't be read. Try another shot of the shelf.");
    if (response.stop_reason === "max_tokens") throw new SpineReaderError("That shelf has too many books for one photo. Try a closer shot.");
    const parsed = response.parsed_output;
    if (!parsed) throw new SpineReaderError("The spine reader returned something unexpected. Try again.");

    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    return parsed.spines.map((s) => ({
      text: s.text.trim(),
      title: s.title?.trim() || null,
      author: s.author?.trim() || null,
      box:
        s.width > 0 && s.height > 0
          ? {
              x: clamp(s.x / 1000),
              y: clamp(s.y / 1000),
              w: clamp(s.width / 1000),
              h: clamp(s.height / 1000),
            }
          : null,
    }));
  }
}

/** Used when no API key is configured: returns a fixed, clearly fake shelf so the flow can be exercised end to end. */
export class DemoSpineReader implements SpineReader {
  readonly name = "demo";
  async read(): Promise<DetectedSpine[]> {
    const books: [string, string | null, string | null][] = [
      ["THE LEFT HAND OF DARKNESS URSULA K. LE GUIN ACE", "The Left Hand of Darkness", "Ursula K. Le Guin"],
      ["Piranesi Susanna Clarke BLOOMSBURY", "Piranesi", "Susanna Clarke"],
      ["STONER JOHN WILLIAMS", "Stoner", "John Williams"],
      ["SULT KNUT HAMSUN", "Sult", "Knut Hamsun"],
      ["THE REMAINS OF THE", null, null],
      ["Middlemarch George Eliot Penguin Classics", "Middlemarch", "George Eliot"],
      ["~ ~ ~", null, null],
    ];
    const w = 1 / books.length;
    return books.map(([text, title, author], i) => ({ text, title, author, box: { x: i * w + w * 0.1, y: 0.08, w: w * 0.8, h: 0.84 } }));
  }
}

/** Development only: replays a recorded reading from a JSON file, so matching and review can be tested on a real photo offline. */
export class FixtureSpineReader implements SpineReader {
  readonly name = "fixture";
  constructor(private readonly path: string) {}
  async read(): Promise<DetectedSpine[]> {
    return JSON.parse(await readFile(this.path, "utf8")) as DetectedSpine[];
  }
}

export function defaultSpineReader(): SpineReader {
  const fixture = process.env.SPINE_READER_FIXTURE;
  if (fixture && process.env.NODE_ENV !== "production") return new FixtureSpineReader(fixture);
  return process.env.ANTHROPIC_API_KEY ? new ClaudeSpineReader() : new DemoSpineReader();
}
