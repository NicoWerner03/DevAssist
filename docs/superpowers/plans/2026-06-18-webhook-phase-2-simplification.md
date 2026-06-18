# Webhook Phase 2 Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen internal typing and apply small behavior-preserving simplifications across the Phase 1 webhook modules.

**Architecture:** Keep the Phase 1 module split intact and avoid new service boundaries. Expand `src/types.ts` with pragmatic GitLab, webhook, agent, and Opencode part shapes, then replace high-impact `any` usage in consumers. Keep runtime behavior, prompt text, image placement, `glab` execution, webhook responses, and async timing unchanged.

**Tech Stack:** TypeScript with NodeNext ESM, Express, Node `node:test`, `@opencode-ai/sdk`, existing `glab` command adapter in `src/gitlab.ts`.

---

## File Structure

Modify:

- `src/types.ts`: Shared GitLab, webhook, agent response, image, and Opencode part types.
- `src/gitlab.ts`: Typed simulation state, payload objects, and exported return values.
- `src/image-references.ts`: Typed issue/comment inputs and type-only imports.
- `src/vision.ts`: Typed issue input and shared Opencode text extraction.
- `src/agent-analysis.ts`: Typed agent responses and shared Opencode text extraction.
- `src/publish-command.ts`: Typed proposal/comment flow.
- `src/webhook.ts`: Typed request body/raw body and payload narrowing.
- Existing tests where focused coverage is useful.

Create:

- `src/opencode-parts.ts`: Small helper for joining Opencode text parts without `any`.
- `test/opencode-parts.test.ts`: Characterization tests for text-part joining behavior.

Do not modify:

- `src/index.ts`
- `src/mock-test.ts`
- `src/logger.ts`

If TypeScript compatibility forces an import-only or cast-only change in a protected file, stop and report `NEEDS_CONTEXT` before editing it.

---

### Task 1: Add Shared Domain Types And Type The GitLab Adapter

**Files:**

- Modify: `src/types.ts`
- Modify: `src/gitlab.ts`

- [ ] **Step 1: Create the compile red by importing types before defining them**

In `src/gitlab.ts`, add this import below the existing imports:

```ts
import type { GitlabComment, GitlabIssue } from "./types.js";
```

Change these declarations/signatures only:

```ts
let mockComments: GitlabComment[] = [];
let mockIssue: GitlabIssue = {
  title: "Bug during login with OAuth @dev-assist",
  description: "When I click on login, nothing happens. Please fix.",
  author: { username: "nico03werner" }
};

export async function getIssue(projectId: string | number, issueIid: number): Promise<GitlabIssue> {
```

Run:

```powershell
npm run build
```

Expected: FAIL with TypeScript errors that `GitlabComment` and `GitlabIssue` are not exported from `./types.js`.

- [ ] **Step 2: Add the shared type definitions**

Replace `src/types.ts` with:

```ts
export type GitlabId = string | number;

export type GitlabUser = {
  username: string;
};

export type GitlabProject = {
  id: GitlabId;
  web_url?: string;
};

export type GitlabIssue = {
  title: string;
  description: string;
  author: GitlabUser;
  web_url?: string;
  project?: {
    web_url?: string;
  };
};

export type GitlabComment = {
  id: number;
  body: string;
  author: GitlabUser;
  system?: boolean;
};

export type GitlabIssueWebhookPayload = {
  object_kind: "issue";
  user?: GitlabUser;
  project?: {
    id?: GitlabId;
  };
  object_attributes?: {
    action?: string;
    title?: string;
    description?: string;
    iid?: number;
    project_id?: GitlabId;
  };
};

export type GitlabNoteWebhookPayload = {
  object_kind: "note";
  user?: GitlabUser;
  project?: {
    id?: GitlabId;
  };
  issue?: {
    iid?: number;
  };
  object_attributes?: {
    noteable_type?: string;
    note?: string;
  };
};

export type GitlabOtherWebhookPayload = {
  object_kind?: string;
  user?: GitlabUser;
  [key: string]: unknown;
};

export type GitlabWebhookPayload =
  | GitlabIssueWebhookPayload
  | GitlabNoteWebhookPayload
  | GitlabOtherWebhookPayload;

export type AgentQuestionResponse = {
  hasQuestions: true;
  questions: string;
};

export type AgentProposalResponse = {
  hasQuestions: false;
  proposedTitle: string;
  proposedDescription: string;
};

export type AgentResponse = AgentQuestionResponse | AgentProposalResponse;

export type OpencodeResponsePart = {
  type?: string;
  text?: string;
  [key: string]: unknown;
};

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

- [ ] **Step 3: Finish typing `src/gitlab.ts`**

Keep the import from Step 1 and make these exact changes.

Change `runGlabWithPayload` signature:

```ts
async function runGlabWithPayload(
  endpoint: string,
  method: "POST" | "PUT",
  payload: Record<string, unknown>
): Promise<string> {
```

In `getGitlabUser`, change the parsed user line:

```ts
const user = JSON.parse(output) as { username: string };
```

Change `getIssue` JSON parse:

```ts
return JSON.parse(output) as GitlabIssue;
```

Change `getIssueComments` signature and body parse:

```ts
export async function getIssueComments(projectId: string | number, issueIid: number): Promise<GitlabComment[]> {
  if (process.env.IS_SIMULATION === "true") {
    return mockComments;
  }

  const endpoint = `projects/${encodeURIComponent(projectId)}/issues/${issueIid}/notes`;
  try {
    const output = await runCommand(`glab api "${endpoint}" --paginate`);
    try {
      return JSON.parse(output) as GitlabComment[];
    } catch {
      return output
        .split("\n")
        .filter(line => line.trim())
        .flatMap(line => {
          const parsed = JSON.parse(line) as GitlabComment | GitlabComment[];
          return Array.isArray(parsed) ? parsed : [parsed];
        });
    }
  } catch (error) {
    logger.error(`Error fetching comments for issue ${issueIid}: ` + (error as Error).message);
    return [];
  }
}
```

Change `postIssueComment` signature and final parse:

```ts
export async function postIssueComment(projectId: string | number, issueIid: number, body: string): Promise<GitlabComment> {
```

```ts
return JSON.parse(output) as GitlabComment;
```

Change `updateIssue` signature and final parse:

```ts
export async function updateIssue(
  projectId: string | number,
  issueIid: number,
  title: string,
  description: string
): Promise<GitlabIssue> {
```

```ts
return JSON.parse(output) as GitlabIssue;
```

- [ ] **Step 4: Verify**

Run:

```powershell
npm run build
npm test
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add src/types.ts src/gitlab.ts
git commit -m "refactor: add webhook domain types"
```

---

### Task 2: Type Image Reference And Vision Inputs

**Files:**

- Modify: `src/image-references.ts`
- Modify: `src/vision.ts`

- [ ] **Step 1: Run behavior locks before refactoring**

Run:

```powershell
npx tsx --test test/image-references.test.ts
npx tsx --test test/vision.test.ts
```

Expected: both pass before making code changes.

- [ ] **Step 2: Type image-reference imports and function signatures**

In `src/image-references.ts`, replace the first import with:

```ts
import type { GitlabComment, GitlabIssue, ImageReference, ImageSource } from "./types.js";
```

Change `getCommentImageSource` signature:

```ts
function getCommentImageSource(comment: GitlabComment): ImageSource {
```

Change `getIssueImageSources` signature:

```ts
export function getIssueImageSources(
  issue: Pick<GitlabIssue, "description">,
  comments: GitlabComment[],
  botUsername: string,
  includeProposalCommentId?: number
): ImageSource[] {
```

Keep the function bodies unchanged.

- [ ] **Step 3: Type vision issue inputs**

In `src/vision.ts`, change the type import:

```ts
import type { GitlabIssue, ImageReference } from "./types.js";
```

Change these signatures:

```ts
function getProjectWebUrl(issue: GitlabIssue): string | null {
```

```ts
function resolveImageUrl(url: string, issue: GitlabIssue): string | null {
```

```ts
async function downloadImageAsDataUrl(
  reference: ImageReference,
  issue: GitlabIssue,
  maxImageBytes: number
): Promise<string | null> {
```

```ts
export async function enrichImageReferencesWithVision(
  references: ImageReference[],
  issue: GitlabIssue,
  opencodeClient?: OpencodeClient
): Promise<void> {
```

Keep function bodies unchanged.

- [ ] **Step 4: Verify**

Run:

```powershell
npx tsx --test test/image-references.test.ts
npx tsx --test test/vision.test.ts
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add src/image-references.ts src/vision.ts
git commit -m "refactor: type image and vision inputs"
```

---

### Task 3: Add Shared Opencode Text-Part Helper

**Files:**

- Create: `src/opencode-parts.ts`
- Create: `test/opencode-parts.test.ts`
- Modify: `src/agent-analysis.ts`
- Modify: `src/vision.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `test/opencode-parts.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { joinTextParts } from "../src/opencode-parts.js";

test("joinTextParts joins only text parts in order", () => {
  assert.equal(
    joinTextParts([
      { type: "text", text: "first" },
      { type: "file", text: "ignored" },
      { type: "text", text: "second" }
    ]),
    "first\nsecond"
  );
});

test("joinTextParts preserves existing empty slot behavior for missing text", () => {
  assert.equal(
    joinTextParts([
      { type: "text" },
      { type: "text", text: "second" }
    ]),
    "\nsecond"
  );
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
npx tsx --test test/opencode-parts.test.ts
```

Expected: FAIL because `../src/opencode-parts.js` does not exist.

- [ ] **Step 3: Create the helper**

Create `src/opencode-parts.ts`:

```ts
import type { OpencodeResponsePart } from "./types.js";

export function joinTextParts(parts: OpencodeResponsePart[]): string {
  return parts
    .filter(part => part.type === "text")
    .map(part => part.text)
    .join("\n");
}
```

- [ ] **Step 4: Replace response-part casts in `src/agent-analysis.ts`**

Add imports:

```ts
import { joinTextParts } from "./opencode-parts.js";
import type { OpencodeResponsePart } from "./types.js";
```

Replace:

```ts
const textParts = promptRes.data.parts.filter(p => p.type === 'text');
const replyText = textParts.map(p => (p as any).text).join('\n');
```

with:

```ts
const replyText = joinTextParts(promptRes.data.parts as OpencodeResponsePart[]);
```

- [ ] **Step 5: Replace response-part casts in `src/vision.ts`**

Add imports:

```ts
import { joinTextParts } from "./opencode-parts.js";
import type { GitlabIssue, ImageReference, OpencodeResponsePart } from "./types.js";
```

Replace:

```ts
const textParts = promptRes.data.parts.filter(p => p.type === "text");
const outputText = textParts.map(p => (p as any).text).join("\n").trim();
```

with:

```ts
const outputText = joinTextParts(promptRes.data.parts as OpencodeResponsePart[]).trim();
```

Keep the existing `GitlabIssue` and `ImageReference` type import from Task 2 in the combined import.

- [ ] **Step 6: Verify**

Run:

```powershell
npx tsx --test test/opencode-parts.test.ts
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add src/opencode-parts.ts src/agent-analysis.ts src/vision.ts test/opencode-parts.test.ts
git commit -m "refactor: type opencode text parts"
```

---

### Task 4: Type Agent Responses

**Files:**

- Modify: `src/agent-analysis.ts`
- Modify: `test/agent-analysis.test.ts`

- [ ] **Step 1: Write the failing narrowing tests**

In `test/agent-analysis.test.ts`, change the import to:

```ts
import { cleanQuestions, isAgentQuestionResponse, parseAgentResponse } from "../src/agent-analysis.js";
```

Add these tests after the existing parse tests:

```ts
test("isAgentQuestionResponse identifies parsed question responses", () => {
  const parsed = parseAgentResponse("```json\n{\"hasQuestions\":true,\"questions\":\"What happened?\"}\n```");

  assert.equal(isAgentQuestionResponse(parsed), true);
});

test("isAgentQuestionResponse rejects parsed proposal responses", () => {
  const parsed = parseAgentResponse(
    "```json\n{\"hasQuestions\":false,\"proposedTitle\":\"Title\",\"proposedDescription\":\"Description\"}\n```"
  );

  assert.equal(isAgentQuestionResponse(parsed), false);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npx tsx --test test/agent-analysis.test.ts
```

Expected: FAIL because `isAgentQuestionResponse` is not exported.

- [ ] **Step 3: Type `parseAgentResponse` and add the narrowing helper**

In `src/agent-analysis.ts`, add type imports:

```ts
import type { AgentQuestionResponse, AgentResponse, OpencodeResponsePart } from "./types.js";
```

If `OpencodeResponsePart` is already imported from Task 3, combine the imports into one `import type` statement.

Change `parseAgentResponse` signature and JSON parse:

```ts
export function parseAgentResponse(rawText: string): AgentResponse {
```

```ts
return JSON.parse(cleaned.trim()) as AgentResponse;
```

Add this helper below `parseAgentResponse`:

```ts
export function isAgentQuestionResponse(response: AgentResponse): response is AgentQuestionResponse {
  return response.hasQuestions;
}
```

- [ ] **Step 4: Use the narrowing helper in `runAnalysis`**

Replace:

```ts
if (parsed.hasQuestions) {
```

with:

```ts
if (isAgentQuestionResponse(parsed)) {
```

Keep both branches unchanged.

- [ ] **Step 5: Verify**

Run:

```powershell
npx tsx --test test/agent-analysis.test.ts
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add src/agent-analysis.ts test/agent-analysis.test.ts
git commit -m "refactor: type agent responses"
```

---

### Task 5: Type Publish Command Comments

**Files:**

- Modify: `src/publish-command.ts`

- [ ] **Step 1: Run the publish behavior lock**

Run:

```powershell
npx tsx --test test/webhook.test.ts
```

Expected: PASS before making changes.

- [ ] **Step 2: Type publish command imports and proposal comment**

In `src/publish-command.ts`, add `GitlabComment` to the type imports:

```ts
import type { GitlabComment } from "./types.js";
```

Change:

```ts
let proposalComment: any = null;
```

to:

```ts
let proposalComment: GitlabComment | null = null;
```

Keep the proposal lookup body unchanged.

- [ ] **Step 3: Verify**

Run:

```powershell
npx tsx --test test/webhook.test.ts
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```powershell
git add src/publish-command.ts
git commit -m "refactor: type publish command comments"
```

---

### Task 6: Type Webhook Payloads And Raw Body

**Files:**

- Modify: `src/webhook.ts`

- [ ] **Step 1: Run the webhook behavior lock**

Run:

```powershell
npx tsx --test test/webhook.test.ts
```

Expected: PASS before making changes.

- [ ] **Step 2: Add typed request and payload guards**

In `src/webhook.ts`, add these type imports:

```ts
import type {
  GitlabIssueWebhookPayload,
  GitlabNoteWebhookPayload,
  GitlabWebhookPayload
} from "./types.js";
```

Add these declarations below the imports:

```ts
type GitlabWebhookRequest = Request & {
  body: GitlabWebhookPayload;
  rawBody?: string;
};

function isIssueWebhookPayload(payload: GitlabWebhookPayload): payload is GitlabIssueWebhookPayload {
  return payload.object_kind === "issue";
}

function isNoteWebhookPayload(payload: GitlabWebhookPayload): payload is GitlabNoteWebhookPayload {
  return payload.object_kind === "note";
}
```

- [ ] **Step 3: Use the typed request and guards**

Change the handler signature:

```ts
export async function handleGitlabWebhook(
  req: GitlabWebhookRequest,
  res: Response,
  opencodeClient: OpencodeClient
) {
```

Replace:

```ts
const rawBody = (req as any).rawBody || JSON.stringify(req.body);
```

with:

```ts
const rawBody = req.rawBody || JSON.stringify(req.body);
```

Replace:

```ts
if (payload.object_kind === "issue") {
```

with:

```ts
if (isIssueWebhookPayload(payload)) {
```

Replace:

```ts
} else if (payload.object_kind === "note") {
```

with:

```ts
} else if (isNoteWebhookPayload(payload)) {
```

Change the catch clause:

```ts
} catch (error: unknown) {
  const message = (error as Error).message;
  logger.error("Webhook processing failed: " + message);
  return res.status(500).json({ error: message });
}
```

This keeps the old `.message` behavior while removing `catch (error: any)`.

- [ ] **Step 4: Verify**

Run:

```powershell
npx tsx --test test/webhook.test.ts
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add src/webhook.ts
git commit -m "refactor: type webhook payloads"
```

---

### Task 7: Final Any Audit And Phase 2 Verification

**Files:**

- No source changes expected unless verification finds a missed Phase 2 `any` in an in-scope file.

- [ ] **Step 1: Audit in-scope files for remaining `any`**

Run:

```powershell
rg -n "\bany\b|as any" src/webhook.ts src/agent-analysis.ts src/publish-command.ts src/image-references.ts src/vision.ts src/gitlab.ts
```

Expected: no matches. `rg` exits with code 1 when there are no matches; treat that as success.

If there is a match in an in-scope file, make the smallest type-only change that removes it, then run the verification in Step 2 and commit with:

```powershell
git add src/webhook.ts src/agent-analysis.ts src/publish-command.ts src/image-references.ts src/vision.ts src/gitlab.ts
git commit -m "refactor: finish webhook type cleanup"
```

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
npm run build
git status --short
```

Expected:

- `npm test` passes.
- `npm run build` passes.
- `git status --short` shows no refactor source changes. Pre-existing unrelated `.env` and `.codex-remote-attachments/` may still appear and must not be staged.

- [ ] **Step 3: Confirm Phase 2 boundaries**

Run:

```powershell
git log --oneline -10
rg --files src test | Sort-Object
```

Expected: recent commits correspond to Phase 2 typing/simplification tasks. No prompt wording, command syntax, image placement logic, `glab` command strategy, or broad service architecture was changed.
