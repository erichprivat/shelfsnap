import Anthropic from "@anthropic-ai/sdk";
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

// High-resolution vision tier: coordinates map 1:1 to pixels up to this edge length.
const MAX_EDGE = 2576;

const SpineSchema = z.object({
  spines: z.array(
    z.object({
      text: z.string().describe("Every word legible on the spine, in reading order"),
      title: z.string().nullable().describe("Best guess at the book title, or null if unreadable"),
      author: z.string().nullable().describe("Best guess at the author, or null"),
      x: z.number().describe("Left edge of the spine in pixels"),
      y: z.number().describe("Top edge in pixels"),
      width: z.number(),
      height: z.number(),
    }),
  ),
});

const PROMPT = `This is a photo of a bookshelf. List every book spine you can see, from left to right (top shelf first if there are several).
For each spine give the legible text, your best reading of title and author, and its bounding box in pixels of this image.
Include spines you can only partly read — use null for title/author when you genuinely can't tell. Skip objects that aren't books.`;

/** Upright, downscaled JPEG so EXIF rotation and huge phone photos never reach the model. */
export async function prepareImage(input: Uint8Array) {
  const { data, info } = await sharp(input)
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
              x: clamp(s.x / prepared.width),
              y: clamp(s.y / prepared.height),
              w: clamp(s.width / prepared.width),
              h: clamp(s.height / prepared.height),
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

export function defaultSpineReader(): SpineReader {
  return process.env.ANTHROPIC_API_KEY ? new ClaudeSpineReader() : new DemoSpineReader();
}
