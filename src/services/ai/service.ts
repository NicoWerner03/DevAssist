import { getConfig } from '../../config.js';
import logger from '../../utils/logger.js';
import { RequirementAnalysis, parseAnalysisJson } from './schema.js';
import { getFullAnalysisInstructions } from './instructions.js';
import {
  removeAnsweredOpenQuestions,
  renderPriorClarificationAnswersForPrompt,
} from './clarifications.js';
import {
  collectStrings,
  findOpencodeBin,
  getEffectiveModel,
  runCommand,
  stripAnsi,
} from './opencodeRuntime.js';

export interface TicketContextForAI {
  issue?: any;
  comments?: any[];
  rawText?: string; // fallback
  repositorySummary?: string | null;
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
export function buildUserPrompt(ctx: TicketContextForAI): string {
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
  if (ctx.repositorySummary && ctx.repositorySummary.trim()) {
    parts.push('\n## Repository Summary');
    parts.push(ctx.repositorySummary.trim());
  }
  const priorClarificationAnswers = renderPriorClarificationAnswersForPrompt(ctx.comments);
  if (priorClarificationAnswers) {
    parts.push('\n## Prior Clarification Answers');
    parts.push(priorClarificationAnswers);
  }
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
    title: title.length > 80 ? `${title.slice(0, 77)}...` : title,
    description: [
      'Deliver the behavior requested in the ticket.',
      'Keep the result aligned with the stated requirements and acceptance criteria.',
    ],
    acceptanceCriteria: [
      'The delivered behavior matches the requirements stated in the ticket.',
      'The observable acceptance criteria supplied in the ticket are satisfied.',
    ],
    technicalContext: [],
    proposedSolution: [
      'Review the requested behavior and any supplied constraints.',
      'Implement the requested behavior according to the confirmed requirements.',
      'Verify the result against the acceptance criteria stated in the ticket.',
    ],
    openQuestions: ['Are there any acceptance criteria or edge cases not mentioned?'],
  };
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

function tryParseAnalysisFromText(text: string): RequirementAnalysis | undefined {
  const cleaned = stripAnsi(text).trim();
  const candidates = [
    cleaned,
    ...Array.from(cleaned.matchAll(/<task_result>\s*([\s\S]*?)\s*<\/task_result>/gi)).map(match => match[1] || ''),
    ...extractJsonObjects(cleaned),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const hasCompactContract = candidate.includes('"description"')
      && candidate.includes('"technicalContext"')
      && candidate.includes('"proposedSolution"');
    if (!hasCompactContract) continue;

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

export function createAiService(): AiService {
  const cfg = getConfig();

  return {
    async analyzeTicket(ctx) {
      let analysis: RequirementAnalysis;

      if (cfg.ai.provider === 'mock') {
        logger.info('Using mock AI analysis (provider=mock)');
        analysis = createMockAnalysis(ctx);
      } else if (cfg.ai.provider === 'opencode') {
        analysis = await analyzeWithOpencode(ctx);
      } else {
        logger.warn(`Unknown AI provider "${cfg.ai.provider}", falling back to mock`);
        analysis = createMockAnalysis(ctx);
      }

      return removeAnsweredOpenQuestions(analysis, ctx.comments);
    },
  };
}

async function analyzeWithOpencode(ctx: TicketContextForAI): Promise<RequirementAnalysis> {
  const fs = await import('fs/promises');
  const pathMod = await import('path');

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
  await fs.copyFile(
    pathMod.join(process.cwd(), '.opencode', 'prompts', 'repo-summary.md'),
    pathMod.join(runtimePromptDir, 'repo-summary.md')
  ).catch((e: any) => {
    if (e.code !== 'ENOENT') throw e;
  });
  const promptFile = pathMod.join(runtimeDir, 'analysis-context.txt');
  await fs.writeFile(promptFile, promptText, 'utf8');

  const bin = await findOpencodeBin();

  // Align model + reasoning effort with the direct 'xai' provider path for consistent behavior.
  // opencode.json provides the base config (and agent prompt), but we override via CLI flags here.
  const effectiveModel = getEffectiveModel(cfg.ai.model);
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
    'Analyze the attached GitLab issue context and return the required JSON object.',
    '--file',
    promptFile,
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

  const result = await runCommand(bin, runArgs, { timeoutMs: cfg.ai.timeoutMs }).catch((error: Error) => {
    logger.error('opencode execution failed', { error: error.message });
    throw error;
  });

  const { stdout, stderr, code } = result;
  if (stderr.trim()) {
    logger.warn('opencode stderr', { stderr: stderr.trim().slice(0, 500) });
  }

  const output = stdout.trim();
  if (code !== 0) {
    logger.warn('opencode exited with non-zero code', { code });
  }
  if (!output) {
    logger.warn('opencode produced no stdout');
    throw new Error('opencode produced no stdout output');
  }

  logger.info('opencode response received', { chars: output.length, exitCode: code });

  try {
    try {
      return parseOpencodeAnalysisOutput(output);
    } catch (streamParseErr: any) {
      const sessionId = extractSessionId(output);
      if (!sessionId) throw streamParseErr;

      logger.info('opencode JSON stream did not include final text; exporting session', { sessionId });
      const exported = await runCommand(bin, ['export', sessionId], { cwd: runtimeDir, timeoutMs: 30000 });
      const exportStderr = exported.stderr.trim();
      if (exportStderr && !/^Exporting session:/i.test(stripAnsi(exportStderr))) {
        logger.warn('opencode export stderr', { stderr: exportStderr.slice(0, 500) });
      }
      return parseOpencodeAnalysisOutput(exported.stdout);
    }
  } catch (parseErr: any) {
    logger.error('Failed to parse opencode output as structured JSON', {
      error: parseErr.message,
      preview: output.slice(0, 300),
    });
    throw parseErr;
  }
}
