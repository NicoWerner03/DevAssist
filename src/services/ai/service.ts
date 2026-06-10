import { getConfig } from '../../config';
import logger from '../../utils/logger';
import { RequirementAnalysis, parseAnalysisJson } from './schema';
import {
  getFullAnalysisInstructions,
  ANALYSIS_PERSONA,
  getOpencodeAgentBasePrompt,
} from './instructions';

export interface TicketContextForAI {
  project?: any;
  issue?: any;
  comments?: any[];
  rawText?: string; // fallback
}

export interface AiService {
  analyzeTicket(ctx: TicketContextForAI): Promise<RequirementAnalysis>;
}

/**
 * Builds the user prompt for analysis.
 * The instructional content (persona, core rules, JSON schema, filling rules)
 * comes from the shared module so both the direct xai path and the opencode
 * path stay in sync automatically.
 */
function buildUserPrompt(ctx: TicketContextForAI): string {
  const issue = ctx.issue || {};
  const parts: string[] = [
    // Use the full shared instructions (including clarification guidance)
    // so the direct xai path and opencode path receive identical rules + schema.
    getFullAnalysisInstructions(),
    '',
    '## Existing GitLab Issue',
    `Title: ${issue.title || ''}`,
    `Description:\n${issue.description || ctx.rawText || ''}`,
  ];
  if (ctx.comments && ctx.comments.length) {
    parts.push('\n## Recent Comments (for context)');
    for (const c of ctx.comments.slice(-6)) {
      parts.push(`- ${c.author?.username || 'user'}: ${String(c.body || '').slice(0, 4000)}`);
    }
  }
  parts.push('\nOutput ONLY the JSON object now.');
  return parts.join('\n');
}

function createMockAnalysis(ctx: TicketContextForAI): RequirementAnalysis {
  const issue = ctx.issue || {};
  const title = issue.title || 'Improve feature';
  return {
    summary: `Structured version of: ${title}. Derived from the provided description and comments.`,
    sourceBasis: 'ticket_text',
    implementationTicket: {
      title: title.length > 80 ? title.slice(0, 77) + '...' : title,
      goal: 'Deliver the requested capability in a clean, testable way.',
      scope: ['Core functionality as described', 'Basic validation and error handling'],
      outOfScope: ['UI/UX redesign', 'Performance optimizations beyond the scope of the ticket'],
      userStories: ['As a user, I can ... (to be refined from open questions if any)'],
      functionalRequirements: ['The system must support the main flow described in the ticket'],
      technicalApproach: ['Implement in the existing service layer', 'Add unit tests for new paths'],
      implementationTasks: [
        '1. Update API route / handler to support the new behavior',
        '2. Add validation and error mapping',
        '3. Write / update unit tests',
        '4. Update documentation if user-facing',
      ],
      definitionOfDone: [
        'All functional requirements implemented and tested',
        'No new open questions remain',
        'Passes existing test suite + new tests',
      ],
    },
    acceptanceCriteria: ['Feature works end-to-end for the happy path', 'Error cases are handled gracefully'],
    technicalNotes: ['Keep changes minimal and focused on the ticket description'],
    openQuestions: ['Are there any acceptance criteria or edge cases not mentioned?'],
    risks: ['Scope creep if additional requirements are discovered during implementation'],
    validationSteps: ['Manual test of the main flow', 'Run automated test suite'],
  };
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function extractJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
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

function tryParseAnalysisFromText(text: string): RequirementAnalysis | undefined {
  const cleaned = stripAnsi(text).trim();
  const candidates = [
    cleaned,
    ...Array.from(cleaned.matchAll(/<task_result>\s*([\s\S]*?)\s*<\/task_result>/gi)).map(match => match[1] || ''),
    ...extractJsonObjects(cleaned),
  ];

  for (const candidate of candidates) {
    if (!candidate || !candidate.includes('implementationTicket')) continue;

    try {
      return parseAnalysisJson(candidate);
    } catch {
      // Try next candidate.
    }
  }

  return undefined;
}

function parseOpencodeAnalysisOutput(output: string): RequirementAnalysis {
  const direct = tryParseAnalysisFromText(output);
  if (direct) return direct;

  try {
    const parsedOutput = JSON.parse(stripAnsi(output));
    for (const value of collectStrings(parsedOutput)) {
      const parsed = tryParseAnalysisFromText(value);
      if (parsed) return parsed;
    }
  } catch {
    // The normal opencode stream is JSONL, not one JSON object.
  }

  for (const line of stripAnsi(output).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;

    try {
      const event = JSON.parse(trimmed);
      for (const value of collectStrings(event)) {
        const parsed = tryParseAnalysisFromText(value);
        if (parsed) return parsed;
      }
    } catch {
      // Ignore non-JSON log lines.
    }
  }

  throw new Error(`No schema-compliant analysis JSON found in opencode output. Preview: ${stripAnsi(output).slice(0, 300)}`);
}

function extractSessionId(output: string): string | undefined {
  const match = stripAnsi(output).match(/"sessionID"\s*:\s*"([^"]+)"/);
  return match?.[1];
}

function runChild(bin: string, args: string[], options?: { cwd?: string; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const { spawn } = require('child_process') as typeof import('child_process');

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: options?.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: process.platform === 'win32' && /\.cmd$/i.test(bin),
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);

    const timeout = options?.timeoutMs
      ? setTimeout(() => {
          try { child.kill('SIGKILL'); } catch {}
          reject(new Error(`Command timed out after ${options.timeoutMs}ms: ${bin} ${args.join(' ')}`));
        }, options.timeoutMs)
      : undefined;

    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout);
      resolve({ stdout, stderr, code });
    });
  });
}

export function createAiService(): AiService {
  const cfg = getConfig();

  return {
    async analyzeTicket(ctx) {
      if (cfg.ai.provider === 'mock') {
        logger.info('Using mock AI analysis (provider=mock)');
        return createMockAnalysis(ctx);
      }

      if (cfg.ai.provider === 'opencode') {
        return analyzeWithOpencode(ctx);
      }

      logger.warn(`Unknown AI provider "${cfg.ai.provider}", falling back to mock`);
      return createMockAnalysis(ctx);
    },
  };
}

async function analyzeWithOpencode(ctx: TicketContextForAI): Promise<RequirementAnalysis> {
  const fs = await import('fs/promises');
  const pathMod = await import('path');
  const { spawn } = await import('child_process');

  const promptText = buildUserPrompt(ctx);
  const cfg = getConfig();

  // Run opencode in an isolated directory under .opencode so .dev-assist stays
  // reserved for generated ticket context files.
  const runtimeDir = pathMod.join(process.cwd(), '.opencode', 'runtime');
  const runtimePromptDir = pathMod.join(runtimeDir, '.opencode', 'prompts');
  await fs.mkdir(runtimePromptDir, { recursive: true });
  await fs.copyFile(pathMod.join(process.cwd(), 'opencode.json'), pathMod.join(runtimeDir, 'opencode.json'));
  await fs.copyFile(
    pathMod.join(process.cwd(), '.opencode', 'prompts', 'requirement-analysis.md'),
    pathMod.join(runtimePromptDir, 'requirement-analysis.md')
  );

  const npmOpencodeExe = process.platform === 'win32' && process.env.APPDATA
    ? pathMod.join(process.env.APPDATA, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
    : '';

  let hasNpmOpencodeExe = false;
  if (npmOpencodeExe) {
    try {
      await fs.access(npmOpencodeExe);
      hasNpmOpencodeExe = true;
    } catch {}
  }

  const bin = hasNpmOpencodeExe
    ? npmOpencodeExe
    : (process.platform === 'win32' ? 'opencode.cmd' : 'opencode');

  // Align model + reasoning effort with the direct 'xai' provider path for consistent behavior.
  // opencode.json provides the base config (and agent prompt), but we override via CLI flags here.
  const configuredModel = cfg.ai.model || 'xai/grok-3-latest';
  const effectiveModel = configuredModel.includes('/') ? configuredModel : `xai/${configuredModel}`;
  const runArgs = [
    'run',
    '--dir',
    runtimeDir,
    '--format',
    'json',
    '--agent',
    'dev-assist-analyzer',
    '--model',
    effectiveModel,
    promptText,
  ];
  if (cfg.ai.reasoningEffort) {
    runArgs.push('--variant', cfg.ai.reasoningEffort);
  }

  logger.info('Calling opencode for analysis (using dev-assist-analyzer agent)', {
    model: effectiveModel,
    reasoningEffort: cfg.ai.reasoningEffort || null,
    note: 'Full analysis instructions come from src/services/ai/instructions.ts (single source of truth). The agent base prompt in .opencode/prompts/requirement-analysis.md is intentionally lightweight.',
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

    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });

    child.stdin.end();

    const timeout = setTimeout(() => {
      logger.warn('opencode analysis timed out — killing process', {
        timeoutMs: cfg.ai.timeoutMs,
      });
      try { child.kill('SIGKILL'); } catch {}
      reject(new Error(`opencode analysis timed out after ${cfg.ai.timeoutMs}ms`));
    }, cfg.ai.timeoutMs);

    child.on('error', (err: any) => {
      clearTimeout(timeout);
      logger.error('opencode spawn failed', { error: err.message });
      reject(err);
    });

    child.on('close', async (code) => {
      clearTimeout(timeout);

      if (stderr && stderr.trim()) {
        logger.warn('opencode stderr', { stderr: stderr.trim().slice(0, 500) });
      }

      const output = (stdout || '').trim();

      if (code !== 0) {
        logger.warn('opencode exited with non-zero code', { code });
      }

      if (!output) {
        logger.warn('opencode produced no stdout');
        return reject(new Error('opencode produced no stdout output'));
      }

      logger.info('opencode response received', { chars: output.length, exitCode: code });

      try {
        let analysis: RequirementAnalysis;

        try {
          analysis = parseOpencodeAnalysisOutput(output);
        } catch (streamParseErr: any) {
          const sessionId = extractSessionId(output);
          if (!sessionId) throw streamParseErr;

          logger.info('opencode JSON stream did not include final text; exporting session', { sessionId });
          const exported = await runChild(bin, ['export', sessionId], { cwd: runtimeDir, timeoutMs: 30000 });
          const exportStderr = exported.stderr.trim();
          if (exportStderr && !/^Exporting session:/i.test(stripAnsi(exportStderr))) {
            logger.warn('opencode export stderr', { stderr: exported.stderr.trim().slice(0, 500) });
          }
          analysis = parseOpencodeAnalysisOutput(exported.stdout);
        }

        resolve(analysis);
      } catch (parseErr: any) {
        logger.error('Failed to parse opencode output as structured JSON', {
          error: parseErr.message,
          preview: output.slice(0, 300),
        });
        reject(parseErr);
      }
    });
  });
}
