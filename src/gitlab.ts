import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import logger from "./logger.js";
import type { GitlabComment, GitlabIssue, GitlabProjectInfo, GitlabRepoTreeItem } from "./types.js";

// Mock repository data used when IS_SIMULATION=true.
const mockProject: GitlabProjectInfo = {
  id: 12345,
  name: "mock-project",
  description: "A mock project for simulation.",
  default_branch: "main"
};
const mockTree: GitlabRepoTreeItem[] = [
  { path: "package.json", type: "blob", name: "package.json" },
  { path: "README.md", type: "blob", name: "README.md" },
  { path: "src", type: "tree", name: "src" },
  { path: "src/index.ts", type: "blob", name: "index.ts" }
];
const mockFiles: Record<string, string> = {
  "package.json": '{"name":"mock-project","scripts":{"build":"tsc","test":"node --test"}}',
  "README.md": "# Mock Project\nA simulated repository."
};

// Simulation State
let mockComments: GitlabComment[] = [];
let mockIssue: GitlabIssue = {
  title: "Bug during login with OAuth @dev-assist",
  description: "When I click on login, nothing happens. Please fix.",
  author: { username: "nico03werner" }
};

// Helper to run a command and return stdout/stderr
function runCommand(command: string): Promise<string> {
  logger.info(`[GLAB] Executing: ${command}`);
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Command failed: ${command}\nError: ${error.message}\nStderr: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Helper to run a glab api command with a JSON payload file
async function runGlabWithPayload(
  endpoint: string,
  method: "POST" | "PUT",
  payload: Record<string, unknown>
): Promise<string> {
  const tempFileName = `.tmp-glab-${Math.random().toString(36).substring(7)}.json`;
  const tempFilePath = path.join(process.cwd(), tempFileName);
  logger.info(`[GLAB] Creating temp payload file: ${tempFileName}`);

  try {
    fs.writeFileSync(tempFilePath, JSON.stringify(payload), "utf8");
    const cmd = `glab api -X ${method} "${endpoint}" -H "Content-Type: application/json" --input "${tempFilePath}"`;
    return await runCommand(cmd);
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (err) {
      logger.error(`Failed to clean up temp file ${tempFilePath}: ` + (err as Error).message);
    }
  }
}

/**
 * Gets the username of the currently logged-in GitLab user.
 */
export async function getGitlabUser(): Promise<string> {
  if (process.env.IS_SIMULATION === "true") {
    return "dev-assist-bot";
  }

  try {
    const output = await runCommand("glab api user");
    const user = JSON.parse(output) as { username: string };
    return user.username;
  } catch (error) {
    logger.error("Error fetching GitLab user: " + (error as Error).message);
    throw error;
  }
}

/**
 * Fetches issue details.
 */
export async function getIssue(projectId: string | number, issueIid: number): Promise<GitlabIssue> {
  if (process.env.IS_SIMULATION === "true") {
    return mockIssue;
  }

  const endpoint = `projects/${encodeURIComponent(projectId)}/issues/${issueIid}`;
  try {
    const output = await runCommand(`glab api "${endpoint}"`);
    return JSON.parse(output) as GitlabIssue;
  } catch (error) {
    logger.error(`Error fetching issue ${issueIid} from project ${projectId}: ` + (error as Error).message);
    throw error;
  }
}

/**
 * Fetches all comments (notes) for a specific issue.
 */
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

/**
 * Adds a new comment (note) to a specific issue.
 */
export async function postIssueComment(projectId: string | number, issueIid: number, body: string): Promise<GitlabComment> {
  if (process.env.IS_SIMULATION === "true") {
    const newComment = {
      id: Math.floor(Math.random() * 10000),
      body,
      author: { username: "dev-assist-bot" }
    };
    mockComments.push(newComment);
    logger.info(`[GLAB SIMULATION] Bot Posted Comment: \n${body}`);
    return newComment;
  }

  const endpoint = `projects/${encodeURIComponent(projectId)}/issues/${issueIid}/notes`;
  try {
    const output = await runGlabWithPayload(endpoint, 'POST', { body });
    return JSON.parse(output) as GitlabComment;
  } catch (error) {
    logger.error(`Error posting comment to issue ${issueIid}: ` + (error as Error).message);
    throw error;
  }
}

/**
 * Updates an issue's title and description.
 */
export async function updateIssue(
  projectId: string | number,
  issueIid: number,
  title: string,
  description: string
): Promise<GitlabIssue> {
  if (process.env.IS_SIMULATION === "true") {
    mockIssue.title = title;
    mockIssue.description = description;
    logger.info(`[GLAB SIMULATION] Issue Updated:\nTitle: ${title}\nDescription:\n${description}`);
    return mockIssue;
  }

  const endpoint = `projects/${encodeURIComponent(projectId)}/issues/${issueIid}`;
  try {
    const output = await runGlabWithPayload(endpoint, 'PUT', { title, description });
    return JSON.parse(output) as GitlabIssue;
  } catch (error) {
    logger.error(`Error updating issue ${issueIid}: ` + (error as Error).message);
    throw error;
  }
}

/**
 * Deletes a comment (note) from an issue.
 */
export async function deleteIssueComment(projectId: string | number, issueIid: number, noteId: number): Promise<void> {
  if (process.env.IS_SIMULATION === "true") {
    logger.info(`[GLAB SIMULATION] Deleted comment #${noteId}`);
    mockComments = mockComments.filter(c => c.id !== noteId);
    return;
  }

  const endpoint = `projects/${encodeURIComponent(projectId)}/issues/${issueIid}/notes/${noteId}`;
  try {
    await runCommand(`glab api -X DELETE "${endpoint}"`);
  } catch (error) {
    logger.error(`Failed to delete comment ${noteId} on issue ${issueIid}: ` + (error as Error).message);
  }
}

/**
 * Fetches basic project metadata (name, description, default branch).
 */
export async function getProject(projectId: string | number): Promise<GitlabProjectInfo> {
  if (process.env.IS_SIMULATION === "true") {
    return mockProject;
  }

  const endpoint = `projects/${encodeURIComponent(projectId)}`;
  const output = await runCommand(`glab api "${endpoint}"`);
  return JSON.parse(output) as GitlabProjectInfo;
}

/**
 * Fetches the language breakdown of a project (e.g. { "TypeScript": 80.5 }).
 */
export async function getRepositoryLanguages(projectId: string | number): Promise<Record<string, number>> {
  if (process.env.IS_SIMULATION === "true") {
    return { TypeScript: 100 };
  }

  const endpoint = `projects/${encodeURIComponent(projectId)}/languages`;
  try {
    const output = await runCommand(`glab api "${endpoint}"`);
    return JSON.parse(output) as Record<string, number>;
  } catch (error) {
    logger.error(`Error fetching languages for project ${projectId}: ` + (error as Error).message);
    return {};
  }
}

/**
 * Fetches the (recursive) repository file tree for the given ref.
 */
export async function getRepositoryTree(
  projectId: string | number,
  ref?: string
): Promise<GitlabRepoTreeItem[]> {
  if (process.env.IS_SIMULATION === "true") {
    return mockTree;
  }

  const refQuery = ref ? `&ref=${encodeURIComponent(ref)}` : "";
  const endpoint = `projects/${encodeURIComponent(projectId)}/repository/tree?recursive=true&per_page=100${refQuery}`;
  try {
    const output = await runCommand(`glab api "${endpoint}" --paginate`);
    try {
      return JSON.parse(output) as GitlabRepoTreeItem[];
    } catch {
      // Fall back to concatenated JSON arrays / NDJSON produced by --paginate.
      return output
        .split("\n")
        .filter(line => line.trim())
        .flatMap(line => {
          const parsed = JSON.parse(line) as GitlabRepoTreeItem | GitlabRepoTreeItem[];
          return Array.isArray(parsed) ? parsed : [parsed];
        });
    }
  } catch (error) {
    logger.error(`Error fetching repository tree for project ${projectId}: ` + (error as Error).message);
    return [];
  }
}

/**
 * Fetches the raw contents of a single repository file. Returns null if the
 * file does not exist or cannot be read.
 */
export async function getRepositoryFile(
  projectId: string | number,
  filePath: string,
  ref?: string
): Promise<string | null> {
  if (process.env.IS_SIMULATION === "true") {
    return mockFiles[filePath] ?? null;
  }

  // GitLab requires the file path to be fully URL-encoded (slashes -> %2F).
  const encodedPath = encodeURIComponent(filePath);
  const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const endpoint = `projects/${encodeURIComponent(projectId)}/repository/files/${encodedPath}/raw${refQuery}`;
  try {
    return await runCommand(`glab api "${endpoint}"`);
  } catch (error) {
    logger.debug(`Could not read file ${filePath} from project ${projectId}: ` + (error as Error).message);
    return null;
  }
}
