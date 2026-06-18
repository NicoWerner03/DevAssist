import assert from "node:assert/strict";
import test from "node:test";

test("publish restores issue screenshots next to their matching proposal description context", async () => {
  process.env.IS_SIMULATION = "true";

  const gitlab = await import("../src/gitlab.js");
  const webhook = await import("../src/webhook.js");

  await webhook.initBotUser();

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
    {} as any
  );

  await waitFor(async () => {
    const issue = await gitlab.getIssue(12345, 1);
    return issue.title === "Login dialog opens without fields";
  });

  const issue = await gitlab.getIssue(12345, 1);
  assert.equal(
    issue.description,
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

async function waitFor(predicate: () => Promise<boolean>) {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  assert.fail("Timed out waiting for async publish command");
}
