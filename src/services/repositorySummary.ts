import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { getConfig } from '../config.js';
import logger from '../utils/logger.js';
import { createGitLabClient, GitLabClient, GitLabRepoTreeItem } from './gitlab/client.js';

const KEY_FILES = [
  'package.json',
  'tsconfig.json',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'Cargo.toml',
  'composer.json',
  'Gemfile',
  'README.md',
  'README',
  'CONTRIBUTING.md',
  'CLAUDE.md',
  'AGENTS.md',
  '.editorconfig',
  'Makefile',
];

const MAX_TREE_ENTRIES = 300;
const MAX_FILE_CHARS = 8000;
const MAX_KEY_FILES = 8;

export type RepositorySummaryGitLabClient = Pick<
  GitLabClient,
  'getProject' | 'getRepositoryLanguages' | 'getRepositoryTree' | 'getRepositoryFile'
>;

type SummarizeRepositoryContext = (context: string) => Promise<string | null>;
type PersistSummary = (projectId: string | number, summary: string) => Promise<void>;

interface RepositorySummaryProviderOptions {
  gitlab?: RepositorySummaryGitLabClient;
  summarizeRepositoryContext?: SummarizeRepositoryContext;
  persistSummary?: PersistSummary;
}

function key(projectId: string | number): string {
  return String(projectId);
}

function formatLanguages(languages: Record<string, number>): string {
  const entries = Object.entries(languages);
  if (entries.length === 0) return 'Unknown';

  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([name, pct]) => `${name} ${pct}%`)
    .join(', ');
}

function getSummaryFilePath(projectId: string | number): string {
  const dir = process.env.REPO_SUMMARY_DIR || path.join(process.cwd(), '.dev-assist');
  const safeId = key(projectId).replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(dir, `repo-summary-${safeId}.md`);
}

async function persistRepositorySummary(projectId: string | number, summary: string): Promise<void> {
  const filePath = getSummaryFilePath(projectId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, summary, 'utf8');
  logger.info('Wrote repository summary file', { path: filePath.replace(process.cwd(), '.') });
}

export async function collectRepositoryContext(
  projectId: string | number,
  gitlab: RepositorySummaryGitLabClient
): Promise<string> {
  const project = await gitlab.getProject(projectId).catch((e: any) => {
    logger.warn('Could not fetch project metadata for repository summary', { projectId, error: e.message });
    return undefined;
  });
  const ref = project?.default_branch;

  const [languages, tree] = await Promise.all([
    gitlab.getRepositoryLanguages(projectId).catch((e: any) => {
      logger.warn('Could not fetch repository languages', { projectId, error: e.message });
      return {};
    }),
    gitlab.getRepositoryTree(projectId, ref).catch((e: any) => {
      logger.warn('Could not fetch repository tree', { projectId, error: e.message });
      return [] as GitLabRepoTreeItem[];
    }),
  ]);

  const treePaths = tree
    .filter(item => item.path)
    .map(item => (item.type === 'tree' ? `${item.path}/` : item.path));
  const truncatedTree = treePaths.slice(0, MAX_TREE_ENTRIES);
  const treeTruncatedNote = treePaths.length > MAX_TREE_ENTRIES
    ? `\n... (${treePaths.length - MAX_TREE_ENTRIES} more entries omitted)`
    : '';

  const rootPaths = new Set(tree.filter(item => item.type !== 'tree').map(item => item.path));
  const filesToFetch = KEY_FILES.filter(name => rootPaths.has(name)).slice(0, MAX_KEY_FILES);
  const fetchedFiles = await Promise.all(
    filesToFetch.map(async (name) => {
      const content = await gitlab.getRepositoryFile(projectId, name, ref);
      if (content === null) return null;
      const clipped = content.length > MAX_FILE_CHARS
        ? `${content.slice(0, MAX_FILE_CHARS)}\n... (truncated)`
        : content;
      return `=== ${name} ===\n${clipped}`;
    })
  );

  const keyFileBlob = fetchedFiles.filter(Boolean).join('\n\n') || '(No key files could be read.)';

  return [
    `Project name: ${project?.name ?? 'Unknown'}`,
    `Project description: ${project?.description || 'None'}`,
    `Default branch: ${ref || 'Unknown'}`,
    `Languages: ${formatLanguages(languages)}`,
    '',
    `Repository file tree (${truncatedTree.length} of ${treePaths.length} entries):`,
    truncatedTree.join('\n') + treeTruncatedNote,
    '',
    'Key file contents:',
    keyFileBlob,
  ].join('\n');
}

export function createRepositorySummaryPrompt(context: string): string {
  return [
    'Produce the repository summary now, following your instructions and section structure exactly.',
    'Base every statement strictly on the repository data provided below. Return only the Markdown summary.',
    '',
    '--- REPOSITORY DATA ---',
    context,
    '--- END REPOSITORY DATA ---',
  ].join('\n');
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

function extractSummaryText(output: string): string {
  const cleaned = stripAnsi(output).trim();
  const candidates: string[] = [cleaned];

  try {
    candidates.push(...collectStrings(JSON.parse(cleaned)));
  } catch {
    for (const line of cleaned.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;
      try {
        candidates.push(...collectStrings(JSON.parse(trimmed)));
      } catch {
        // Ignore non-JSON output lines.
      }
    }
  }

  const markdown = candidates
    .map(candidate => candidate.trim())
    .filter(candidate => candidate.includes('## Technology Stack'))
    .sort((a, b) => b.length - a.length)[0];
  if (markdown) return markdown;

  if (cleaned) return cleaned;
  throw new Error('opencode produced no repository summary output');
}

async function findOpencodeBin(): Promise<string> {
  const npmOpencodeExe = process.platform === 'win32' && process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
    : '';

  if (npmOpencodeExe) {
    try {
      await fs.access(npmOpencodeExe);
      return npmOpencodeExe;
    } catch {
      // Fall through to PATH lookup.
    }
  }

  return process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
}

async function copyPromptIfExists(source: string, target: string): Promise<void> {
  try {
    await fs.copyFile(source, target);
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
}

async function summarizeRepositoryContextWithOpencode(context: string): Promise<string | null> {
  const cfg = getConfig();
  if (cfg.ai.provider !== 'opencode') {
    logger.info('Repository summary skipped because AI_PROVIDER is not opencode', { aiProvider: cfg.ai.provider });
    return null;
  }

  const runtimeDir = path.join(process.cwd(), '.opencode', 'runtime');
  const runtimePromptDir = path.join(runtimeDir, '.opencode', 'prompts');
  await fs.mkdir(runtimePromptDir, { recursive: true });
  await fs.copyFile(path.join(process.cwd(), 'opencode.json'), path.join(runtimeDir, 'opencode.json'));
  await copyPromptIfExists(
    path.join(process.cwd(), '.opencode', 'prompts', 'requirement-analysis.md'),
    path.join(runtimePromptDir, 'requirement-analysis.md')
  );
  await copyPromptIfExists(
    path.join(process.cwd(), '.opencode', 'prompts', 'repo-summary.md'),
    path.join(runtimePromptDir, 'repo-summary.md')
  );
  const contextFile = path.join(runtimeDir, 'repo-summary-context.txt');
  await fs.writeFile(contextFile, context, 'utf8');

  const bin = await findOpencodeBin();
  const configuredModel = cfg.ai.model || 'xai/grok-3-latest';
  const effectiveModel = configuredModel.includes('/') ? configuredModel : `xai/${configuredModel}`;
  const runArgs = [
    'run',
    '--dir',
    runtimeDir,
    '--format',
    'json',
    '--agent',
    'repo-summary',
    '--model',
    effectiveModel,
    '--file',
    contextFile,
    'Produce the repository summary now from the attached repository context file.',
  ];
  if (cfg.ai.reasoningEffort) {
    runArgs.push('--variant', cfg.ai.reasoningEffort);
  }

  logger.info('Calling opencode for repository summary', {
    model: effectiveModel,
    timeoutMs: cfg.ai.timeoutMs,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(bin, runArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: process.platform === 'win32' && /\.cmd$/i.test(bin),
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', d => { stdout += d.toString(); });
    child.stderr?.on('data', d => { stderr += d.toString(); });
    child.stdin.end();

    const timeout = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      reject(new Error(`opencode repository summary timed out after ${cfg.ai.timeoutMs}ms`));
    }, cfg.ai.timeoutMs);

    child.on('error', (err: any) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (stderr.trim()) {
        logger.warn('opencode repository summary stderr', { stderr: stderr.trim().slice(0, 500) });
      }
      if (code !== 0) {
        logger.warn('opencode repository summary exited with non-zero code', { code });
      }

      try {
        resolve(extractSummaryText(stdout));
      } catch (e) {
        reject(e);
      }
    });
  });
}

export function createRepositorySummaryProvider(options: RepositorySummaryProviderOptions = {}) {
  const gitlab = options.gitlab ?? createGitLabClient();
  const summarizeRepositoryContext = options.summarizeRepositoryContext ?? summarizeRepositoryContextWithOpencode;
  const persistSummary = options.persistSummary ?? persistRepositorySummary;
  const cachedSummaries = new Map<string, string>();
  const inFlight = new Map<string, Promise<string | null>>();

  const getRepositorySummary = (projectId: string | number): string | null => {
    return cachedSummaries.get(key(projectId)) ?? null;
  };

  const setRepositorySummary = (projectId: string | number, summary: string | null): void => {
    const trimmed = summary && summary.trim() ? summary.trim() : null;
    if (trimmed) {
      cachedSummaries.set(key(projectId), trimmed);
    } else {
      cachedSummaries.delete(key(projectId));
    }
  };

  const refreshRepositorySummary = async (projectId: string | number): Promise<string | null> => {
    const cacheKey = key(projectId);
    const existing = inFlight.get(cacheKey);
    if (existing) return existing;

    const task = (async () => {
      try {
        const context = await collectRepositoryContext(projectId, gitlab);
        const summary = await summarizeRepositoryContext(context);
        setRepositorySummary(projectId, summary);
        const stored = getRepositorySummary(projectId);
        if (stored) await persistSummary(projectId, stored);
        return stored;
      } catch (e: any) {
        logger.warn('Repository summary refresh failed; continuing without repository summary', {
          projectId,
          error: e.message,
        });
        return getRepositorySummary(projectId);
      } finally {
        inFlight.delete(cacheKey);
      }
    })();

    inFlight.set(cacheKey, task);
    return task;
  };

  const ensureRepositorySummary = async (projectId: string | number): Promise<string | null> => {
    return getRepositorySummary(projectId) ?? refreshRepositorySummary(projectId);
  };

  return {
    getRepositorySummary,
    setRepositorySummary,
    refreshRepositorySummary,
    ensureRepositorySummary,
  };
}
