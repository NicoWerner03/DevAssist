import assert from "node:assert/strict";
import test from "node:test";
import { enrichImageReferencesWithVision } from "../src/vision.js";
import type { ImageReference } from "../src/types.js";

test("enrichImageReferencesWithVision is a no-op without a client", async () => {
  const references: ImageReference[] = [
    {
      url: "https://example.com/image.png",
      markdown: "![Image](https://example.com/image.png)",
      source: "Issue description",
      context: "Example context"
    }
  ];

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("fetch should not be called without a client");
  }) as typeof fetch;

  try {
    await enrichImageReferencesWithVision(references, {}, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(fetchCalls, 0);
  assert.deepEqual(references, [
    {
      url: "https://example.com/image.png",
      markdown: "![Image](https://example.com/image.png)",
      source: "Issue description",
      context: "Example context"
    }
  ]);
});
