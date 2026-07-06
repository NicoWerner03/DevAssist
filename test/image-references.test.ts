import assert from "node:assert/strict";
import test from "node:test";
import {
  appendMissingImageReferences,
  collectImageReferences,
  formatImageReferencesForPrompt,
  getIssueImageSources
} from "../src/image-references.js";

test("collectImageReferences extracts supported image forms and deduplicates URLs", () => {
  const references = collectImageReferences([
    {
      source: "Issue description",
      text: [
        "Screenshot of the empty login form:",
        "![Empty login](/uploads/empty-login.png)",
        "Direct URL https://example.com/error.png.",
        "Duplicate direct URL https://example.com/error.png.",
        "HTML <img src=\"https://example.com/html.webp\">",
        "Linked [diagram](https://example.com/diagram.jpg)"
      ].join("\n")
    }
  ]);

  assert.deepEqual(
    references.map(reference => reference.url),
    [
      "/uploads/empty-login.png",
      "https://example.com/html.webp",
      "https://example.com/diagram.jpg",
      "https://example.com/error.png"
    ]
  );
});

test("appendMissingImageReferences restores an image next to matching context", () => {
  const updated = appendMissingImageReferences(
    [
      "## Reproduction",
      "The login dialog opens without any fields.",
      "",
      "## Expected behavior",
      "The form fields should be visible."
    ].join("\n"),
    [
      {
        url: "/uploads/empty-login.png",
        markdown: "![Empty login dialog](/uploads/empty-login.png)",
        source: "Issue description",
        context: "The login dialog opens without any fields."
      }
    ]
  );

  assert.equal(
    updated,
    [
      "## Reproduction",
      "The login dialog opens without any fields.",
      "![Empty login dialog](/uploads/empty-login.png)",
      "",
      "## Expected behavior",
      "The form fields should be visible."
    ].join("\n")
  );
});

test("getIssueImageSources excludes system comments, bot comments, and proposal comments", () => {
  const sources = getIssueImageSources(
    { description: "Issue image ![issue](/uploads/issue.png)" },
    [
      { id: 1, system: true, body: "system ![system](/uploads/system.png)", author: { username: "reporter" } },
      { id: 2, body: "bot ![bot](/uploads/bot.png)", author: { username: "dev-assist-bot" } },
      { id: 3, body: "proposal ![proposal](/uploads/proposal.png)", author: { username: "reporter" } },
      { id: 4, body: "user ![user](/uploads/user.png)", author: { username: "reporter" } }
    ],
    "dev-assist-bot",
    3
  );

  assert.deepEqual(
    sources.map(source => source.source),
    ["Issue description", "Comment by @reporter"]
  );
  assert.equal(formatImageReferencesForPrompt(collectImageReferences(sources)).includes("/uploads/user.png"), true);
});
