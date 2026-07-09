import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGlabApiArgs, parseGlabOutput } from '../src/services/gitlab/glab';

describe('glab API helpers', () => {
  it('normalizes API paths and self-managed hostnames for JSON output', () => {
    assert.deepEqual(
      buildGlabApiArgs(['/projects/123/issues'], 'json', ' https://gitlab.example.com/ '),
      ['api', 'projects/123/issues', '--output', 'json', '--hostname', 'gitlab.example.com'],
    );
    assert.deepEqual(
      buildGlabApiArgs(['/123/issues'], 'json', 'gitlab.com'),
      ['api', 'projects/123/issues', '--output', 'json'],
    );
  });

  it('keeps text output raw and omits the JSON flag', () => {
    assert.deepEqual(
      buildGlabApiArgs(['/projects/123/repository/files/README/raw'], 'text'),
      ['api', 'projects/123/repository/files/README/raw'],
    );
    assert.equal(parseGlabOutput('raw file\n', 'text'), 'raw file\n');
  });

  it('parses JSON output with the existing empty-output fallback', () => {
    assert.deepEqual(parseGlabOutput('{"id":123}', 'json'), { id: 123 });
    assert.equal(parseGlabOutput('', 'json'), null);
  });
});
