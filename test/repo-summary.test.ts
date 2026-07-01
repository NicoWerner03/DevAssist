import assert from "node:assert/strict";
import test from "node:test";
import type { OpencodeClient } from "@opencode-ai/sdk";

type PromptBody = { agent?: string; parts?: Array<{ type?: string; text?: string }> };

function createSummaryClientStub(summaryText: string, opts: { fail?: boolean } = {}) {
  const calls = { created: 0, deleted: 0 };
  let lastBody: PromptBody | undefined;

  const client = {
    session: {
      create: async () => {
        calls.created++;
        return { data: { id: "sum-session" } };
      },
      prompt: async ({ body }: { body: PromptBody }) => {
        lastBody = body;
        if (opts.fail) throw new Error("boom");
        return { data: { parts: [{ type: "text", text: summaryText }] } };
      },
      delete: async () => {
        calls.deleted++;
        return { data: {} };
      }
    }
  } as unknown as OpencodeClient;

  return { client, calls, getLastBody: () => lastBody };
}

test("setRepositorySummary stores, trims, and clears the summary", async () => {
  const mod = await import("../src/repo-summary.js");

  mod.setRepositorySummary("  ## Technology Stack\n- Node.js  ");
  assert.equal(mod.getRepositorySummary(), "## Technology Stack\n- Node.js");
  assert.equal(mod.formatRepositorySummaryForPrompt(), "## Technology Stack\n- Node.js");

  mod.setRepositorySummary(null);
  assert.equal(mod.getRepositorySummary(), null);
  assert.equal(mod.formatRepositorySummaryForPrompt(), "(No repository summary is available yet.)");

  mod.setRepositorySummary("   ");
  assert.equal(mod.getRepositorySummary(), null);
});

test("generateRepositorySummary uses the repo-summary agent and returns the text", async () => {
  const mod = await import("../src/repo-summary.js");
  const stub = createSummaryClientStub("## Technology Stack\n- TypeScript");

  const summary = await mod.generateRepositorySummary(stub.client);

  assert.equal(summary, "## Technology Stack\n- TypeScript");
  assert.equal(stub.getLastBody()?.agent, "repo-summary");
  assert.equal(stub.calls.created, 1);
  assert.equal(stub.calls.deleted, 1); // session is cleaned up
});

test("refreshRepositorySummary caches on success and keeps the previous summary on failure", async () => {
  const mod = await import("../src/repo-summary.js");

  const ok = createSummaryClientStub("## Architecture\n- Express webhook server");
  const first = await mod.refreshRepositorySummary(ok.client);
  assert.equal(first, "## Architecture\n- Express webhook server");
  assert.equal(mod.getRepositorySummary(), "## Architecture\n- Express webhook server");

  const failing = createSummaryClientStub("ignored", { fail: true });
  const second = await mod.refreshRepositorySummary(failing.client);
  assert.equal(second, "## Architecture\n- Express webhook server"); // previous kept
  assert.equal(mod.getRepositorySummary(), "## Architecture\n- Express webhook server");
});
