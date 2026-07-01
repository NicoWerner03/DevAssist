import assert from "node:assert/strict";
import test from "node:test";
import type { OpencodeClient } from "@opencode-ai/sdk";

test("publish prepends visible ticket metadata and restores issue screenshots", async () => {
  const gitlab = await import("../src/gitlab.js");
  const webhook = await loadWebhookForSimulation();

  await gitlab.updateIssue(
    12345,
    1,
    "Original title",
    [
      "## Reproduction",
      "The login dialog opens without any fields.",
      "![Empty login dialog](/uploads/empty-login.png)",
      "",
      "## Expected behavior",
      "The form fields should be visible."
    ].join("\n")
  );

  await gitlab.postIssueComment(
    12345,
    1,
    [
      "### Proposal from @dev-assist",
      "I have gathered all the necessary details. Here is my structured proposal for the ticket:",
      "",
      "**Proposed Title:**",
      "<!-- proposed-title-start -->",
      "Login dialog opens without fields",
      "<!-- proposed-title-end -->",
      "",
      "**Proposed Description:**",
      "<!-- proposed-description-start -->",
      "## Reproduction",
      "The login dialog opens without any fields.",
      "",
      "## Expected behavior",
      "The form fields should be visible.",
      "<!-- proposed-description-end -->"
    ].join("\n")
  );

  const res = createResponse();
  await webhook.handleGitlabWebhook(
    {
      headers: {},
      body: {
        object_kind: "note",
        user: { username: "reporter" },
        project: { id: 12345 },
        issue: { iid: 1 },
        object_attributes: {
          noteable_type: "Issue",
          note: "@dev-assist publish"
        }
      }
    } as any,
    res as any,
    createOpencodeClientStub()
  );

  await waitFor(async () => {
    const issue = await gitlab.getIssue(12345, 1);
    return issue.title === "Login dialog opens without fields";
  });

  const issue = await gitlab.getIssue(12345, 1);
  assert.equal(
    issue.description,
    [
      "**Projekt:** 12345  ",
      "**Ticket:** 1",
      "",
      "---",
      "",
      "## Reproduction",
      "The login dialog opens without any fields.",
      "![Empty login dialog](/uploads/empty-login.png)",
      "",
      "## Expected behavior",
      "The form fields should be visible."
    ].join("\n")
  );
});

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

test("webhook refreshes the repository summary when a merge request is merged", async () => {
  const webhook = await loadWebhookForSimulation();
  const res = createResponse();

  await webhook.handleGitlabWebhook(
    createWebhookRequest({
      object_kind: "merge_request",
      user: { username: "reporter" },
      project: { id: 12345 },
      object_attributes: { action: "merge", state: "merged", iid: 7 }
    }) as any,
    res as any,
    createOpencodeClientStub()
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: "Refreshing repository summary..." });
});

test("webhook ignores merge request events that are not merges", async () => {
  const webhook = await loadWebhookForSimulation();
  const res = createResponse();

  await webhook.handleGitlabWebhook(
    createWebhookRequest({
      object_kind: "merge_request",
      user: { username: "reporter" },
      project: { id: 12345 },
      object_attributes: { action: "open", state: "opened", iid: 7 }
    }) as any,
    res as any,
    createOpencodeClientStub()
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: "Event ignored" });
});

test("issue analysis attaches the cached repository summary to the agent prompt", async () => {
  const webhook = await loadWebhookForSimulation();
  const repoSummary = await import("../src/repo-summary.js");
  repoSummary.setRepositorySummary("## Technology Stack\n- REPO_SUMMARY_MARKER");

  let capturedPrompt = "";
  const capturingClient = {
    session: {
      create: async () => ({ data: { id: "capture-session" } }),
      prompt: async ({ body }: any) => {
        capturedPrompt = body.parts.map((p: any) => p.text).join("\n");
        return {
          data: { parts: [{ type: "text", text: "{\"hasQuestions\":true,\"questions\":\"What happened?\"}" }] }
        };
      },
      delete: async () => ({ data: {} })
    }
  } as unknown as OpencodeClient;

  const res = createResponse();
  await webhook.handleGitlabWebhook(
    createWebhookRequest({
      object_kind: "note",
      user: { username: "reporter" },
      project: { id: 12345 },
      issue: { iid: 1 },
      object_attributes: {
        noteable_type: "Issue",
        note: "@dev-assist can you review this?"
      }
    }) as any,
    res as any,
    capturingClient
  );

  await waitFor(async () => capturedPrompt.includes("REPO_SUMMARY_MARKER"));
  assert.ok(capturedPrompt.includes("Repository summary"));
  assert.ok(capturedPrompt.includes("REPO_SUMMARY_MARKER"));
});

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    }
  };
}

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

async function waitFor(predicate: () => Promise<boolean>) {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  assert.fail("Timed out waiting for async publish command");
}
