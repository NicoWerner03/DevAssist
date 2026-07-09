import { RequirementAnalysis } from './schema.js';

export function renderClarificationComment(analysis: RequirementAnalysis): string {
  const questions = (analysis.openQuestions || []).filter(Boolean);

  const lines: string[] = [
    '## Dev-Assist: More information needed',
    '',
    'I looked at the issue, but there is not enough detail yet to create a solid, developer-ready ticket.',
    '',
    '**Important:** I only ask about requirements, user needs, acceptance criteria, scope and success criteria. I do **not** need details about the current codebase, tech stack, specific components or existing implementation — the developer will handle those.',
  ];

  if (questions.length > 0) {
    lines.push('');
    lines.push('**Please reply with answers to these questions** (mention `@dev-assist` again with the details):');
    lines.push('');
    for (const q of questions) {
      lines.push(`- ${q}`);
    }
  } else {
    lines.push('');
    lines.push('There are several unclear areas regarding the requirements. Please add more context about what the feature should do, acceptance criteria, edge cases or scope.');
  }

  lines.push('');
  lines.push('Once I have the missing pieces I will post a full structured proposal and you can use `@dev-assist publish` to apply it.');
  lines.push('');
  lines.push(`(Current best guess for title: ${analysis.title || '(unknown)'})`);

  return lines.join('\n');
}

const MISSING_INFORMATION = 'Not enough information available yet.';

function cleanItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item || '').trim().replace(/\s*(?:\r\n?|\n)\s*/g, ' '))
    .filter(Boolean);
}

function stripNumberPrefix(item: string): string {
  return item.replace(/^\d+[.)]\s*/, '');
}

function neutralizeLeadingBlockSyntax(item: string): string {
  if (/^(?:-(?:[ \t]*-){2,}|\*(?:[ \t]*\*){2,}|_(?:[ \t]*_){2,})$/.test(item)) {
    return `\\${item}`;
  }

  return item
    .replace(/^(#{1,6})(?=\s)/, '\\$1')
    .replace(/^(`{3,}|~{3,})/, '\\$1')
    .replace(/^>/, '\\>')
    .replace(/^([-+*])(?=\s)/, '\\$1')
    .replace(/^(\d{1,9})([.)])(?=\s)/, '$1\\$2');
}

function renderDescription(items: unknown): string {
  const cleaned = cleanItems(items);
  return cleaned.length > 0 ? cleaned.map(neutralizeLeadingBlockSyntax).join('\n\n') : MISSING_INFORMATION;
}

function renderBullets(items: unknown): string {
  const cleaned = cleanItems(items);
  return cleaned.length > 0
    ? cleaned.map((item) => `- ${neutralizeLeadingBlockSyntax(item)}`).join('\n')
    : MISSING_INFORMATION;
}

function renderOrdered(items: unknown): string {
  const cleaned = cleanItems(items).map(stripNumberPrefix).filter(Boolean);
  return cleaned.length > 0
    ? cleaned.map((item, index) => `${index + 1}. ${neutralizeLeadingBlockSyntax(item)}`).join('\n')
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
