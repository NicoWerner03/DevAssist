# Webhook Phase 3 Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden existing webhook behavior by validating agent JSON response shapes at runtime and locking current webhook edge-case responses with tests.

**Architecture:** Keep the Phase 1/2 module split intact. Add small local runtime guards in `src/agent-analysis.ts` and expand focused tests in `test/agent-analysis.test.ts` and `test/webhook.test.ts`; do not add dependencies or new service boundaries.

**Tech Stack:** TypeScript with NodeNext ESM, Express handler tests using Node `node:test`, existing `@opencode-ai/sdk` types, existing GitLab simulation mode in `src/gitlab.ts`.

---

## File Structure

Modify:

- `src/agent-analysis.ts`: Validate parsed unknown JSON before returning `AgentResponse`.
- `test/agent-analysis.test.ts`: Add parser validation tests and make the valid proposal fixture complete.
- `test/webhook.test.ts`: Add response/client helpers and webhook edge-case characterization tests.

Do not modify:

- `src/webhook.ts`
- `src/gitlab.ts`
- `src/image-references.ts`
- `src/vision.ts`
- `src/publish-command.ts`
- `src/index.ts`
- `src/mock-test.ts`
- `src/logger.ts`
- `package.json`

If a webhook edge-case test fails because current behavior differs from this plan, stop and report `NEEDS_CONTEXT` before changing production behavior. Phase 3 is not allowed to introduce new user-facing behavior.

---

### Task 1: Validate Agent Response Shapes At Runtime

**Files:**

- Modify: `test/agent-analysis.test.ts`
- Modify: `src/agent-analysis.ts`

- [ ] **Step 1: Update the existing valid proposal parser test**

In `test/agent-analysis.test.ts`, replace the current generic markdown block parser test:

```ts
test("parseAgentResponse parses JSON wrapped in a generic markdown block", () => {
  assert.deepEqual(
    parseAgentResponse("```\n{\"hasQuestions\":false,\"proposedTitle\":\"Title\"}\n```"),
    { hasQuestions: false, proposedTitle: "Title" }
  );
});
```

with:

```ts
test("parseAgentResponse parses proposal JSON wrapped in a generic markdown block", () => {
  assert.deepEqual(
    parseAgentResponse(
      "```\n{\"hasQuestions\":false,\"proposedTitle\":\"Title\",\"proposedDescription\":\"Description\"}\n```"
    ),
    { hasQuestions: false, proposedTitle: "Title", proposedDescription: "Description" }
  );
});
```

- [ ] **Step 2: Add failing invalid-shape tests**

In `test/agent-analysis.test.ts`, add these tests after the existing parser tests and before the `isAgentQuestionResponse` tests:

```ts
test("parseAgentResponse rejects question responses with non-string questions", () => {
  assert.throws(
    () => parseAgentResponse("{\"hasQuestions\":true,\"questions\":42}"),
    /Invalid JSON returned by agent\./
  );
});

test("parseAgentResponse rejects proposal responses missing proposedDescription", () => {
  assert.throws(
    () => parseAgentResponse("{\"hasQuestions\":false,\"proposedTitle\":\"Title\"}"),
    /Invalid JSON returned by agent\./
  );
});

test("parseAgentResponse rejects non-object JSON", () => {
  assert.throws(
    () => parseAgentResponse("\"not an object\""),
    /Invalid JSON returned by agent\./
  );
});
```

- [ ] **Step 3: Run the focused test to verify RED**

Run:

```powershell
npx tsx --test test/agent-analysis.test.ts
```

Expected: FAIL. At least one new invalid-shape test should fail because `parseAgentResponse` currently returns parsed JSON after a type assertion without runtime shape validation.

- [ ] **Step 4: Add local response-shape guards**

In `src/agent-analysis.ts`, add these helpers below `parseAgentResponse`'s import block and above `export function parseAgentResponse`:

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgentResponse(value: unknown): value is AgentResponse {
  if (!isRecord(value)) return false;

  if (value.hasQuestions === true) {
    return typeof value.questions === "string";
  }

  if (value.hasQuestions === false) {
    return typeof value.proposedTitle === "string" && typeof value.proposedDescription === "string";
  }

  return false;
}
```

- [ ] **Step 5: Validate parsed JSON before returning it**

In `src/agent-analysis.ts`, replace the current `try` block inside `parseAgentResponse`:

```ts
  try {
    return JSON.parse(cleaned.trim()) as AgentResponse;
  } catch (err) {
    logger.error("Failed to parse JSON response from agent: " + rawText);
    throw new Error("Invalid JSON returned by agent.");
  }
```

with:

```ts
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.trim());
  } catch (err) {
    logger.error("Failed to parse JSON response from agent: " + rawText);
    throw new Error("Invalid JSON returned by agent.");
  }

  if (!isAgentResponse(parsed)) {
    logger.error("Failed to parse JSON response from agent: " + rawText);
    throw new Error("Invalid JSON returned by agent.");
  }

  return parsed;
```

Keep `isAgentQuestionResponse` unchanged.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
npx tsx --test test/agent-analysis.test.ts
npm test
npm run build
```

Expected: all pass. `test/agent-analysis.test.ts` should include 8 passing tests after this task.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/agent-analysis.ts test/agent-analysis.test.ts
git commit -m "refactor: validate agent responses"
```

---

### Task 2: Lock Existing Webhook Edge Cases With Tests

**Files:**

- Modify: `test/webhook.test.ts`

This task adds characterization tests for existing webhook behavior. These tests may pass immediately because the behavior already exists. If they pass without production changes, commit the tests only.

- [ ] **Step 1: Add type import for the Opencode stub**

At the top of `test/webhook.test.ts`, change:

```ts
import assert from "node:assert/strict";
import test from "node:test";
```

to:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { OpencodeClient } from "@opencode-ai/sdk";
```

- [ ] **Step 2: Use a shared webhook loader in the existing publish test**

In `test/webhook.test.ts`, replace this block in the existing publish test:

```ts
  const gitlab = await import("../src/gitlab.js");
  const webhook = await import("../src/webhook.js");

  await webhook.initBotUser();
```

with:

```ts
  const gitlab = await import("../src/gitlab.js");
  const webhook = await loadWebhookForSimulation();
```

In the existing publish test, replace the third `handleGitlabWebhook` argument:

```ts
    {} as any
```

with:

```ts
    createOpencodeClientStub()
```

- [ ] **Step 3: Add webhook edge-case tests**

In `test/webhook.test.ts`, add these tests after the existing publish test and before `createResponse`:

```ts
test("webhook rejects missing payload details", async () => {
  const webhook = await loadWebhookForSimulation();

  for (const body of [null, { user: { username: "reporter" } }]) {
    const res = createResponse();

    await webhook.handleGitlabWebhook(
      createWebhookRequest(body) as any,
      res as any,
      createOpencodeClientStub()
    );

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: "Bad Request: Missing payload details" });
  }
});

test("webhook rejects issue events missing issue IID or project ID", async () => {
  const webhook = await loadWebhookForSimulation();
  const invalidIssueBodies = [
    {
      object_kind: "issue",
      user: { username: "reporter" },
      project: { id: 12345 },
      object_attributes: {
        action: "open",
        title: "@dev-assist needs context",
        description: "Please check this."
      }
    },
    {
      object_kind: "issue",
      user: { username: "reporter" },
      object_attributes: {
        action: "open",
        title: "@dev-assist needs context",
        description: "Please check this.",
        iid: 1
      }
    }
  ];

  for (const body of invalidIssueBodies) {
    const res = createResponse();

    await webhook.handleGitlabWebhook(
      createWebhookRequest(body) as any,
      res as any,
      createOpencodeClientStub()
    );

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: "Missing issue IID or Project ID" });
  }
});

test("webhook ignores events triggered by the bot user", async () => {
  const webhook = await loadWebhookForSimulation();
  const res = createResponse();

  await webhook.handleGitlabWebhook(
    createWebhookRequest({
      object_kind: "issue",
      user: { username: "dev-assist-bot" },
      project: { id: 12345 },
      object_attributes: {
        action: "open",
        title: "@dev-assist needs context",
        description: "Please check this.",
        iid: 1
      }
    }) as any,
    res as any,
    createOpencodeClientStub()
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: "Ignored: Event triggered by bot itself" });
});

test("webhook ignores unhandled event kinds", async () => {
  const webhook = await loadWebhookForSimulation();
  const res = createResponse();

  await webhook.handleGitlabWebhook(
    createWebhookRequest({
      object_kind: "merge_request",
      user: { username: "reporter" }
    }) as any,
    res as any,
    createOpencodeClientStub()
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: "Event ignored" });
});

test("webhook responds immediately to non-publish dev-assist note events", async () => {
  const webhook = await loadWebhookForSimulation();
  const res = createResponse();

  await webhook.handleGitlabWebhook(
    createWebhookRequest({
      object_kind: "note",
      user: { username: "reporter" },
      project: { id: 12345 },
      issue: { iid: 1 },
      object_attributes: {
        noteable_type: "Issue",
        note: "@dev-assist can you review the latest comments?"
      }
    }) as any,
    res as any,
    createOpencodeClientStub()
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: "Analyzing discussion..." });
});
```

- [ ] **Step 4: Add local test helpers**

In `test/webhook.test.ts`, add these helper functions below `createResponse` and above `waitFor`:

```ts
async function loadWebhookForSimulation() {
  process.env.IS_SIMULATION = "true";
  const webhook = await import("../src/webhook.js");
  await webhook.initBotUser();
  return webhook;
}

function createWebhookRequest(body: unknown) {
  return {
    headers: {},
    body
  };
}

function createOpencodeClientStub(): OpencodeClient {
  return {
    session: {
      create: async () => ({ data: { id: "test-session" } }),
      prompt: async () => ({
        data: {
          parts: [
            {
              type: "text",
              text: "{\"hasQuestions\":true,\"questions\":\"What happened?\"}"
            }
          ]
        }
      }),
      delete: async () => ({ data: {} })
    }
  } as unknown as OpencodeClient;
}
```

- [ ] **Step 5: Run the focused webhook test**

Run:

```powershell
npx tsx --test test/webhook.test.ts
```

Expected: PASS. These tests lock current behavior, so passing immediately is acceptable. If any assertion fails, do not change production behavior until the failure is compared against the Phase 3 spec.

- [ ] **Step 6: Run full verification**

Run:

```powershell
npm test
npm run build
```

Expected: both pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add test/webhook.test.ts
git commit -m "test: cover webhook edge cases"
```

---

### Task 3: Final Phase 3 Verification And Audit

**Files:**

- No source changes expected unless verification reveals a Phase 3 defect.

- [ ] **Step 1: Run targeted verification**

Run:

```powershell
npx tsx --test test/agent-analysis.test.ts
npx tsx --test test/webhook.test.ts
```

Expected: both pass.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
npm run build
```

Expected: both pass.

- [ ] **Step 3: Confirm no new dependencies or out-of-scope files changed**

Run:

```powershell
git diff --stat HEAD~2..HEAD
git status --short
```

Expected:

- Recent Phase 3 commits touch only `src/agent-analysis.ts`, `test/agent-analysis.test.ts`, and `test/webhook.test.ts`.
- `package.json` and lockfiles are unchanged.
- `git status --short` may still show the pre-existing unrelated `.env` and `.codex-remote-attachments/`, but no unstaged Phase 3 source or test changes.

- [ ] **Step 4: Review behavior-sensitive text**

Run:

```powershell
rg -n "Invalid JSON returned by agent\\.|Bad Request: Missing payload details|Missing issue IID or Project ID|Ignored: Event triggered by bot itself|Event ignored|Analyzing discussion" src test
```

Expected:

- The same response/error strings remain in `src/agent-analysis.ts` and `src/webhook.ts`.
- New references in tests assert those existing strings.

- [ ] **Step 5: Commit only if fixes were needed**

If Step 1 through Step 4 required a small fix, run:

```powershell
git add src/agent-analysis.ts test/agent-analysis.test.ts test/webhook.test.ts
git commit -m "fix: complete phase 3 validation"
```

If no fix was needed, do not create an empty commit.
