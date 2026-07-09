import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as publisher from '../src/services/processing/publisher';

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

    assert.equal(publisher.renderPublishedDescription(compact), `${compact}\n`);
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

    const rendered = publisher.renderPublishedDescription(legacy);
    assert.doesNotMatch(rendered, /Legacy title/);
    assert.match(rendered, /### Goal\n\nLegacy goal/);
  });

  it('prepares a legacy title and title-free description when metadata is absent', () => {
    const legacy = [
      '# Dev-Assist Context',
      '',
      '## Implementation Ticket (ready for development)',
      '',
      '### Title',
      '',
      'Legacy fallback title',
      '',
      '### Goal',
      '',
      'Legacy fallback goal',
    ].join('\n');
    const preparePublishedIssueUpdate = Reflect.get(publisher, 'preparePublishedIssueUpdate');

    assert.equal(typeof preparePublishedIssueUpdate, 'function');
    assert.deepEqual(preparePublishedIssueUpdate(legacy, {}), {
      title: 'Legacy fallback title',
      description: [
        '# Dev-Assist Context',
        '',
        '## Implementation Ticket (ready for development)',
        '',
        '### Goal',
        '',
        'Legacy fallback goal',
        '',
      ].join('\n'),
    });
  });
});
