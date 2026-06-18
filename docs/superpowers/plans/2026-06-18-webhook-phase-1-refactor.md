# Webhook Phase 1 Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/webhook.ts` into clear domain modules while preserving external behavior.

**Architecture:** Keep `src/webhook.ts` as the public facade that exports `initBotUser` and `handleGitlabWebhook`. Extract cohesive helpers into small modules for command detection, signature validation, image references, vision enrichment, agent analysis, and publish handling. Keep GitLab API calls in `src/gitlab.ts` and keep webhook responses/async behavior unchanged.

**Tech Stack:** TypeScript, NodeNext ESM, Express, `node:test`, `@opencode-ai/sdk`, `glab` through the existing `src/gitlab.ts` adapter.

---

## File Structure

Create:

- `src/types.ts`: Shared `ImageReference` and `ImageSource` types.
- `src/message-detection.ts`: `@dev-assist` mention and publish command detection.
- `src/webhook-signature.ts`: GitLab webhook HMAC signature validation.
- `src/image-references.ts`: Image extraction, formatting, context matching, and reinsertion.
- `src/vision.ts`: Image URL resolution, download, size guard, MIME detection, and Opencode vision summaries.
- `src/agent-analysis.ts`: Normal `@dev-assist` analysis flow and proposal/question posting.
- `src/publish-command.ts`: `@dev-assist publish` proposal parsing, issue update, and helper comment cleanup.
- `test/message-detection.test.ts`: Characterization tests for command matching.
- `test/webhook-signature.test.ts`: Characterization tests for HMAC validation.
- `test/image-references.test.ts`: Characterization tests for image extraction/reinsertion.
- `test/agent-analysis.test.ts`: Characterization tests for agent response parsing and question cleanup.
- `test/vision.test.ts`: Characterization test for no-op vision enrichment.

Modify:

- `src/webhook.ts`: Reduce to facade/orchestrator and import extracted modules.

Do not modify:

- `src/index.ts`
- `src/mock-test.ts`
- `src/gitlab.ts`
- `src/logger.ts`

---

### Task 1: Extract Message Detection

**Files:**

- Create: `test/message-detection.test.ts`
- Create: `src/message-detection.ts`
- Modify: `src/webhook.ts`

- [ ] **Step 1: Write the failing characterization test**

Create `test/message-detection.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { isPublishCommand, mentionsDevAssist } from "../src/message-detection.js";

test("mentionsDevAssist matches @dev-assist case-insensitively", () => {
  assert.equal(mentionsDevAssist("please help @dev-assist"), true);
  assert.equal(mentionsDevAssist("please help @DEV-ASSIST"), true);
  assert.equal(mentionsDevAssist("please help dev-assist"), false);
});

test("isPublishCommand matches the existing publish substring", () => {
  assert.equal(isPublishCommand("@dev-assist publish"), true);
  assert.equal(isPublishCommand("please @dev-assist publish now"), true);
  assert.equal(isPublishCommand("@DEV-ASSIST PUBLISH"), true);
  assert.equal(isPublishCommand("@dev-assist analyze"), false);
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
npx tsx --test test/message-detection.test.ts
```

Expected: FAIL because `../src/message-detection.js` does not exist.

- [ ] **Step 3: Create the module**

Create `src/message-detection.ts`:

```ts
export function mentionsDevAssist(text: string): boolean {
  return text.toLowerCase().includes("@dev-assist");
}

export function isPublishCommand(text: string): boolean {
  return text.toLowerCase().includes("@dev-assist publish");
}
```

- [ ] **Step 4: Wire `src/webhook.ts` to the new module**

In `src/webhook.ts`, add this import:

```ts
import { isPublishCommand, mentionsDevAssist } from "./message-detection.js";
```

Remove these existing local functions from `src/webhook.ts`:

```ts
function mentionsDevAssist(text: string): boolean {
  return text.toLowerCase().includes("@dev-assist");
}

function isPublishCommand(text: string): boolean {
  return text.toLowerCase().includes("@dev-assist publish");
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
npx tsx --test test/message-detection.test.ts
npm run build
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```powershell
git add src/webhook.ts src/message-detection.ts test/message-detection.test.ts
git commit -m "refactor: extract webhook command detection"
```

---

### Task 2: Extract Webhook Signature Validation

**Files:**

- Create: `test/webhook-signature.test.ts`
- Create: `src/webhook-signature.ts`
- Modify: `src/webhook.ts`

- [ ] **Step 1: Write the failing characterization test**

Create `test/webhook-signature.test.ts`:

```ts
import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { verifyGitlabSignature } from "../src/webhook-signature.js";

function sign(id: string, timestamp: string, rawBody: string, signingToken: string): string {
  const message = `${id}.${timestamp}.${rawBody}`;
  const key = Buffer.from(signingToken.replace("whsec_", ""), "base64");
  const hmac = crypto.createHmac("sha256", key);
  hmac.update(message);
  return `v1,${hmac.digest("base64")}`;
}

test("verifyGitlabSignature accepts the current HMAC format", () => {
  const signingToken = `whsec_${Buffer.from("test-secret").toString("base64")}`;
  const signature = sign("webhook-1", "1710000000", "{\"ok\":true}", signingToken);

  assert.equal(
    verifyGitlabSignature("webhook-1", "1710000000", "{\"ok\":true}", signature, signingToken),
    true
  );
});

test("verifyGitlabSignature rejects a mismatched signature", () => {
  const signingToken = `whsec_${Buffer.from("test-secret").toString("base64")}`;
  const signature = sign("webhook-1", "1710000000", "{\"ok\":true}", signingToken);

  assert.equal(
    verifyGitlabSignature("webhook-1", "1710000001", "{\"ok\":true}", signature, signingToken),
    false
  );
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
npx tsx --test test/webhook-signature.test.ts
```

Expected: FAIL because `../src/webhook-signature.js` does not exist.

- [ ] **Step 3: Create the module**

Create `src/webhook-signature.ts`:

```ts
import crypto from "crypto";
import logger from "./logger.js";

export function verifyGitlabSignature(
  id: string,
  timestamp: string,
  rawBody: string,
  signatureHeader: string,
  signingToken: string
): boolean {
  try {
    const message = `${id}.${timestamp}.${rawBody}`;
    const key = Buffer.from(signingToken.replace("whsec_", ""), "base64");
    const hmac = crypto.createHmac("sha256", key);
    hmac.update(message);
    const computedSignature = hmac.digest("base64");
    const expectedSignature = `v1,${computedSignature}`;
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSignature));
  } catch (err) {
    logger.error("Error verifying GitLab webhook signature: " + (err as Error).message);
    return false;
  }
}
```

- [ ] **Step 4: Wire `src/webhook.ts` to the new module**

In `src/webhook.ts`, add this import:

```ts
import { verifyGitlabSignature } from "./webhook-signature.js";
```

Remove this import:

```ts
import crypto from "crypto";
```

Remove the existing local `verifyGitlabSignature(...)` function from `src/webhook.ts`.

- [ ] **Step 5: Verify**

Run:

```powershell
npx tsx --test test/webhook-signature.test.ts
npm run build
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```powershell
git add src/webhook.ts src/webhook-signature.ts test/webhook-signature.test.ts
git commit -m "refactor: extract webhook signature validation"
```

---

### Task 3: Extract Shared Types And Image Reference Logic

**Files:**

- Create: `src/types.ts`
- Create: `test/image-references.test.ts`
- Create: `src/image-references.ts`
- Modify: `src/webhook.ts`

- [ ] **Step 1: Write the failing characterization test**

Create `test/image-references.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
npx tsx --test test/image-references.test.ts
```

Expected: FAIL because `../src/image-references.js` does not exist.

- [ ] **Step 3: Create shared types**

Create `src/types.ts`:

```ts
export type ImageReference = {
  url: string;
  markdown: string;
  source: string;
  context: string;
  visionSummary?: string;
};

export type ImageSource = {
  text: string;
  source: string;
};
```

- [ ] **Step 4: Create `src/image-references.ts` by moving the existing image-reference code**

Create `src/image-references.ts` with these imports and constants:

```ts
import { ImageReference, ImageSource } from "./types.js";

const IMAGE_URL_EXTENSION = /\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|tiff?)(?:[?#].*)?$/i;
```

Move these existing functions from `src/webhook.ts` into `src/image-references.ts` with their bodies unchanged, except for the export keywords and the `botUsername` parameter described below:

```ts
function stripTrailingUrlPunctuation(value: string): string
function getMarkdownTargetUrl(target: string): string
export function looksLikeImageUrl(url: string): boolean
export function getMimeTypeFromUrl(url: string): string
function normalizeImageContext(value: string): string
function truncateContext(value: string): string
function getImageContext(text: string, matchIndex: number, matchLength: number): string
function addImageReference(
  references: ImageReference[],
  seenReferences: Map<string, ImageReference>,
  markdown: string,
  url: string,
  source: string,
  context: string
): void
function extractImageReferencesFromText(
  imageSource: ImageSource,
  references: ImageReference[],
  seenReferences: Map<string, ImageReference>
): void
export function collectImageReferences(sources: ImageSource[]): ImageReference[]
function getCommentImageSource(comment: any): ImageSource
export function getIssueImageSources(
  issue: any,
  comments: any[],
  botUsername: string,
  includeProposalCommentId?: number
): ImageSource[]
export function formatImageReferencesForPrompt(references: ImageReference[]): string
function formatImageReferenceBlock(reference: ImageReference, index: number, includeImage: boolean): string
function descriptionIncludesImage(description: string, reference: ImageReference): boolean
function tokenizeContext(value: string): Set<string>
function findContextInsertionIndex(description: string, reference: ImageReference): number | null
function insertImageReferenceAt(description: string, insertionIndex: number, reference: ImageReference): string
export function appendMissingImageReferences(description: string, references: ImageReference[]): string
```

Change the moved `getIssueImageSources` function to receive `botUsername` as a parameter instead of reading the old `webhook.ts` module variable:

```ts
export function getIssueImageSources(
  issue: any,
  comments: any[],
  botUsername: string,
  includeProposalCommentId?: number
): ImageSource[] {
  const userProvidedImageSources = comments
    .filter(c => {
      if (c.system) return false;
      if (includeProposalCommentId && c.id === includeProposalCommentId) return false;
      return !botUsername || c.author?.username !== botUsername;
    })
    .map(getCommentImageSource);

  return [
    { text: issue.description || "", source: "Issue description" },
    ...userProvidedImageSources
  ];
}
```

- [ ] **Step 5: Remove moved declarations from `src/webhook.ts`**

Delete these declarations from `src/webhook.ts` after moving them:

```ts
type ImageReference = { url: string; markdown: string; source: string; context: string; visionSummary?: string };
type ImageSource = { text: string; source: string };
const IMAGE_URL_EXTENSION = /\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|tiff?)(?:[?#].*)?$/i;
function stripTrailingUrlPunctuation(value: string): string
function getMarkdownTargetUrl(target: string): string
function looksLikeImageUrl(url: string): boolean
function getMimeTypeFromUrl(url: string): string
function normalizeImageContext(value: string): string
function truncateContext(value: string): string
function getImageContext(text: string, matchIndex: number, matchLength: number): string
function addImageReference(...)
function extractImageReferencesFromText(...)
function collectImageReferences(sources: ImageSource[]): ImageReference[]
function getCommentImageSource(comment: any): ImageSource
function getIssueImageSources(issue: any, comments: any[], includeProposalCommentId?: number): ImageSource[]
function formatImageReferencesForPrompt(references: ImageReference[]): string
function formatImageReferenceBlock(reference: ImageReference, index: number, includeImage: boolean): string
function descriptionIncludesImage(description: string, reference: ImageReference): boolean
function tokenizeContext(value: string): Set<string>
function findContextInsertionIndex(description: string, reference: ImageReference): number | null
function insertImageReferenceAt(description: string, insertionIndex: number, reference: ImageReference): string
function appendMissingImageReferences(description: string, references: ImageReference[]): string
```

At this point, `src/webhook.ts` will not compile until later tasks move `runAnalysis` and `runPublishCommand`. Keep going inside this task until the imports are restored.

- [ ] **Step 6: Add temporary imports in `src/webhook.ts`**

Add this import so `runAnalysis` and `runPublishCommand` still compile before they are extracted:

```ts
import {
  appendMissingImageReferences,
  collectImageReferences,
  formatImageReferencesForPrompt,
  getIssueImageSources,
  getMimeTypeFromUrl,
  looksLikeImageUrl
} from "./image-references.js";
import { type ImageReference } from "./types.js";
```

Update both existing call sites:

```ts
const imageReferences = collectImageReferences(getIssueImageSources(issue, comments, botUsername));
```

```ts
const imageReferences = collectImageReferences(getIssueImageSources(issue, comments, botUsername, proposalComment.id));
```

- [ ] **Step 7: Verify**

Run:

```powershell
npx tsx --test test/image-references.test.ts
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 8: Commit**

```powershell
git add src/webhook.ts src/types.ts src/image-references.ts test/image-references.test.ts
git commit -m "refactor: extract webhook image references"
```

---

### Task 4: Extract Vision Enrichment

**Files:**

- Create: `test/vision.test.ts`
- Create: `src/vision.ts`
- Modify: `src/webhook.ts`

- [ ] **Step 1: Write the failing characterization test**

Create `test/vision.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
npx tsx --test test/vision.test.ts
```

Expected: FAIL because `../src/vision.js` does not exist.

- [ ] **Step 3: Create `src/vision.ts` by moving the existing vision code**

Create `src/vision.ts` with these imports and constants:

```ts
import { OpencodeClient } from "@opencode-ai/sdk";
import { getMimeTypeFromUrl, looksLikeImageUrl } from "./image-references.js";
import logger from "./logger.js";
import { ImageReference } from "./types.js";

const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
```

Move these existing functions from `src/webhook.ts` into `src/vision.ts` with their bodies unchanged, except for the export keywords:

```ts
function getProjectWebUrl(issue: any): string | null
function resolveImageUrl(url: string, issue: any): string | null
function getVisionMaxImageBytes(): number
function getGitlabImageFetchHeaders(): Record<string, string>
async function downloadImageAsDataUrl(reference: ImageReference, issue: any, maxImageBytes: number): Promise<string | null>
async function analyzeImageWithOpencode(
  reference: ImageReference,
  dataUrl: string,
  opencodeClient: OpencodeClient
): Promise<string | null>
function getMimeTypeFromDataUrl(dataUrl: string): string
export async function enrichImageReferencesWithVision(
  references: ImageReference[],
  issue: any,
  opencodeClient?: OpencodeClient
): Promise<void>
```

- [ ] **Step 4: Remove moved declarations from `src/webhook.ts`**

Delete these declarations from `src/webhook.ts` after moving them:

```ts
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
function getProjectWebUrl(issue: any): string | null
function resolveImageUrl(url: string, issue: any): string | null
function getVisionMaxImageBytes(): number
function getGitlabImageFetchHeaders(): Record<string, string>
async function downloadImageAsDataUrl(reference: ImageReference, issue: any, maxImageBytes: number): Promise<string | null>
async function analyzeImageWithOpencode(reference: ImageReference, dataUrl: string, opencodeClient: OpencodeClient): Promise<string | null>
function getMimeTypeFromDataUrl(dataUrl: string): string
async function enrichImageReferencesWithVision(references: ImageReference[], issue: any, opencodeClient?: OpencodeClient): Promise<void>
```

- [ ] **Step 5: Add the import in `src/webhook.ts`**

```ts
import { enrichImageReferencesWithVision } from "./vision.js";
```

- [ ] **Step 6: Remove temporary image-reference imports from `src/webhook.ts`**

After moving the vision functions out of `src/webhook.ts`, remove these temporary imports if no remaining code in `src/webhook.ts` references them:

```ts
getMimeTypeFromUrl,
looksLikeImageUrl
```

Also remove this temporary type import if no remaining code in `src/webhook.ts` references it:

```ts
import { type ImageReference } from "./types.js";
```

- [ ] **Step 7: Verify**

Run:

```powershell
npx tsx --test test/vision.test.ts
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 8: Commit**

```powershell
git add src/webhook.ts src/vision.ts test/vision.test.ts
git commit -m "refactor: extract webhook vision enrichment"
```

---

### Task 5: Extract Agent Analysis Flow

**Files:**

- Create: `test/agent-analysis.test.ts`
- Create: `src/agent-analysis.ts`
- Modify: `src/webhook.ts`

- [ ] **Step 1: Write the failing characterization test**

Create `test/agent-analysis.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { cleanQuestions, parseAgentResponse } from "../src/agent-analysis.js";

test("parseAgentResponse parses JSON wrapped in a json markdown block", () => {
  assert.deepEqual(
    parseAgentResponse("```json\n{\"hasQuestions\":true,\"questions\":\"What happened?\"}\n```"),
    { hasQuestions: true, questions: "What happened?" }
  );
});

test("parseAgentResponse parses JSON wrapped in a generic markdown block", () => {
  assert.deepEqual(
    parseAgentResponse("```\n{\"hasQuestions\":false,\"proposedTitle\":\"Title\"}\n```"),
    { hasQuestions: false, proposedTitle: "Title" }
  );
});

test("cleanQuestions strips greeting text before the first real question", () => {
  assert.equal(
    cleanQuestions("Hi team,\nThanks for the report.\nWhat browser are you using?\n- Can you share logs?"),
    "What browser are you using?\n- Can you share logs?"
  );
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
npx tsx --test test/agent-analysis.test.ts
```

Expected: FAIL because `../src/agent-analysis.js` does not exist.

- [ ] **Step 3: Create `src/agent-analysis.ts` by moving analysis code**

Create `src/agent-analysis.ts` with these imports:

```ts
import { OpencodeClient } from "@opencode-ai/sdk";
import { getIssue, getIssueComments, postIssueComment } from "./gitlab.js";
import {
  appendMissingImageReferences,
  collectImageReferences,
  formatImageReferencesForPrompt,
  getIssueImageSources
} from "./image-references.js";
import logger from "./logger.js";
import { enrichImageReferencesWithVision } from "./vision.js";
```

Move these existing functions from `src/webhook.ts` into `src/agent-analysis.ts` with their bodies unchanged, except for the export keywords and `botUsername` parameter described below:

```ts
export function parseAgentResponse(rawText: string): any
export function cleanQuestions(questions: string): string
export async function runAnalysis(
  projectId: string | number,
  issueIid: number,
  triggeringUser: string | undefined,
  opencodeClient: OpencodeClient,
  botUsername: string
): Promise<void>
```

Inside the moved `runAnalysis`, keep the existing logic and update the image source call to pass `botUsername`:

```ts
const imageReferences = collectImageReferences(getIssueImageSources(issue, comments, botUsername));
```

- [ ] **Step 4: Remove moved declarations from `src/webhook.ts`**

Delete these declarations from `src/webhook.ts` after moving them:

```ts
function parseAgentResponse(rawText: string): any
function cleanQuestions(questions: string): string
async function runAnalysis(projectId: string | number, issueIid: number, triggeringUser: string, opencodeClient: OpencodeClient)
```

- [ ] **Step 5: Add the import and update call sites in `src/webhook.ts`**

Add:

```ts
import { runAnalysis } from "./agent-analysis.js";
```

Update both calls:

```ts
runAnalysis(projectId, issueIid, payload.user?.username, opencodeClient, botUsername).catch(err => {
  logger.error(`[WEBHOOK] Error analyzing issue #${issueIid}: ` + err.message);
});
```

```ts
runAnalysis(projectId, issueIid, payload.user?.username, opencodeClient, botUsername).catch(err => {
  logger.error(`[WEBHOOK] Error analyzing comment for issue #${issueIid}: ` + err.message);
});
```

- [ ] **Step 6: Verify**

Run:

```powershell
npx tsx --test test/agent-analysis.test.ts
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 7: Commit**

```powershell
git add src/webhook.ts src/agent-analysis.ts test/agent-analysis.test.ts
git commit -m "refactor: extract webhook agent analysis"
```

---

### Task 6: Extract Publish Command Flow

**Files:**

- Create: `src/publish-command.ts`
- Modify: `src/webhook.ts`
- Modify: `test/webhook.test.ts` only if the existing test needs an import path update; it should not need one.

- [ ] **Step 1: Run the existing publish characterization test before extraction**

Run:

```powershell
npx tsx --test test/webhook.test.ts
```

Expected: PASS. This is the behavior lock for publish flow.

- [ ] **Step 2: Create `src/publish-command.ts` by moving publish code**

Create `src/publish-command.ts` with these imports:

```ts
import { OpencodeClient } from "@opencode-ai/sdk";
import { Response } from "express";
import {
  deleteIssueComment,
  getIssue,
  getIssueComments,
  postIssueComment,
  updateIssue
} from "./gitlab.js";
import { collectImageReferences, appendMissingImageReferences, getIssueImageSources } from "./image-references.js";
import logger from "./logger.js";
import { mentionsDevAssist } from "./message-detection.js";
import { enrichImageReferencesWithVision } from "./vision.js";
```

Move the existing `runPublishCommand` function from `src/webhook.ts` into `src/publish-command.ts` with its body unchanged, except for the export keyword and the `botUsername` parameter:

```ts
export async function runPublishCommand(
  projectId: string | number,
  issueIid: number,
  botUsername: string,
  res?: Response,
  opencodeClient?: OpencodeClient
): Promise<void>
```

Inside the moved function, update the image source call to pass `botUsername`:

```ts
const imageReferences = collectImageReferences(getIssueImageSources(issue, comments, botUsername, proposalComment.id));
```

- [ ] **Step 3: Remove moved declaration from `src/webhook.ts`**

Delete this declaration from `src/webhook.ts`:

```ts
async function runPublishCommand(projectId: string | number, issueIid: number, res?: Response, opencodeClient?: OpencodeClient)
```

- [ ] **Step 4: Add the import and update call sites in `src/webhook.ts`**

Add:

```ts
import { runPublishCommand } from "./publish-command.js";
```

Update the issue-event publish call:

```ts
await runPublishCommand(projectId, issueIid, botUsername, res, opencodeClient);
```

Update the note-event publish call:

```ts
runPublishCommand(projectId, issueIid, botUsername, undefined, opencodeClient).catch(err => {
  logger.error(`[WEBHOOK] Error publishing issue #${issueIid}: ` + err.message);
});
```

- [ ] **Step 5: Verify**

Run:

```powershell
npx tsx --test test/webhook.test.ts
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```powershell
git add src/webhook.ts src/publish-command.ts
git commit -m "refactor: extract webhook publish command"
```

---

### Task 7: Final Facade Cleanup

**Files:**

- Modify: `src/webhook.ts`

- [ ] **Step 1: Replace `src/webhook.ts` with the final facade shape**

After Tasks 1-6, `src/webhook.ts` should contain only this orchestration code:

```ts
import { Request, Response } from "express";
import { OpencodeClient } from "@opencode-ai/sdk";
import { getGitlabUser } from "./gitlab.js";
import { runAnalysis } from "./agent-analysis.js";
import logger from "./logger.js";
import { isPublishCommand, mentionsDevAssist } from "./message-detection.js";
import { runPublishCommand } from "./publish-command.js";
import { verifyGitlabSignature } from "./webhook-signature.js";

let botUsername: string = "";

export async function initBotUser() {
  try {
    botUsername = await getGitlabUser();
    logger.info(`Bot initialized with GitLab user: @${botUsername}`);
  } catch (err) {
    logger.error("Warning: Could not fetch GitLab bot username: " + (err as Error).message);
  }
}

export async function handleGitlabWebhook(req: Request, res: Response, opencodeClient: OpencodeClient) {
  const signingToken = process.env.GITLAB_WEBHOOK_SECRET;
  const signatureHeader = req.headers["webhook-signature"] as string | undefined;
  const webhookId = req.headers["webhook-id"] as string | undefined;
  const webhookTimestamp = req.headers["webhook-timestamp"] as string | undefined;

  if (signingToken && signatureHeader && webhookId && webhookTimestamp) {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const isValid = verifyGitlabSignature(webhookId, webhookTimestamp, rawBody, signatureHeader, signingToken);

    if (!isValid) {
      logger.warn(`[WEBHOOK] Unauthorized access attempt: Invalid webhook-signature`);
      return res.status(401).json({ error: "Unauthorized: Invalid Webhook Signature" });
    }
    logger.info(`[WEBHOOK] Webhook signature verified successfully`);
  } else {
    logger.debug(`[WEBHOOK] Bypassed signature validation (headers present: signature=${!!signatureHeader}, id=${!!webhookId}, timestamp=${!!webhookTimestamp})`);
  }

  const payload = req.body;
  logger.debug(`[WEBHOOK] Incoming GitLab payload: ${JSON.stringify(payload, null, 2)}`);

  if (!payload || !payload.object_kind) {
    logger.warn(`[WEBHOOK] Bad Request: Missing payload details or object_kind`);
    return res.status(400).json({ error: "Bad Request: Missing payload details" });
  }

  const eventUser = payload.user?.username;

  if (eventUser && botUsername && eventUser === botUsername) {
    logger.info(`Ignored: Event triggered by bot @${botUsername} itself`);
    return res.status(200).json({ message: "Ignored: Event triggered by bot itself" });
  }

  try {
    if (payload.object_kind === "issue") {
      const action = payload.object_attributes?.action;
      const title = payload.object_attributes?.title || "";
      const description = payload.object_attributes?.description || "";
      const issueIid = payload.object_attributes?.iid;
      const projectId = payload.project?.id || payload.object_attributes?.project_id;

      if (!issueIid || !projectId) {
        return res.status(400).json({ error: "Missing issue IID or Project ID" });
      }

      const mentionsAssist = mentionsDevAssist(title) || mentionsDevAssist(description);
      if ((action === "open" || action === "update") && mentionsAssist) {
        if (isPublishCommand(description)) {
          await runPublishCommand(projectId, issueIid, botUsername, res, opencodeClient);
          return;
        }

        logger.info(`[WEBHOOK] Processing issue event [${action}] for Issue #${issueIid} in Project ${projectId}`);
        res.status(200).json({ message: "Analyzing issue..." });

        runAnalysis(projectId, issueIid, payload.user?.username, opencodeClient, botUsername).catch(err => {
          logger.error(`[WEBHOOK] Error analyzing issue #${issueIid}: ` + err.message);
        });
        return;
      }
    } else if (payload.object_kind === "note") {
      const noteableType = payload.object_attributes?.noteable_type;
      const noteText = payload.object_attributes?.note || "";
      const issueIid = payload.issue?.iid;
      const projectId = payload.project?.id;

      if (noteableType === "Issue" && issueIid && projectId) {
        if (mentionsDevAssist(noteText)) {
          if (isPublishCommand(noteText)) {
            logger.info(`[WEBHOOK] Received publish command for Issue #${issueIid} in Project ${projectId}`);
            res.status(200).json({ message: "Publishing ticket..." });

            runPublishCommand(projectId, issueIid, botUsername, undefined, opencodeClient).catch(err => {
              logger.error(`[WEBHOOK] Error publishing issue #${issueIid}: ` + err.message);
            });
            return;
          } else {
            logger.info(`[WEBHOOK] Received query comment for Issue #${issueIid} in Project ${projectId}`);
            res.status(200).json({ message: "Analyzing discussion..." });

            runAnalysis(projectId, issueIid, payload.user?.username, opencodeClient, botUsername).catch(err => {
              logger.error(`[WEBHOOK] Error analyzing comment for issue #${issueIid}: ` + err.message);
            });
            return;
          }
        }
      }
    }

    return res.status(200).json({ message: "Event ignored" });
  } catch (error: any) {
    logger.error("Webhook processing failed: " + error.message);
    return res.status(500).json({ error: error.message });
  }
}
```

- [ ] **Step 2: Verify no extracted implementation blocks remain in `src/webhook.ts`**

Run:

```powershell
rg -n "parseAgentResponse|cleanQuestions|extractImageReferencesFromText|downloadImageAsDataUrl|analyzeImageWithOpencode|proposed-description-start|DEFAULT_MAX_IMAGE_BYTES|IMAGE_URL_EXTENSION" src/webhook.ts
```

Expected: no matches.

- [ ] **Step 3: Verify**

Run:

```powershell
npm test
npm run build
```

Expected: both commands pass.

- [ ] **Step 4: Commit**

```powershell
git add src/webhook.ts
git commit -m "refactor: reduce webhook to facade"
```

---

### Task 8: Final Phase 1 Verification

**Files:**

- No source file changes expected.

- [ ] **Step 1: Check working tree**

Run:

```powershell
git status --short
```

Expected: no unstaged source changes from the refactor. Pre-existing unrelated local files such as `.env` or `.codex-remote-attachments/` may still appear and must not be staged.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
npm run build
```

Expected: both commands pass.

- [ ] **Step 3: Inspect final changed files**

Run:

```powershell
git log --oneline -8
rg --files src test | Sort-Object
```

Expected: recent commits correspond to the extraction tasks, and the new modules are present under `src/`.

- [ ] **Step 4: Stop at the phase boundary**

Do not simplify logic, rename commands, change prompt wording, or alter GitLab behavior in Phase 1. Phase 2 starts only after Phase 1 is reviewed and accepted.
