import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildUserPrompt, createAiService } from '../src/services/ai/service';
import { removeAnsweredOpenQuestions } from '../src/services/ai/clarifications';
import { renderRequirementAnalysis } from '../src/services/ai/formatter';
import type { RequirementAnalysis } from '../src/services/ai/schema';

describe('AI prompt construction', () => {
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

  it('includes repository summary when available', () => {
    const prompt = buildUserPrompt({
      issue: {
        title: 'Add passkey login',
        description: '@dev-assist Users should be able to log in with passkeys.',
      },
      repositorySummary: '## Technology Stack\n- Express API with TypeScript',
    });

    assert.match(prompt, /## Repository Summary/);
    assert.match(prompt, /Express API with TypeScript/);
    assert.match(prompt, /## Existing GitLab Issue/);
  });

  it('summarizes prior Dev-Assist questions with user replies before analysis', () => {
    const prompt = buildUserPrompt({
      issue: {
        title: 'Add dark mode toggle',
        description: 'Users need a theme toggle.',
      },
      comments: [
        {
          author: { username: 'dev-assist' },
          body: [
            '## Dev-Assist: More information needed',
            '',
            '**Please reply with answers to these questions** (mention `@dev-assist` again with the details):',
            '',
            '- Should the application react to changes in the system color scheme after initial load?',
          ].join('\n'),
        },
        {
          author: { username: 'product' },
          body: [
            '@dev-assist',
            '',
            '- Should the application react to changes in the system color scheme after initial load?',
            '  - no info',
          ].join('\n'),
        },
      ],
    });

    assert.match(prompt, /## Prior Clarification Answers/);
    assert.match(prompt, /Should the application react to changes in the system color scheme after initial load\?/);
    assert.match(prompt, /no info/);
    assert.match(prompt, /Do not ask these answered questions again/);
  });

  it('removes open questions that match prior Dev-Assist questions with user replies', async () => {
    const originalProvider = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = 'mock';

    try {
      const analysis = await createAiService().analyzeTicket({
        issue: {
          title: 'Improve onboarding',
          description: '@dev-assist Make onboarding clearer.',
        },
        comments: [
          {
            author: { username: 'dev-assist' },
            body: [
              '## Dev-Assist: More information needed',
              '',
              '- Are there any acceptance criteria or edge cases not mentioned?',
            ].join('\n'),
          },
          {
            author: { username: 'product' },
            body: [
              '@dev-assist',
              '',
              '- Are there any acceptance criteria or edge cases not mentioned?',
              '  - no info',
            ].join('\n'),
          },
        ],
      });

      assert.deepEqual(analysis.openQuestions, []);
    } finally {
      if (originalProvider === undefined) {
        delete process.env.AI_PROVIDER;
      } else {
        process.env.AI_PROVIDER = originalProvider;
      }
    }
  });

  it('keeps mock analysis grounded and stores its distinctive title outside rendered Markdown', async () => {
    const originalProvider = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = 'mock';
    const distinctiveTitle = 'QUASAR-731: Synchronize moon-phase reminders';

    try {
      const analysis = await createAiService().analyzeTicket({
        issue: {
          title: distinctiveTitle,
          description: '@dev-assist Add the requested reminder behavior.',
        },
      });
      const rendered = renderRequirementAnalysis(analysis);

      assert.equal(analysis.title, distinctiveTitle);
      assert.doesNotMatch(rendered, new RegExp(distinctiveTitle));
      assert.deepEqual(analysis.technicalContext, []);
      assert.doesNotMatch(
        analysis.proposedSolution.join('\n'),
        /handler|service|error mapping|automated tests?/i,
      );
    } finally {
      if (originalProvider === undefined) {
        delete process.env.AI_PROVIDER;
      } else {
        process.env.AI_PROVIDER = originalProvider;
      }
    }
  });

  it('removes rephrased open questions when the original clarification was answered', () => {
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

    const filtered = removeAnsweredOpenQuestions(analysis, [
      {
        body: [
          '## Dev-Assist: More information needed',
          '',
          '- Should the application react to changes in the system color scheme after initial load when the user has not explicitly chosen a theme, or is detection only required on first load?',
        ].join('\n'),
      },
      {
        body: [
          '@dev-assist',
          '',
          '- Should the application react to changes in the system color scheme after initial load when the user has not explicitly chosen a theme, or is detection only required on first load?',
          '  - no info',
        ].join('\n'),
      },
    ]);

    assert.deepEqual(filtered.openQuestions, []);
  });
});
