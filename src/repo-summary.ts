import * as fs from "fs";
import * as path from "path";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { getProject, getRepositoryFile, getRepositoryLanguages, getRepositoryTree } from "./gitlab.js";
import logger from "./logger.js";
import { joinTextParts } from "./opencode-parts.js";
import type { GitlabRepoTreeItem, OpencodeResponsePart } from "./types.js";

/**
 * Per-project repository summary provider (Variant A).
 *
 * The repository data for a given GitLab project is fetched via the GitLab API
 * (glab): project metadata, language breakdown, the file tree, and a curated
 * set of key files. That data is handed to the Opencode `repo-summary` agent,
 * which synthesizes a summary (technology stack, project structure, key
 * commands, architecture, important files, conventions). Summaries are cached
 * in memory per project and also written to disk (see REPO_SUMMARY_DIR).
 *
 * Triggers:
 * - lazily on the first issue analysis for a project (see ensureRepositorySummary)
 * - refreshed after every merged merge request for that project
 */

// Root-level files worth reading in full to understand a repository.
const KEY_FILES = [
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "Cargo.toml",
  "composer.json",
  "Gemfile",
  "README.md",
  "README",
  "CONTRIBUTING.md",
  "CLAUDE.md",
  "AGENTS.md",
  ".editorconfig",
  "Makefile"
];

const MAX_TREE_ENTRIES = 300;
const MAX_FILE_CHARS = 8000;
const MAX_KEY_FILES = 8;

const cachedSummaries = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

function key(projectId: string | number): string {
  return String(projectId);
}

/**
 * Returns the cached summary for a project, or null if none exists yet.
 */
export function getRepositorySummary(projectId: string | number): string | null {
  return cachedSummaries.get(key(projectId)) ?? null;
}

/**
 * Overwrites the cached summary for a project. Passing null/blank clears it.
 */
export function setRepositorySummary(projectId: string | number, summary: string | null): void {
  const trimmed = summary && summary.trim() ? summary.trim() : null;
  if (trimmed) {
    cachedSummaries.set(key(projectId), trimmed);
  } else {
    cachedSummaries.delete(key(projectId));
  }
}

/**
 * Formats the cached summary of a project for inclusion in an agent prompt.
 */
export function formatRepositorySummaryForPrompt(projectId: string | number): string {
  return getRepositorySummary(projectId) ?? "(No repository summary is available yet.)";
}

function getSummaryFilePath(projectId: string | number): string {
  const dir = process.env.REPO_SUMMARY_DIR || path.join(process.cwd(), ".dev-assist");
  const safeId = key(projectId).replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(dir, `repo-summary-${safeId}.md`);
}

function persistRepositorySummary(projectId: string | number, summary: string): void {
  if (process.env.DISABLE_REPO_SUMMARY_FILE === "true") return;

  const filePath = getSummaryFilePath(projectId);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, summary, "utf8");
    logger.info(`[REPO-SUMMARY] Wrote repository summary to ${filePath}`);
  } catch (err) {
    logger.error(`[REPO-SUMMARY] Failed to write summary to ${filePath}: ` + (err as Error).message);
  }
}

function formatLanguages(languages: Record<string, number>): string {
  const entries = Object.entries(languages);
  if (entries.length === 0) return "Unknown";
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([name, pct]) => `${name} ${pct}%`)
    .join(", ");
}

/**
 * Fetches repository data for a project via the GitLab API and assembles it into
 * a single text blob to feed to the summarization agent.
 */
async function collectRepositoryContext(projectId: string | number): Promise<string> {
  const project = await getProject(projectId).catch(err => {
    logger.warn(`[REPO-SUMMARY] Could not fetch project ${projectId}: ` + (err as Error).message);
    return undefined;
  });
  const ref = project?.default_branch;

  const [languages, tree] = await Promise.all([
    getRepositoryLanguages(projectId),
    getRepositoryTree(projectId, ref)
  ]);

  const treePaths = tree
    .filter(item => item.path)
    .map((item: GitlabRepoTreeItem) => (item.type === "tree" ? `${item.path}/` : item.path));
  const truncatedTree = treePaths.slice(0, MAX_TREE_ENTRIES);
  const treeTruncatedNote =
    treePaths.length > MAX_TREE_ENTRIES ? `\n… (${treePaths.length - MAX_TREE_ENTRIES} more entries omitted)` : "";

  const rootPaths = new Set(tree.filter(i => i.type !== "tree").map(i => i.path));
  const filesToFetch = KEY_FILES.filter(name => rootPaths.has(name)).slice(0, MAX_KEY_FILES);

  const fetchedFiles = await Promise.all(
    filesToFetch.map(async name => {
      const content = await getRepositoryFile(projectId, name, ref);
      if (content === null) return null;
      const clipped =
        content.length > MAX_FILE_CHARS ? `${content.slice(0, MAX_FILE_CHARS)}\n… (truncated)` : content;
      return `=== ${name} ===\n${clipped}`;
    })
  );
  const keyFileBlob = fetchedFiles.filter(Boolean).join("\n\n") || "(No key files could be read.)";

  return [
    `Project name: ${project?.name ?? "Unknown"}`,
    `Project description: ${project?.description || "None"}`,
    `Default branch: ${ref || "Unknown"}`,
    `Languages: ${formatLanguages(languages)}`,
    "",
    `Repository file tree (${truncatedTree.length} of ${treePaths.length} entries):`,
    truncatedTree.join("\n") + treeTruncatedNote,
    "",
    "Key file contents:",
    keyFileBlob
  ].join("\n");
}

/**
 * Generates a fresh summary for a project by fetching its repository data and
 * asking the Opencode agent to synthesize it. Throws on failure.
 */
export async function generateRepositorySummary(
  projectId: string | number,
  opencodeClient: OpencodeClient
): Promise<string> {
  logger.info(`[REPO-SUMMARY] Generating repository summary for project ${projectId}...`);

  const context = await collectRepositoryContext(projectId);

  const sessionRes = await opencodeClient.session.create();
  if (!sessionRes.data || !sessionRes.data.id) {
    throw new Error("Failed to create Opencode session for repository summary: no session ID returned");
  }
  const sessionId = sessionRes.data.id;

  try {
    const promptText = `Produce the repository summary now, following your instructions and section structure exactly. Base every statement strictly on the repository data provided below. Return only the Markdown summary.

--- REPOSITORY DATA ---
${context}
--- END REPOSITORY DATA ---`;

    const promptRes = await opencodeClient.session.prompt({
      path: { id: sessionId },
      body: {
        agent: "repo-summary",
        parts: [{ type: "text", text: promptText }]
      }
    });

    if (!promptRes.data || !promptRes.data.parts) {
      throw new Error("Failed to get repository summary from Opencode session: no parts returned.");
    }

    const summary = joinTextParts(promptRes.data.parts as OpencodeResponsePart[]).trim();
    if (!summary) {
      throw new Error("Opencode returned an empty repository summary.");
    }

    logger.info(`[REPO-SUMMARY] Generated repository summary for project ${projectId} (${summary.length} chars).`);
    return summary;
  } finally {
    await opencodeClient.session.delete({ path: { id: sessionId } }).catch(err => {
      logger.error(`[REPO-SUMMARY] Failed to delete session ${sessionId}: ` + err.message);
    });
  }
}

/**
 * Generates a fresh summary for a project and updates the cache + disk. On
 * failure the previous summary is kept and returned. Concurrent calls for the
 * same project share a single in-flight generation.
 */
export async function refreshRepositorySummary(
  projectId: string | number,
  opencodeClient: OpencodeClient
): Promise<string | null> {
  const cacheKey = key(projectId);
  const existing = inFlight.get(cacheKey);
  if (existing) {
    logger.debug(`[REPO-SUMMARY] Refresh already in progress for project ${projectId}; awaiting it.`);
    return existing;
  }

  const task = (async () => {
    try {
      const summary = await generateRepositorySummary(projectId, opencodeClient);
      setRepositorySummary(projectId, summary);
      const stored = getRepositorySummary(projectId);
      if (stored) persistRepositorySummary(projectId, stored);
      return stored;
    } catch (err) {
      logger.error(`[REPO-SUMMARY] Failed to refresh summary for project ${projectId}: ` + (err as Error).message);
      return getRepositorySummary(projectId); // keep whatever we had before
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, task);
  return task;
}

/**
 * Ensures a summary exists for a project, generating it if the cache is empty.
 * Used before an issue analysis so the summary can be attached to the prompt.
 */
export async function ensureRepositorySummary(
  projectId: string | number,
  opencodeClient: OpencodeClient
): Promise<string | null> {
  const cached = getRepositorySummary(projectId);
  if (cached) return cached;
  return refreshRepositorySummary(projectId, opencodeClient);
}
