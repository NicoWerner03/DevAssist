# Compact Ticket Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy requirement-analysis JSON with the approved six-field compact contract and render the four approved GitLab ticket sections directly.

**Architecture:** Keep the existing AI service, clarification, context-file, and publisher boundaries. Migrate the cross-cutting `RequirementAnalysis` contract atomically across its validator, producers, formatter, and processor; then align both runtime and static analyzer prompts. Add focused compatibility coverage around the publisher without changing its output behavior.

**Tech Stack:** TypeScript, Node.js `node:test`, `tsx`, Express service modules, GitLab Markdown, OpenCode CLI integration.

## Global Constraints

- The exact required JSON properties are `title`, `description`, `acceptanceCriteria`, `technicalContext`, `proposedSolution`, and `openQuestions`; additional properties are invalid.
- `title` is a string; the other five properties are arrays containing only strings. Empty arrays are valid.
- Newly generated Markdown contains exactly these headings in this order: `## 📋 Description`, `## 🎯 Acceptance Criteria`, `## 📁 Technical Context & Logs`, `## 💡 Proposed Solution`.
- Description items render as paragraphs, acceptance criteria and technical context as bullets, and proposed solution items as an automatically numbered list.
- Empty visible sections render `Not enough information available yet.`.
- The GitLab title comes from top-level `title` and is never repeated in the description body.
- The clarification comment wording and the existing `openQuestions.length >= 2` proposal heuristic remain unchanged.
- When a proposal contains a remaining non-blocking open question, render it inside Technical Context & Logs as `Open question: ...` so no question is lost.
- Technical details must be grounded in the issue, comments, supplied logs, or repository summary; do not infer current implementation details.
- Existing Markdown context files remain publishable without migration.
- Add no dependencies and no configurability.
- The worktree contains unrelated user changes, including edits in files this plan touches. Before every staging step, inspect the file diff and use patch staging so no pre-existing hunk is included. If a plan-authored hunk cannot be separated from a pre-existing hunk, skip that commit, leave the implementation unstaged, and report the reason instead of committing user work.
- Design reference: `docs/superpowers/specs/2026-07-09-compact-ticket-schema-design.md`.

## File Map

- Create `tests/schema.test.ts`: strict contract and JSON parsing coverage.
- Create `tests/processor.test.ts`: pure preparation coverage for Markdown plus title metadata.
- Create `tests/publisher.test.ts`: old and compact Markdown publication compatibility.
- Modify `src/services/ai/schema.ts`: new interface, JSON schema, and strict runtime validation.
- Modify `src/services/ai/formatter.ts`: direct four-section Markdown rendering.
- Modify `src/services/ai/service.ts`: compact mock result and OpenCode result detection.
- Modify `src/services/processing/processor.ts`: top-level title metadata and preparation boundary.
- Modify `src/services/ai/instructions.ts`: compact analyzer contract and field guidance.
- Modify `.opencode/prompts/requirement-analysis.md`: static agent terminology aligned with runtime instructions.
- Modify `src/services/processing/publisher.ts`: export the existing pure Markdown cleanup function for compatibility testing.
- Modify `tests/formatter.test.ts`, `tests/aiPrompt.test.ts`, and `tests/aiOpencode.test.ts`: replace legacy fixtures and assert the approved behavior.

---

### Task 1: Migrate the Runtime Contract Atomically

**Files:**
- Create: `tests/schema.test.ts`
- Create: `tests/processor.test.ts`
- Modify: `tests/formatter.test.ts`
- Modify: `tests/aiPrompt.test.ts`
- Modify: `tests/aiOpencode.test.ts`
- Modify: `src/services/ai/schema.ts`
- Modify: `src/services/ai/formatter.ts`
- Modify: `src/services/ai/service.ts`
- Modify: `src/services/processing/processor.ts`

**Interfaces:**
- Produces: `RequirementAnalysis` with `title: string`, `description: string[]`, `acceptanceCriteria: string[]`, `technicalContext: string[]`, `proposedSolution: string[]`, and `openQuestions: string[]`.
- Produces: `prepareAnalysisOutput(analysis: RequirementAnalysis): { fullContext: string; metadata: { title: string } }`.
- Preserves: `renderRequirementAnalysis(analysis: RequirementAnalysis): string` and `renderClarificationComment(analysis: RequirementAnalysis): string`.
- Consumes: existing `parseAnalysisJson`, `writeContextFile`, and answered-question filtering APIs.

- [ ] **Step 1: Write failing strict-schema tests**

Create `tests/schema.test.ts` with the exact new contract and distinct tests for acceptance, legacy rejection, unexpected properties, wrong property types, and non-string items:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalysisJson, validateRequirementAnalysis } from '../src/services/ai/schema';

const validAnalysis = {
  title: 'Add theme toggle',
  description: ['Add a theme toggle to the header.'],
  acceptanceCriteria: ['The theme changes without reloading.'],
  technicalContext: ['Use the existing styling system.'],
  proposedSolution: ['Add theme state handling.', 'Persist the selection.'],
  openQuestions: [],
};

describe('requirement analysis schema', () => {
  it('accepts the compact ticket contract', () => {
    const result = validateRequirementAnalysis(validAnalysis);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, validAnalysis);
  });

  it('rejects the legacy analysis contract', () => {
    const result = validateRequirementAnalysis({
      summary: 'Legacy',
      sourceBasis: 'ticket_text',
      implementationTicket: { title: 'Legacy title' },
      acceptanceCriteria: [],
      technicalNotes: [],
      openQuestions: [],
      risks: [],
      validationSteps: [],
    });
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /missing required field: title/);
  });

  it('rejects unexpected properties', () => {
    const result = validateRequirementAnalysis({ ...validAnalysis, summary: 'Legacy' });
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /unexpected field: summary/);
  });

  it('rejects incorrect property types', () => {
    const result = validateRequirementAnalysis({ ...validAnalysis, description: 'paragraph' });
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /description must be an array/);
  });

  it('rejects non-string array items', () => {
    const result = validateRequirementAnalysis({ ...validAnalysis, proposedSolution: [1] });
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /proposedSolution\[0\] must be a string/);
  });

  it('parses fenced compact JSON', () => {
    assert.deepEqual(parseAnalysisJson(`\`\`\`json\n${JSON.stringify(validAnalysis)}\n\`\`\``), validAnalysis);
  });
});
```

- [ ] **Step 2: Run the schema test and verify RED**

Run: `npx tsx --test tests/schema.test.ts`

Expected: FAIL because the current validator requires `summary`, `sourceBasis`, and `implementationTicket` instead of accepting `title` and the four compact content fields.

- [ ] **Step 3: Replace the schema and strict validator**

Replace the legacy interfaces and `validateRequirementAnalysis` implementation in `src/services/ai/schema.ts` with:

```ts
export interface RequirementAnalysis {
  title: string;
  description: string[];
  acceptanceCriteria: string[];
  technicalContext: string[];
  proposedSolution: string[];
  openQuestions: string[];
}

const REQUIRED_FIELDS = [
  'title',
  'description',
  'acceptanceCriteria',
  'technicalContext',
  'proposedSolution',
  'openQuestions',
] as const;

const ARRAY_FIELDS = [
  'description',
  'acceptanceCriteria',
  'technicalContext',
  'proposedSolution',
  'openQuestions',
] as const;

export const REQUIREMENT_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...REQUIRED_FIELDS],
  properties: {
    title: { type: 'string' },
    description: { type: 'array', items: { type: 'string' } },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    technicalContext: { type: 'array', items: { type: 'string' } },
    proposedSolution: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateRequirementAnalysis(
  value: unknown,
): { valid: boolean; errors: string[]; value?: RequirementAnalysis } {
  if (!isRecord(value)) {
    return { valid: false, errors: ['root is not an object'] };
  }

  const errors: string[] = [];
  const allowedFields = new Set<string>(REQUIRED_FIELDS);

  for (const field of REQUIRED_FIELDS) {
    if (!(field in value)) errors.push(`missing required field: ${field}`);
  }
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) errors.push(`unexpected field: ${field}`);
  }

  if ('title' in value && typeof value.title !== 'string') {
    errors.push('title must be a string');
  }

  for (const field of ARRAY_FIELDS) {
    if (!(field in value)) continue;
    const items = value[field];
    if (!Array.isArray(items)) {
      errors.push(`${field} must be an array`);
      continue;
    }
    items.forEach((item, index) => {
      if (typeof item !== 'string') errors.push(`${field}[${index}] must be a string`);
    });
  }

  return errors.length === 0
    ? { valid: true, errors: [], value: value as unknown as RequirementAnalysis }
    : { valid: false, errors };
}
```

Keep `parseAnalysisJson` below this block unchanged so fence stripping and parse diagnostics remain stable.

- [ ] **Step 4: Run the schema test and verify GREEN**

Run: `npx tsx --test tests/schema.test.ts`

Expected: PASS, 6 tests and 0 failures.

- [ ] **Step 5: Replace formatter fixtures with the compact shape and exact Markdown assertions**

In `tests/formatter.test.ts`, replace `baseAnalysis` with:

```ts
const baseAnalysis: RequirementAnalysis = {
  title: 'Implementation Title',
  description: ['First description paragraph.', 'Second description paragraph.'],
  acceptanceCriteria: ['criteria 1', 'criteria 2'],
  technicalContext: ['note 1'],
  proposedSolution: ['task 1', 'task 2'],
  openQuestions: [],
};
```

Replace the legacy full-document and weak-list tests with these exact behaviors while keeping the two clarification-comment tests:

```ts
it('renders the approved compact ticket structure', () => {
  const doc = renderRequirementAnalysis(baseAnalysis);
  assert.equal(doc, [
    '## 📋 Description',
    '',
    'First description paragraph.',
    '',
    'Second description paragraph.',
    '',
    '## 🎯 Acceptance Criteria',
    '',
    '- criteria 1',
    '- criteria 2',
    '',
    '## 📁 Technical Context & Logs',
    '',
    '- note 1',
    '',
    '## 💡 Proposed Solution',
    '',
    '1. task 1',
    '2. task 2',
  ].join('\n'));
  assert.doesNotMatch(doc, /Implementation Title/);
  assert.doesNotMatch(doc, /Dev-Assist Context|Generated by Dev-Assist/);
});

it('uses fallback text for empty visible sections', () => {
  const doc = renderRequirementAnalysis({
    ...baseAnalysis,
    description: [],
    acceptanceCriteria: [],
    technicalContext: [],
    proposedSolution: [],
  });
  assert.equal(doc.match(/Not enough information available yet\./g)?.length, 4);
});

it('normalizes items and keeps a remaining question in technical context', () => {
  const doc = renderRequirementAnalysis({
    ...baseAnalysis,
    description: ['  paragraph with\nline break  ', ''],
    proposedSolution: ['1. inspect header', '2) add toggle'],
    openQuestions: ['Should system changes be followed after initial load?'],
  });
  assert.match(doc, /paragraph with line break/);
  assert.match(doc, /- Open question: Should system changes be followed after initial load\?/);
  assert.match(doc, /1\. inspect header/);
  assert.match(doc, /2\. add toggle/);
  assert.doesNotMatch(doc, /1\. 1\.|2\. 2\)/);
});
```

Update the clarification tests to use the top-level title and explicit question data:

```ts
it('renders clarification comments with open questions', () => {
  const comment = renderClarificationComment({
    ...baseAnalysis,
    openQuestions: ['question 1', 'question 2'],
  });
  assert.match(comment, /## Dev-Assist: More information needed/);
  assert.match(comment, /- question 1/);
  assert.match(comment, /- question 2/);
  assert.match(comment, /Current best guess for title: Implementation Title/);
});

it('renders clarification comments with fallback text when questions are missing', () => {
  const comment = renderClarificationComment(baseAnalysis);
  assert.match(comment, /There are several unclear areas regarding the requirements/);
});
```

- [ ] **Step 6: Run the formatter test and verify RED**

Run: `npx tsx --test tests/formatter.test.ts`

Expected: FAIL because the formatter still reads `implementationTicket`, renders legacy headings, and does not emit the four approved sections.

- [ ] **Step 7: Implement the direct four-section formatter**

In `src/services/ai/formatter.ts`, remove the legacy `implementationTicket` lookup and legacy section renderer. Keep the clarification copy unchanged, but read `analysis.title`. Add these helpers and implementation:

```ts
const MISSING_INFORMATION = 'Not enough information available yet.';

function cleanItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item || '').trim().replace(/\s*\n\s*/g, ' '))
    .filter(Boolean);
}

function stripNumberPrefix(item: string): string {
  return item.replace(/^\d+[.)]\s*/, '');
}

function renderDescription(items: unknown): string {
  const cleaned = cleanItems(items);
  return cleaned.length > 0 ? cleaned.join('\n\n') : MISSING_INFORMATION;
}

function renderBullets(items: unknown): string {
  const cleaned = cleanItems(items);
  return cleaned.length > 0 ? cleaned.map((item) => `- ${item}`).join('\n') : MISSING_INFORMATION;
}

function renderOrdered(items: unknown): string {
  const cleaned = cleanItems(items).map(stripNumberPrefix).filter(Boolean);
  return cleaned.length > 0
    ? cleaned.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : MISSING_INFORMATION;
}

export function renderRequirementAnalysis(analysis: RequirementAnalysis): string {
  const technicalContext = [
    ...cleanItems(analysis.technicalContext),
    ...cleanItems(analysis.openQuestions).map((question) => `Open question: ${question}`),
  ];

  return [
    '## 📋 Description',
    '',
    renderDescription(analysis.description),
    '',
    '## 🎯 Acceptance Criteria',
    '',
    renderBullets(analysis.acceptanceCriteria),
    '',
    '## 📁 Technical Context & Logs',
    '',
    renderBullets(technicalContext),
    '',
    '## 💡 Proposed Solution',
    '',
    renderOrdered(analysis.proposedSolution),
  ].join('\n');
}
```

In `renderClarificationComment`, make only these title-related replacements:

```ts
// Remove: const t = analysis.implementationTicket || ({} as any);
// Replace the final title line with:
lines.push(`(Current best guess for title: ${analysis.title || '(unknown)'})`);
```

- [ ] **Step 8: Run the formatter test and verify GREEN**

Run: `npx tsx --test tests/formatter.test.ts`

Expected: PASS with no legacy headings or title in the generated ticket body.

- [ ] **Step 9: Write a failing processor preparation test**

Create `tests/processor.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepareAnalysisOutput } from '../src/services/processing/processor';

describe('issue processor output preparation', () => {
  it('separates the GitLab title from the compact Markdown body', () => {
    const prepared = prepareAnalysisOutput({
      title: 'Compact issue title',
      description: ['Compact description'],
      acceptanceCriteria: ['Observable outcome'],
      technicalContext: ['Known constraint'],
      proposedSolution: ['Implement the focused change'],
      openQuestions: [],
    });

    assert.deepEqual(prepared.metadata, { title: 'Compact issue title' });
    assert.doesNotMatch(prepared.fullContext, /Compact issue title/);
    assert.match(prepared.fullContext, /## 📋 Description/);
  });
});
```

- [ ] **Step 10: Run the processor test and verify RED**

Run: `npx tsx --test tests/processor.test.ts`

Expected: FAIL because `prepareAnalysisOutput` is not exported.

- [ ] **Step 11: Add the processor preparation boundary and use top-level title metadata**

Import `RequirementAnalysis` in `src/services/processing/processor.ts` and add after the module-level dependencies:

```ts
export function prepareAnalysisOutput(analysis: RequirementAnalysis): {
  fullContext: string;
  metadata: { title: string };
} {
  return {
    fullContext: renderRequirementAnalysis(analysis),
    metadata: { title: analysis.title },
  };
}
```

Replace the untyped analysis declaration with:

```ts
let analysis: RequirementAnalysis;
```

Replace the legacy summary log and context preparation with:

```ts
log.info('AI analysis complete', { descriptionItems: analysis.description?.length || 0 });

const { fullContext, metadata } = prepareAnalysisOutput(analysis);
```

Replace the context write call with:

```ts
const filePath = await writeContextFile(projectId, issueIid, fullContext, metadata);
```

- [ ] **Step 12: Run the processor test and verify GREEN**

Run: `npx tsx --test tests/processor.test.ts`

Expected: PASS, with the title only in metadata.

- [ ] **Step 13: Change OpenCode fixtures first and verify result detection fails**

In `tests/aiOpencode.test.ts`, replace `analysisJson()` with:

```ts
function analysisJson(): string {
  return JSON.stringify({
    title: 'Analyze via export fallback',
    description: ['Parse the exported OpenCode session when the JSON stream has no final text.'],
    acceptanceCriteria: [],
    technicalContext: [],
    proposedSolution: [],
    openQuestions: [],
  });
}
```

Replace the legacy result assertions with:

```ts
assert.deepEqual(analysis.description, [
  'Parse the exported OpenCode session when the JSON stream has no final text.',
]);
assert.equal(analysis.title, 'Analyze via export fallback');
```

Run: `npx tsx --test tests/aiOpencode.test.ts`

Expected: FAIL with `No schema-compliant analysis JSON found` because candidate detection still requires `implementationTicket`.

- [ ] **Step 14: Update the mock producer and OpenCode candidate detection**

Replace `createMockAnalysis` in `src/services/ai/service.ts` with:

```ts
function createMockAnalysis(ctx: TicketContextForAI): RequirementAnalysis {
  const issue = ctx.issue || {};
  const title = issue.title || 'Improve feature';
  return {
    title: title.length > 80 ? `${title.slice(0, 77)}...` : title,
    description: [
      `Deliver the requested capability for: ${title}.`,
      'Support the main flow described in the ticket with focused validation and error handling.',
    ],
    acceptanceCriteria: [
      'The requested feature works end-to-end for the happy path.',
      'Relevant error cases are handled gracefully.',
    ],
    technicalContext: ['Keep changes minimal and focused on the ticket description.'],
    proposedSolution: [
      'Update the relevant handler or service to support the requested behavior.',
      'Add validation and error mapping.',
      'Write or update automated tests.',
    ],
    openQuestions: ['Are there any acceptance criteria or edge cases not mentioned?'],
  };
}
```

Replace the candidate loop in `tryParseAnalysisFromText` with:

```ts
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
```

- [ ] **Step 15: Replace the remaining legacy clarification fixture**

In `tests/aiPrompt.test.ts`, replace the analysis object in `removes rephrased open questions when the original clarification was answered` with:

```ts
const analysis: RequirementAnalysis = {
  title: 'Add theme toggle',
  description: ['Add theme switching.'],
  acceptanceCriteria: [],
  technicalContext: [],
  proposedSolution: [],
  openQuestions: [
    'If the user has not explicitly selected a theme, should the application continue reacting to system color-scheme changes after initial load, or is first-load detection sufficient?',
  ],
};
```

Add `import type { RequirementAnalysis } from '../src/services/ai/schema';` to that test file.

- [ ] **Step 16: Run all migrated runtime tests and the compiler**

Run: `npx tsx --test tests/schema.test.ts tests/formatter.test.ts tests/processor.test.ts tests/aiPrompt.test.ts tests/aiOpencode.test.ts`

Expected: PASS, all listed tests with 0 failures.

Run: `npm run build`

Expected: exit code 0; no runtime analysis access uses `implementationTicket`, `sourceBasis`, `technicalNotes`, or `validationSteps`.

- [ ] **Step 17: Commit the atomic runtime migration**

```powershell
git add -- tests/schema.test.ts tests/processor.test.ts
git add -p -- tests/formatter.test.ts tests/aiPrompt.test.ts tests/aiOpencode.test.ts src/services/ai/schema.ts src/services/ai/formatter.ts src/services/ai/service.ts src/services/processing/processor.ts
git diff --cached --check
git diff --cached
git commit -m "refactor: adopt compact ticket analysis contract"
```

Expected: only plan-authored hunks in the nine listed files are included. If patch staging cannot isolate them from pre-existing work, do not create this commit.

---

### Task 2: Align Runtime and Static Analyzer Instructions

**Files:**
- Modify: `tests/aiPrompt.test.ts`
- Modify: `src/services/ai/instructions.ts`
- Modify: `.opencode/prompts/requirement-analysis.md`

**Interfaces:**
- Consumes: the Task 1 `RequirementAnalysis` contract.
- Produces: `getFullAnalysisInstructions(): string` containing the exact six-field schema and field-specific rules.
- Preserves: `buildUserPrompt(ctx: TicketContextForAI): string` and the static OpenCode prompt delegation model.

- [ ] **Step 1: Write failing compact-prompt tests**

Add `import fs from 'node:fs';` to `tests/aiPrompt.test.ts` and add:

```ts
it('instructs the analyzer to emit only the compact ticket contract', () => {
  const prompt = buildUserPrompt({
    issue: { title: 'Compact ticket', description: 'Create the compact format.' },
  });

  assert.match(prompt, /"title":/);
  assert.match(prompt, /"description": \[/);
  assert.match(prompt, /"technicalContext": \[/);
  assert.match(prompt, /"proposedSolution": \[/);
  assert.match(prompt, /Items in proposedSolution must not contain numeric prefixes/);
  assert.doesNotMatch(prompt, /"implementationTicket"|"sourceBasis"|"technicalNotes"/);
});

it('keeps the static OpenCode prompt aligned with the compact terminology', () => {
  const staticPrompt = fs.readFileSync('.opencode/prompts/requirement-analysis.md', 'utf8');
  assert.match(staticPrompt, /four-section ticket/);
  assert.match(staticPrompt, /technical context and proposed solution/);
  assert.doesNotMatch(staticPrompt, /technical notes and implementation tasks/);
});
```

- [ ] **Step 2: Run prompt tests and verify RED**

Run: `npx tsx --test tests/aiPrompt.test.ts`

Expected: FAIL because the runtime example still contains `implementationTicket` and the static prompt uses legacy field terminology.

- [ ] **Step 3: Replace the runtime schema example and filling rules**

In `src/services/ai/instructions.ts`, replace `JSON_SCHEMA_EXAMPLE` with:

```ts
export const JSON_SCHEMA_EXAMPLE = `{
  "title": "concise GitLab issue title",
  "description": ["self-contained paragraph 1", "self-contained paragraph 2"],
  "acceptanceCriteria": ["observable, testable outcome"],
  "technicalContext": ["factual constraint, repository observation, log, error, assumption, or risk"],
  "proposedSolution": ["ordered high-level implementation step without a numeric prefix"],
  "openQuestions": ["specific unanswered functional or product question?"]
}`;
```

Replace `SCHEMA_FILLING_RULES` with:

```ts
export const SCHEMA_FILLING_RULES = `### Rules for filling the schema
- title is concise and suitable for the GitLab issue title. Do not repeat it in description.
- description contains ordered, self-contained paragraphs covering goal, user value, functional behavior, and relevant scope.
- acceptanceCriteria contains observable and testable completion conditions. Include definition-of-done or validation outcomes here when they describe externally verifiable results.
- technicalContext contains only factual constraints, supplied logs or errors, relevant repository-summary observations, and material assumptions or risks. Never invent current implementation details.
- proposedSolution contains actionable high-level implementation steps in execution order. Items in proposedSolution must not contain numeric prefixes; the renderer adds numbering.
- openQuestions contains only unanswered functional or product questions. Never ask how the current codebase is implemented.
- If information is missing, keep the affected content array empty or state a clearly marked uncertainty grounded in the available input. Do not fabricate details.
- For every array field, output clean single-line strings with no Markdown bullets, indentation, or embedded lists.`;
```

Replace `ANALYSIS_PERSONA` with:

```ts
export const ANALYSIS_PERSONA = `You are Dev-Assist. Create a clear, developer-ready compact ticket for the GitLab issue.

Focus on what needs to be built: goal, user value, functional behavior, relevant scope, observable acceptance criteria, factual technical context, and a high-level proposed solution.

Never ask the user about the current tech stack, files, components, libraries, or implementation. Use technical details only when they come from the issue, comments, supplied logs, or repository summary.

Good open questions concern user needs, acceptance criteria, edge cases, and scope — never discovery of the current code.

If the goal, key requirements, and scope are reasonably clear, produce the compact JSON ticket immediately. Put remaining functional uncertainties into openQuestions.

ALWAYS respond with ONLY one valid JSON object matching the exact schema from the user message. Never add explanations, Markdown fences, or surrounding text.`;
```

Replace `CORE_RULES` with:

```ts
export const CORE_RULES = `### Core rules (very important)
- Focus exclusively on what should be built and how success can be observed.
- Do not ask the user for current implementation details, existing components, libraries, CSS, files, or architecture.
- If a Repository Summary section is provided, use it as factual codebase context for technicalContext and proposedSolution.
- Only mention technical details present in the issue, comments, supplied logs, or repository summary. Clearly mark assumptions.
- Read the full conversation history. Do not repeat questions the user already answered.
- Good openQuestions concern desired behavior, acceptance criteria, edge cases, scope, or success conditions.
- Bad openQuestions concern the current tech stack, files, components, libraries, or implementation.
- If the goal, key requirements, and scope are reasonably clear, output the compact ticket and keep only genuine remaining functional uncertainties in openQuestions.
- For every array field, output clean single-line strings with no leading whitespace, Markdown bullets, indentation, or embedded lists.`;
```

Replace `CLARIFICATION_GUIDANCE` with:

```ts
export const CLARIFICATION_GUIDANCE = `### Clarification vs. Proposal
- Carefully read the full conversation history. Do not repeat questions already answered in previous comments.
- When information is clearly insufficient, ask only new questions that define the desired outcome or success conditions.
- Good questions ask about the main user goal, observable acceptance criteria, personas, explicit scope boundaries, hard product constraints, or expected error and edge-case behavior.
- Never ask about the current tech stack, frameworks, libraries, components, files, architecture, or implementation details.
- As soon as the goal, key requirements, and scope are reasonably clear, stop asking and produce the compact ticket. Keep any remaining functional uncertainty in openQuestions.
- Prefer a useful ticket with clearly marked uncertainty over repeated technical probing.`;
```

Replace the additional formatting block with:

```ts
'Additional formatting:',
'- description items are paragraphs; keep each array item self-contained and single-line.',
'- Put all observable, testable completion conditions into acceptanceCriteria.',
'- technicalContext must distinguish known facts from clearly marked assumptions and must never invent logs.',
'- Items in proposedSolution must not contain numeric prefixes because the renderer adds numbering.',
'- openQuestions must contain only unanswered functional or product questions.',
```

Replace `getOpencodeAgentBasePrompt` with:

```ts
export function getOpencodeAgentBasePrompt(): string {
  return `You are Dev-Assist, an expert at turning rough GitLab issues into compact, actionable, developer-ready tickets.

Core mandate:
- Produce a compact four-section ticket covering description, acceptance criteria, technical context and proposed solution.
- Focus on what should be built: goal, user value, functional behavior, scope, observable completion criteria, and an actionable high-level solution.
- If a repository summary is provided, use it only as supporting factual codebase context.
- Never ask the user about existing implementation, libraries, components, files, or architecture.
- Read the full comment history. Do not repeat questions that were already answered.
- As soon as the goal, key requirements, and scope are reasonably clear, produce the structured JSON ticket and put remaining functional uncertainties into openQuestions.
- ALWAYS output ONLY the exact JSON schema supplied in the user message. No explanations, Markdown fences, or extra text.

The user message contains the current issue, recent comments, optional repository context, and the complete current schema and field rules. Obey that runtime contract exactly.`;
}
```

- [ ] **Step 4: Align the static OpenCode prompt**

In `.opencode/prompts/requirement-analysis.md`, keep the source-of-truth header and replace the Core mandate bullets with:

```markdown
Core mandate:
- Produce a compact four-section ticket covering description, acceptance criteria, technical context and proposed solution.
- Focus on what should be built: goal, user value, functional behavior, scope, observable completion criteria, and an actionable high-level solution.
- If a repository summary is provided, use it only as supporting factual codebase context.
- Never ask the user about existing implementation, libraries, components, or architecture.
- Read the full comment history. Do not repeat questions that were already answered.
- As soon as the goal, key requirements, and scope are reasonably clear, produce the structured JSON ticket and put remaining functional uncertainties into openQuestions.
- ALWAYS output ONLY the exact JSON schema supplied in the user message. No explanations, Markdown fences, or extra text.
```

- [ ] **Step 5: Run prompt and full regression verification**

Run: `npx tsx --test tests/aiPrompt.test.ts`

Expected: PASS, including both compact-prompt assertions.

Run: `npm test`

Expected: PASS with 0 failures.

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 6: Commit analyzer alignment**

```powershell
git add -p -- tests/aiPrompt.test.ts src/services/ai/instructions.ts .opencode/prompts/requirement-analysis.md
git diff --cached --check
git diff --cached
git commit -m "feat: align analyzer with compact ticket format"
```

Expected: only plan-authored hunks in the three listed files are included. If patch staging cannot isolate them from pre-existing work, do not create this commit.

---

### Task 3: Prove Publisher Compatibility and Complete Verification

**Files:**
- Create: `tests/publisher.test.ts`
- Modify: `src/services/processing/publisher.ts`

**Interfaces:**
- Consumes: compact Markdown from `renderRequirementAnalysis` and legacy Markdown already stored in `context.md`.
- Produces: exported `renderPublishedDescription(markdown: string): string` with unchanged cleanup behavior.
- Preserves: `publishIssue(...)` behavior and all GitLab side effects.

- [ ] **Step 1: Write failing compatibility tests**

Create `tests/publisher.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderPublishedDescription } from '../src/services/processing/publisher';

describe('published issue description rendering', () => {
  it('leaves compact four-section Markdown unchanged', () => {
    const compact = [
      '## 📋 Description',
      '',
      'Compact description.',
      '',
      '## 🎯 Acceptance Criteria',
      '',
      '- Observable outcome',
      '',
      '## 📁 Technical Context & Logs',
      '',
      '- Known fact',
      '',
      '## 💡 Proposed Solution',
      '',
      '1. Implement the change',
    ].join('\n');

    assert.equal(renderPublishedDescription(compact), `${compact}\n`);
  });

  it('keeps legacy context publishable while removing its embedded title', () => {
    const legacy = [
      '# Dev-Assist Context',
      '',
      '## Implementation Ticket (ready for development)',
      '',
      '### Title',
      '',
      'Legacy title',
      '',
      '### Goal',
      '',
      'Legacy goal',
    ].join('\n');

    const rendered = renderPublishedDescription(legacy);
    assert.doesNotMatch(rendered, /Legacy title/);
    assert.match(rendered, /### Goal\n\nLegacy goal/);
  });
});
```

- [ ] **Step 2: Run the publisher test and verify RED**

Run: `npx tsx --test tests/publisher.test.ts`

Expected: FAIL because `renderPublishedDescription` is not exported.

- [ ] **Step 3: Export the existing pure publisher helper**

In `src/services/processing/publisher.ts`, change only the function declaration:

```ts
export function renderPublishedDescription(markdown: string): string {
```

Do not change its cleanup expressions or `publishIssue`.

- [ ] **Step 4: Run compatibility and full verification**

Run: `npx tsx --test tests/publisher.test.ts`

Expected: PASS, 2 tests and 0 failures.

Run: `npm test`

Expected: PASS with 0 failures.

Run: `npm run build`

Expected: exit code 0.

Run: `git diff --check`

Expected: no whitespace errors in the complete implementation diff.

Run: `rg -n "implementationTicket|sourceBasis|technicalNotes|validationSteps|renderList\('Scope'" src .opencode`

Expected: no matches. General prose may still use words such as “summary,” “risks,” or “scope”; removed legacy JSON property names must not remain.

- [ ] **Step 5: Commit compatibility coverage**

```powershell
git add -- tests/publisher.test.ts
git add -p -- src/services/processing/publisher.ts
git diff --cached --check
git diff --cached
git commit -m "test: cover compact ticket publishing"
```

Expected: only plan-authored changes in the two listed files are included. If either file acquired unrelated work before execution, use `git add -p` and skip the commit if the hunks cannot be isolated.

- [ ] **Step 6: Inspect final scope before handoff**

Run: `git status --short`

Expected: pre-existing unrelated user changes may remain. Every plan-authored change is either committed in an isolated hunk or deliberately left unstaged and called out because safe separation was impossible.

Run: `git log -3 --oneline`

Expected when all commits could be isolated safely, newest commits are `test: cover compact ticket publishing`, `feat: align analyzer with compact ticket format`, and `refactor: adopt compact ticket analysis contract`. If a commit was skipped to protect pre-existing work, report that explicitly and leave those plan-authored changes unstaged.
