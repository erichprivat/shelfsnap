/** Drops inline markdown that catalogues leave in descriptions: **bold**, __bold__, *italic*, and "\" line breaks. */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/\\\n/g, "\n")
    .replace(/\\$/gm, "");
}
