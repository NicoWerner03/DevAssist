import assert from "node:assert/strict";
import test from "node:test";
import { enrichImageReferencesWithVision } from "../src/vision.js";
import { ImageReference } from "../src/types.js";

test("enrichImageReferencesWithVision is a no-op without a client", async () => {
  const references: ImageReference[] = [
    {
      url: "https://example.com/image.png",
      markdown: "![Image](https://example.com/image.png)",
      source: "Issue description",
      context: "Example context"
    }
  ];

  await enrichImageReferencesWithVision(references, {}, undefined);

  assert.deepEqual(references, [
    {
      url: "https://example.com/image.png",
      markdown: "![Image](https://example.com/image.png)",
      source: "Issue description",
      context: "Example context"
    }
  ]);
});
