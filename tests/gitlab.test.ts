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

  it('accepts an issue when @dev-assist appears in the title only', () => {
    const parsed = parseGitLabWebhook({
      object_kind: 'issue',
      project: { id: 123 },
      object_attributes: {
        iid: 42,
        title: 'Dark mode toggle @dev-assist',
        description: 'Bitte strukturiere dieses Ticket.',
        action: 'open',
      },
    });

    assert.equal(parsed.shouldProcess, true);
    assert.equal(parsed.command, 'process');
  });

  it('accepts issue descriptions with @dev-assist anywhere in the text', () => {
    const parsed = parseGitLabWebhook({
      object_kind: 'issue',
      project: { id: 123 },
      object_attributes: {
        iid: 42,
        title: 'Test issue',
        description: 'Bitte Ticket strukturieren. Danke @dev-assist',
        action: 'open',
      },
    });

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

  it('detects publish commands when @dev-assist appears anywhere in a comment', () => {
    const parsed = parseGitLabWebhook({
      object_kind: 'note',
      project: { id: 123 },
      issue: {
        iid: 42,
        title: 'Test issue',
        description: 'Existing issue text',
      },
      object_attributes: {
        note: 'looks good, @dev-assist publish please',
        action: 'create',
      },
    });

    assert.equal(parsed.shouldProcess, true);
    assert.equal(parsed.command, 'publish');
  });

  it('ignores comments authored by the dev-assist bot account', () => {
    const parsed = parseGitLabWebhook({
      object_kind: 'note',
      user: {
        username: 'dev-assist',
      },
      project: { id: 123 },
      issue: {
        iid: 42,
        title: 'Test issue',
        description: 'Existing issue text',
      },
      object_attributes: {
        note: 'If you approve, reply with @dev-assist publish.',
        action: 'create',
      },
    });

    assert.equal(parsed.shouldProcess, false);
    assert.equal(parsed.ignoredReason, 'self-authored');
  });

  it('ignores Dev-Assist generated comments even when they are posted by a user account', () => {
    const parsed = parseGitLabWebhook({
      object_kind: 'note',
      user: {
        username: 'nico03werner',
      },
      project: { id: 123 },
      issue: {
        iid: 42,
        title: 'Test issue',
        description: 'Existing issue text',
      },
      object_attributes: {
        note: [
          '## Dev-Assist: More information needed',
          '',
          'Please reply with answers to these questions (mention `@dev-assist` again with the details):',
          '',
          '- Should the application continue following operating system theme changes?',
          '',
          'Once I have the missing pieces I will post a full structured proposal and you can use `@dev-assist publish` to apply it.',
        ].join('\n'),
        action: 'create',
      },
    });

    assert.equal(parsed.shouldProcess, false);
    assert.equal(parsed.ignoredReason, 'dev-assist-generated');
  });
});
