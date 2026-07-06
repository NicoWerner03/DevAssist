import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildUserPrompt } from '../src/services/ai/service';

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
});
