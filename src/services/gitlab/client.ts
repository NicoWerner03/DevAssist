import { execFile } from 'child_process';
import { promisify } from 'util';
import { getConfig } from '../../config.js';
import logger from '../../utils/logger.js';

const execFileAsync = promisify(execFile);

export interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  description?: string;
  web_url?: string;
  [key: string]: unknown;
}

export interface GitLabNote {
  id: number;
  body: string;
  author?: { username?: string };
  system?: boolean;
  [key: string]: unknown;
}

export interface GitLabClient {
  getIssue(projectId: string | number, issueIid: string | number): Promise<GitLabIssue>;
  listNotes(projectId: string | number, issueIid: string | number): Promise<GitLabNote[]>;
  createNote(projectId: string | number, issueIid: string | number, body: string): Promise<GitLabNote>;
  deleteNote(projectId: string | number, issueIid: string | number, noteId: number): Promise<void>;
  updateIssueDescription(projectId: string | number, issueIid: string | number, description: string): Promise<void>;

  /**
   * General issue update supporting all common GitLab fields via glab --field style
   * (when no GITLAB_TOKEN) or JSON PUT (when token present).
   *
   * Examples:
   *   updateIssue(pid, iid, { state_event: 'close', add_labels: 'done,reviewed' })
   *   updateIssue(pid, iid, { title: 'New title', assignee_ids: [42] })
   *   updateIssue(pid, iid, { remove_labels: 'old', state_event: 'reopen' })
   */
  updateIssue(
    projectId: string | number,
    issueIid: string | number,
    updates: Record<string, any>
  ): Promise<GitLabIssue>;
}

function getBaseUrl(): string {
  const cfg = getConfig();
  return cfg.gitlab.baseUrl.replace(/\/$/, '');
}

async function glabApi(args: string[]): Promise<any> {
  const cfg = getConfig();

  // Normalize paths: ensure we use /projects/... form (GitLab REST requires it).
  // glab accepts both "projects/..." and "/projects/...". We strip leading / for cleaner logs
  // and to match the examples you showed (glab api projects/<id>/issues/<iid>/...).
  const normalizedArgs = args.map((arg) => {
    if (arg.startsWith('/projects/')) return arg.slice(1);
    if (arg.startsWith('/') && /^\/\d+/.test(arg)) {
      // Old/broken form without /projects/ — fix it (should no longer happen)
      return `projects${arg}`;
    }
    return arg;
  });

  const cmdArgs = ['api', ...normalizedArgs, '--output', 'json'];
  let glabHostname = cfg.gitlab.glabHostname;
  if (glabHostname) {
    // Always sanitize: glab --hostname wants bare host only (e.g. "gitlab.com")
    glabHostname = String(glabHostname)
      .replace(/^https?:\/\//i, '')
      .replace(/\/$/, '')
      .trim();
  }

  if (glabHostname && !glabHostname.includes('://') && glabHostname !== 'gitlab.com') {
    cmdArgs.push('--hostname', glabHostname);
  } else if (glabHostname && glabHostname === 'gitlab.com') {
    // gitlab.com is the default for glab, no need to specify --hostname
  } else if (glabHostname) {
    logger.warn('GITLAB_GLAB_HOSTNAME looks invalid, ignoring it. Use bare hostname like "gitlab.com"');
  }

  logger.debug('glab api call', { args: cmdArgs.filter(a => !a.includes('token')) });
  try {
    const { stdout, stderr } = await execFileAsync('glab', cmdArgs, { maxBuffer: 10 * 1024 * 1024 });
    if (stderr && stderr.trim()) {
      logger.warn('glab stderr', { stderr: stderr.trim().slice(0, 300) });
    }
    return JSON.parse(stdout || 'null');
  } catch (err: any) {
    const msg = err?.stderr?.toString() || err.message || String(err);
    logger.error('glab api failed', { command: `glab ${cmdArgs.join(' ')}`, error: msg.trim() });
    throw new Error(`glab command failed: ${msg.trim()}`);
  }
}

async function tokenApi(path: string, init: RequestInit = {}): Promise<any> {
  const cfg = getConfig();
  const token = cfg.gitlab.token;
  if (!token) throw new Error('GITLAB_TOKEN not configured for token-based client');

  const url = `${getBaseUrl()}/api/v4${path}`;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> || {}),
    'PRIVATE-TOKEN': token,
  };

  logger.debug('token api call', { path, method: init.method || 'GET' });

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitLab API ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function createGitLabClient(): GitLabClient {
  const cfg = getConfig();
  const useGlab = cfg.gitlab.useGlab;

  if (useGlab) {
    logger.info('GitLab client: using glab (primary path) – the local `glab` user must have at least Reporter access via its token. Re-run `glab auth login` if you get 404s.');
  } else if (cfg.gitlab.token) {
    logger.info('GitLab client: using token (PRIVATE-TOKEN)');
  } else {
    logger.warn('GitLab client: no token and GITLAB_USE_GLAB not true – writes will fail');
  }

  return {
    async getIssue(projectId, issueIid) {
      const pid = encodeURIComponent(String(projectId));
      const path = `/projects/${pid}/issues/${issueIid}`;
      if (useGlab) {
        return glabApi([path]);
      }
      return tokenApi(path);
    },

    async listNotes(projectId, issueIid) {
      const pid = encodeURIComponent(String(projectId));
      const path = `/projects/${pid}/issues/${issueIid}/notes?per_page=100&sort=asc`;
      if (useGlab) {
        return glabApi([path]);
      }
      return tokenApi(path);
    },

    async createNote(projectId, issueIid, body) {
      const pid = encodeURIComponent(String(projectId));
      const path = `/projects/${pid}/issues/${issueIid}/notes`;
      const payload = JSON.stringify({ body });
      if (useGlab) {
        // glab api supports --input - for body, but for simplicity we use -X POST -d
        // Use token-style for create when not pure glab? For consistency use exec with proper flags.
        // Simpler: fall back to token if we have it, otherwise try glab with -d (limited).
        if (cfg.gitlab.token) {
          return tokenApi(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          });
        }
        // Use --field (form data) exactly as recommended for glab api note creation.
        // The body value is passed after = ; execFile passes the whole token literally (supports newlines in practice).
        const res = await glabApi([path, '-X', 'POST', '--field', `body=${body}`]);
        return res;
      }
      return tokenApi(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
    },

    async deleteNote(projectId, issueIid, noteId) {
      const pid = encodeURIComponent(String(projectId));
      const path = `/projects/${pid}/issues/${issueIid}/notes/${noteId}`;
      if (useGlab) {
        if (cfg.gitlab.token) {
          await tokenApi(path, { method: 'DELETE' });
          return;
        }
        await glabApi(['-X', 'DELETE', path]);
        return;
      }
      await tokenApi(path, { method: 'DELETE' });
    },

    async updateIssue(projectId, issueIid, updates = {}) {
      // Single implementation lives in updateIssueImpl below (avoids duplication + this-binding issues)
      return updateIssueImpl(projectId, issueIid, updates);
    },

    async updateIssueDescription(projectId, issueIid, description) {
      // Delegate to the general method (keeps backward compat for existing callers)
      return updateIssueImpl(projectId, issueIid, { description });
    },
  };
}

// Local implementation so we can share logic between updateIssue and the legacy description updater
// (plain object literal methods don't have a usable `this`).
async function updateIssueImpl(projectId: string | number, issueIid: string | number, updates: Record<string, any>) {
  const cfg = getConfig();
  const useGlab = cfg.gitlab.useGlab;

  const pid = encodeURIComponent(String(projectId));
  const path = `/projects/${pid}/issues/${issueIid}`;

  // Normalize updates for labels/assignees (same rules as the public method)
  const normalized: Record<string, any> = {};
  for (const [key, rawValue] of Object.entries(updates || {})) {
    if (rawValue === undefined) continue;

    let value = rawValue;
    if (Array.isArray(value)) {
      if (['labels', 'add_labels', 'remove_labels'].includes(key)) {
        value = value.join(',');
      } else if (key === 'assignee_ids') {
        value = value;
      } else {
        value = value.join(',');
      }
    }

    if (value === null || value === '') {
      if (key === 'assignee_ids') {
        normalized[key] = [];
      } else {
        normalized[key] = value;
      }
    } else {
      normalized[key] = value;
    }
  }

  if (useGlab) {
    if (cfg.gitlab.token) {
      return tokenApi(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalized),
      });
    }

    // Pure glab: --field style per your examples
    const fieldArgs: string[] = [];
    for (const [key, value] of Object.entries(normalized)) {
      if (value === undefined) continue;

      if (key === 'assignee_ids' && Array.isArray(value)) {
        if (value.length === 0) {
          fieldArgs.push('--field', 'assignee_ids=0');
        } else {
          for (const id of value) {
            fieldArgs.push('--field', `assignee_ids[]=${id}`);
          }
        }
      } else {
        fieldArgs.push('--field', `${key}=${value}`);
      }
    }

    return glabApi([path, '-X', 'PUT', ...fieldArgs]);
  }

  return tokenApi(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalized),
  });
}
