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
