/**
 * context.test.ts — Message text extraction helpers.
 */

import { describe, expect, it } from "vitest";
import { extractText } from "../src/context.js";

describe("extractText", () => {
  it("joins multiple text blocks with newlines", () => {
    expect(extractText([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("a\nb");
  });

  it("filters out non-text blocks (tool_use, etc.)", () => {
    expect(
      extractText([
        { type: "text", text: "keep" },
        { type: "tool_use", name: "x", input: {} },
        { type: "text", text: "also keep" },
      ]),
    ).toBe("keep\nalso keep");
  });

  it("treats a text block with missing text field as empty", () => {
    expect(extractText([{ type: "text" }, { type: "text", text: "x" }])).toBe("\nx");
  });

  it("returns empty string for an empty content array", () => {
    expect(extractText([])).toBe("");
  });
});
