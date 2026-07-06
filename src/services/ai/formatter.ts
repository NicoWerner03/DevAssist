import { RequirementAnalysis } from './schema.js';

export function renderGitLabComment(analysis: RequirementAnalysis): string {
  // Deprecated for main flow (full proposal now posted directly as comment).
  // Kept for reference.
  const t = analysis.implementationTicket || ({} as any);
  const lines = [
    '## Dev-Assist Proposal',
    '',
    `**Suggested title:** ${t.title || '(see full context)'}`,
    '',
    'I analyzed the ticket and prepared a structured version.',
    'Reply with `@dev-assist publish` to apply it (this comment and the conversation will be cleaned up).',
    '',
    'Full structured context is available in the attached context file (or will be written alongside).',
  ];
  return lines.join('\n');
}

export function renderClarificationComment(analysis: RequirementAnalysis): string {
  const questions = (analysis.openQuestions || []).filter(Boolean);
  const t = analysis.implementationTicket || ({} as any);

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
  lines.push(`(Current best guess for title: ${t.title || '(unknown)'})`);

  return lines.join('\n');
}

/**
 * Optional: Can be used to give users guidance on how to answer clarification requests.
 * Not used in the runtime flow, but helpful for documentation or manual replies.
 */
export function getClarificationReplyTemplate(): string {
  return `@dev-assist

**Answers to your questions:**

- **Specific purpose / feature:**  
  [Briefly describe what exactly should be built or changed.]

- **Key requirements / user stories / acceptance criteria:**  
  - As a [role] I want [goal], so that [benefit].
  - [Additional user story]
  - Acceptance Criteria:
    - [ ] ...
    - [ ] ...

- **Type:**  
  [ ] Bugfix  
  [ ] New feature  
  [ ] Refactoring / Tech Debt  
  [ ] Other: ...

- **Technical constraints / dependencies / approaches:**  
  - Tech stack / affected services: ...
  - Existing dependencies: ...
  - Preferred approach (if known): ...
  - What should explicitly NOT be done: ...

**Additional useful information:**
- Current behavior (for bugs)
- Expected behavior
- Affected files / components (if known)
- Links to related issues, docs or code
- Priority / Deadline
`;
}

function renderList(title: string, items?: string[]): string {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return `### ${title}\nNot enough information available yet.`;
  }

  // Clean items: trim, remove empty, collapse internal newlines
  const cleaned = items
    .map(i => String(i || '').trim().replace(/\s*\n\s*/g, ' ').trim())
    .filter(i => i.length > 0);

  if (cleaned.length === 0) {
    return `### ${title}\nNot enough information available yet.`;
  }

  // Detect if the section is still mostly placeholder / missing real info
  const weakCount = cleaned.filter(i => 
    /to be refined|not specified|as a user, i can|the system must support|to be confirmed|unknown|placeholder/i.test(i)
  ).length;

  if (weakCount === cleaned.length || weakCount / cleaned.length >= 0.75) {
    return `### ${title}\nNot enough information available yet.`;
  }

  const content = cleaned.map(i => `- ${i}`).join('\n');

  return `### ${title}\n${content}`;
}

export function renderRequirementAnalysis(analysis: RequirementAnalysis, extra?: { project?: any; issue?: any }): string {
  const t = analysis.implementationTicket || ({} as any);
  const hasMissingInfo = Array.isArray(analysis.openQuestions) && analysis.openQuestions.length > 0;

  const lines: string[] = [
    '# Dev-Assist Context',
    '',
    '## Summary',
    '',
    (hasMissingInfo && (!analysis.summary || /to be refined|not specified/i.test(analysis.summary)))
      ? 'Not enough information available yet.'
      : (analysis.summary || 'Not enough information available yet.'),
    '',
    '## Implementation Ticket (ready for development)',
    '',
    ...(hasMissingInfo
      ? [
          '_Note: This ticket was published while some information was still missing. Sections without sufficient details are marked with "Not enough information available yet." directly under the heading._',
          '',
        ]
      : []),
    `### Goal`,
    '',
    t.goal || 'Not enough information available yet.',
    '',
    renderList('Scope', t.scope),
    '',
    renderList('Out of scope', t.outOfScope),
    '',
    renderList('User stories', t.userStories),
    '',
    renderList('Functional requirements', t.functionalRequirements),
    '',
    renderList('Technical approach', t.technicalApproach),
    '',
    renderList('Implementation tasks', t.implementationTasks),
    '',
    renderList('Definition of done', t.definitionOfDone),
    '',
    renderList('Acceptance Criteria (summary)', analysis.acceptanceCriteria),
    '',
    renderList('Technical Notes', analysis.technicalNotes),
    '',
    renderList('Open Questions', analysis.openQuestions),
    '',
    renderList('Risks and Assumptions', analysis.risks),
    '',
    renderList('Validation Steps', analysis.validationSteps),
    '',
    '---',
    '_Generated by Dev-Assist. The original conversation was removed on publish._',
  ];
  return lines.join('\n');
}
