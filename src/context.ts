/**
 * context.ts — Message text extraction helpers.
 */

/** Extract text from a message content block array. */
export function extractText(content: unknown[]): string {
  return content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text ?? "")
    .join("\n");
}
