import assert from "node:assert/strict";
import test, { after } from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { OpencodeClient } from "@opencode-ai/sdk";

// Use GitLab simulation mocks for repository data and persist to a throwaway
// temp directory so tests never hit the network or touch the repo working tree.
process.env.IS_SIMULATION = "true";
const SUMMARY_DIR = path.join(os.tmpdir(), `repo-summary-test-${process.pid}`);
process.env.REPO_SUMMARY_DIR = SUMMARY_DIR;

after(() => {
  try {
    fs.rmSync(SUMMARY_DIR, { recursive: true, force: true });
  } catch {
    /* ignore cleanup errors */
  }
});

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

test("setRepositorySummary stores, trims, and clears per-project summaries", async () => {
  const mod = await import("../src/repo-summary.js");

  mod.setRepositorySummary("p-set", "  ## Technology Stack\n- Node.js  ");
  assert.equal(mod.getRepositorySummary("p-set"), "## Technology Stack\n- Node.js");
  assert.equal(mod.formatRepositorySummaryForPrompt("p-set"), "## Technology Stack\n- Node.js");
  assert.equal(mod.getRepositorySummary("other"), null);

  mod.setRepositorySummary("p-set", null);
  assert.equal(mod.getRepositorySummary("p-set"), null);
  assert.equal(mod.formatRepositorySummaryForPrompt("p-set"), "(No repository summary is available yet.)");

  mod.setRepositorySummary("p-set", "   ");
  assert.equal(mod.getRepositorySummary("p-set"), null);
});

test("generateRepositorySummary passes fetched repo data to the repo-summary agent", async () => {
  const mod = await import("../src/repo-summary.js");
  const stub = createSummaryClientStub("## Technology Stack\n- TypeScript");

  const summary = await mod.generateRepositorySummary("p-gen", stub.client);

  assert.equal(summary, "## Technology Stack\n- TypeScript");
  assert.equal(stub.getLastBody()?.agent, "repo-summary");
  // The prompt should carry the fetched repository data (mock tree + package.json).
  const promptText = stub.getLastBody()?.parts?.map(p => p.text).join("\n") ?? "";
  assert.match(promptText, /REPOSITORY DATA/);
  assert.match(promptText, /package\.json/);
  assert.equal(stub.calls.created, 1);
  assert.equal(stub.calls.deleted, 1);
});

test("refreshRepositorySummary caches on success and keeps the previous summary on failure", async () => {
  const mod = await import("../src/repo-summary.js");

  const ok = createSummaryClientStub("## Architecture\n- Express webhook server");
  const first = await mod.refreshRepositorySummary("p-refresh", ok.client);
  assert.equal(first, "## Architecture\n- Express webhook server");
  assert.equal(mod.getRepositorySummary("p-refresh"), "## Architecture\n- Express webhook server");

  const failing = createSummaryClientStub("ignored", { fail: true });
  const second = await mod.refreshRepositorySummary("p-refresh", failing.client);
  assert.equal(second, "## Architecture\n- Express webhook server"); // previous kept
});

test("ensureRepositorySummary generates only when the cache is empty", async () => {
  const mod = await import("../src/repo-summary.js");

  const first = createSummaryClientStub("## Conventions\n- first");
  const a = await mod.ensureRepositorySummary("p-ensure", first.client);
  assert.equal(a, "## Conventions\n- first");
  assert.equal(first.calls.created, 1);

  // Second call should reuse the cache and not create another session.
  const second = createSummaryClientStub("## Conventions\n- second");
  const b = await mod.ensureRepositorySummary("p-ensure", second.client);
  assert.equal(b, "## Conventions\n- first");
  assert.equal(second.calls.created, 0);
});

test("refreshRepositorySummary persists the summary to a per-project file", async () => {
  const mod = await import("../src/repo-summary.js");
  const ok = createSummaryClientStub("## Conventions\n- PERSISTED_MARKER");

  await mod.refreshRepositorySummary("p-persist", ok.client);

  const written = fs.readFileSync(path.join(SUMMARY_DIR, "repo-summary-p-persist.md"), "utf8");
  assert.match(written, /PERSISTED_MARKER/);
});
