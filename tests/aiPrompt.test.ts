import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildUserPrompt, createAiService } from '../src/services/ai/service';
import { removeAnsweredOpenQuestions } from '../src/services/ai/clarifications';

describe('AI prompt construction', () => {
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

  it('removes rephrased open questions when the original clarification was answered', () => {
    const analysis = {
      summary: 'Theme toggle',
      sourceBasis: 'ticket_text' as const,
      implementationTicket: {
        title: 'Add theme toggle',
        goal: 'Add theme switching.',
        scope: [],
        outOfScope: [],
        userStories: [],
        functionalRequirements: [],
        technicalApproach: [],
        implementationTasks: [],
        definitionOfDone: [],
      },
      acceptanceCriteria: [],
      technicalNotes: [],
      openQuestions: [
        'If the user has not explicitly selected a theme, should the application continue reacting to system color-scheme changes after initial load, or is first-load detection sufficient?',
      ],
      risks: [],
      validationSteps: [],
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
