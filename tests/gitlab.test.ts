import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitLabWebhook } from '../src/services/gitlab/parser';

describe('GitLab webhook parsing', () => {
  it('accepts an issue when the description starts with @dev-assist', () => {
    const parsed = parseGitLabWebhook({
      object_kind: 'issue',
      project: { id: 123 },
      object_attributes: {
        iid: 42,
        title: 'Test issue',
        description: '@dev-assist Bitte Ticket strukturieren',
        action: 'open',
      },
    });

    assert.equal(parsed.kind, 'issue');
    assert.equal(parsed.projectId, 123);
    assert.equal(parsed.issueIid, 42);
    assert.equal(parsed.shouldProcess, true);
    assert.equal(parsed.command, 'process');
  });

  it('detects publish commands from GitLab issue comments', () => {
    const parsed = parseGitLabWebhook({
      object_kind: 'note',
      project: { id: 123 },
      issue: {
        iid: 42,
        title: 'Test issue',
        description: 'Existing issue text',
      },
      object_attributes: {
        note: '@dev-assist publish',
        action: 'create',
      },
    });

    assert.equal(parsed.kind, 'note');
    assert.equal(parsed.shouldProcess, true);
    assert.equal(parsed.command, 'publish');
  });
});
